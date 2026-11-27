"""Select SBOM objects from the inventory and mirror them locally.

Objects are streamed to disk chunk by chunk and skipped when a file of the same
size is already present, so a fetch can be resumed and never buffers a document.
"""

from __future__ import annotations

import asyncio
import logging
from enum import StrEnum
from pathlib import Path

import duckdb

from . import http, telemetry
from .config import S3_ENDPOINT, HttpSettings

log = logging.getLogger(__name__)
CHUNK_BYTES: int = 1 << 20


class Strategy(StrEnum):
    latest_per_project = "latest-per-project"  # newest SBOM of each project folder
    latest_per_repo = "latest-per-repo"  # newest SBOM of each project and subproject folder
    all = "all"


# Window key: the folder that identifies one repository in each bucket layout.
_SELECT_SQL: str = """
WITH sboms AS (
    SELECT *,
           CASE WHEN bucket = 'cncf-project-sboms' THEN project_slug
                ELSE project_slug || '/' || coalesce(subproject, '') END AS folder
    FROM read_parquet('{inventory}')
    WHERE kind = 'spdx' AND NOT is_bomhort_copy {bucket_filter}
)
SELECT bucket, key, size FROM (
    SELECT *, row_number() OVER (PARTITION BY bucket, folder
                                 ORDER BY last_modified DESC, key DESC) AS rn
    FROM sboms
) WHERE {rank_filter}
ORDER BY bucket, key
{limit}
"""


def select(inventory: Path, strategy: Strategy, buckets: list[str] | None, limit: int | None) -> list[tuple[str, str, int]]:
    sql = _SELECT_SQL.format(
        inventory=inventory,
        bucket_filter=f"AND bucket IN ({', '.join(repr(b) for b in buckets)})" if buckets else "",
        rank_filter="TRUE" if strategy is Strategy.all else "rn = 1",
        limit=f"LIMIT {int(limit)}" if limit else "",
    )
    if strategy is Strategy.latest_per_project:
        sql = sql.replace("WHERE kind = 'spdx'", "WHERE bucket = 'cncf-project-sboms' AND kind = 'spdx'")
    return [(b, k, int(s)) for b, k, s in duckdb.sql(sql).fetchall()]


async def _download(c, sem: asyncio.Semaphore, endpoint: str, bucket: str, key: str, size: int, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size == size:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    async with sem:
        async with c.stream("GET", f"{endpoint}/{bucket}/{key}") as resp:
            resp.raise_for_status()
            with tmp.open("wb") as f:
                async for chunk in resp.aiter_bytes(CHUNK_BYTES):
                    f.write(chunk)
    tmp.replace(dest)
    return True


def run(data_dir: Path, strategy: Strategy, buckets: list[str] | None = None,
        limit: int | None = None, endpoint: str = S3_ENDPOINT) -> Path:
    """Mirror the selected objects under data_dir/objects/<bucket>/<key>."""
    inventory = data_dir / "inventory.parquet"
    if not inventory.exists():
        raise FileNotFoundError(f"{inventory} missing; run the 'inventory' command first")
    picks = select(inventory, strategy, buckets, limit)
    root = data_dir / "objects"
    settings = HttpSettings()
    tr = telemetry.tracer(__name__)

    async def _all() -> list[bool]:
        sem = asyncio.Semaphore(settings.max_concurrency)
        async with http.client(settings) as c:
            return await asyncio.gather(*(
                _download(c, sem, endpoint, b, k, s, root / b / k) for b, k, s in picks
            ))

    with tr.start_as_current_span("fetch.run") as span:
        fetched = asyncio.run(_all())
        span.set_attribute("selected", len(picks))
        span.set_attribute("downloaded", sum(fetched))
    log.info("selected %d objects (%.2f GB), downloaded %d new", len(picks),
             sum(s for _, _, s in picks) / 1e9, sum(fetched))
    return root
