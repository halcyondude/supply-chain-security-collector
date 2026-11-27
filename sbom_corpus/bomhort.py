"""Read the current cncf/sbom corpus through BOMHort's public, read-only REST API.

The publicly listable OCI bucket is a frozen Mar–May 2026 snapshot. BOMHort
(bomhort.cncf.io) ingests the live buckets, and its API lists every SBOM and
streams the raw document (/sboms/{id}/download). Until CNCF publishes the live
buckets or an export, this is the way to the Waybill-era corpus.

Be a good citizen: this is a shared production service (rate limit 100
requests / 10 s per IP). Defaults stay well below that.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

import duckdb

from . import http, telemetry
from .config import BOMHORT_API, HttpSettings

log = logging.getLogger(__name__)
PAGE_SIZE: int = 500  # server-side maximum for /sboms
POLITE: HttpSettings = HttpSettings(max_requests_per_s=4.0, max_concurrency=4)
MIRROR_BUCKET: str = "bomhort"  # objects/<MIRROR_BUCKET>/<project>/<version>/<id>_spdx.json
_SAFE = re.compile(r"[^A-Za-z0-9._-]")


async def _list_all(out: Path) -> int:
    n, page = 0, 1
    async with http.client(POLITE) as c:
        with out.open("w") as f:
            while True:
                r = await c.get(f"{BOMHORT_API}/sboms", params={"page": page, "page_size": PAGE_SIZE})
                r.raise_for_status()
                body = r.json()
                for row in body.get("data") or []:
                    f.write(json.dumps(row) + "\n")
                    n += 1
                if page * PAGE_SIZE >= int(body.get("total", 0)) or not body.get("data"):
                    break
                page += 1
    return n


def inventory(data_dir: Path) -> Path:
    """Write data_dir/bomhort_inventory.parquet (one row per SBOM BOMHort holds)."""
    data_dir.mkdir(parents=True, exist_ok=True)
    tmp = data_dir / "bomhort_inventory.jsonl"
    with telemetry.tracer(__name__).start_as_current_span("bomhort.inventory") as span:
        n = asyncio.run(_list_all(tmp))
        span.set_attribute("sboms", n)
    out = data_dir / "bomhort_inventory.parquet"
    duckdb.sql(
        f"""COPY (SELECT *,
                   regexp_extract(source_file, '^s3://([^/]+)/', 1) AS bucket,
                   regexp_extract(source_file, '^s3://[^/]+/(.*)$', 1) AS object_key
                  FROM read_json('{tmp}', format='newline_delimited'))
            TO '{out}' (FORMAT parquet)"""
    )
    log.info("BOMHort lists %d SBOMs", n)
    return out


_SELECT_SQL: str = """
SELECT sbom_id, project, coalesce(document_version, source_ref, 'unknown') AS version
FROM (
    SELECT *, row_number() OVER (PARTITION BY project ORDER BY ingested_at DESC, sbom_id) rn
    FROM read_parquet('{inv}')
    WHERE bucket = 'cncf-project-sboms' AND project IS NOT NULL
) WHERE rn = 1
ORDER BY ingested_at DESC
{limit}
"""


async def _download(c, sem: asyncio.Semaphore, sbom_id: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    async with sem:
        async with c.stream("GET", f"{BOMHORT_API}/sboms/{sbom_id}/download") as r:
            if r.status_code != 200:
                log.warning("download %s: HTTP %d", sbom_id, r.status_code)
                return False
            with tmp.open("wb") as f:
                async for chunk in r.aiter_bytes(1 << 20):
                    f.write(chunk)
    tmp.replace(dest)
    return True


def fetch_latest(data_dir: Path, limit: int | None = None) -> Path:
    """Mirror the newest SBOM of each CNCF project from BOMHort."""
    inv = data_dir / "bomhort_inventory.parquet"
    if not inv.exists():
        inventory(data_dir)
    picks = duckdb.sql(_SELECT_SQL.format(inv=inv, limit=f"LIMIT {int(limit)}" if limit else "")).fetchall()
    root = data_dir / "objects" / MIRROR_BUCKET

    async def _all() -> list[bool]:
        sem = asyncio.Semaphore(POLITE.max_concurrency)
        async with http.client(POLITE) as c:
            return await asyncio.gather(*(
                _download(c, sem, sid, root / _SAFE.sub("_", p) / _SAFE.sub("_", v) / f"{sid}_spdx.json")
                for sid, p, v in picks
            ))

    got = asyncio.run(_all())
    log.info("BOMHort: selected %d, downloaded %d new", len(picks), sum(got))
    return root
