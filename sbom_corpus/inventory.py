"""List the cncf/sbom buckets anonymously (S3 ListObjectsV2) into Parquet.

The listing is the corpus index: one row per object with its parsed key. It is
written page by page, so memory stays flat however large the buckets grow.
"""

from __future__ import annotations

import asyncio
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb

from . import http, telemetry
from .config import BUCKETS, S3_ENDPOINT, S3_NAMESPACE, S3_PAGE_SIZE
from .keys import parse

log = logging.getLogger(__name__)
NS: str = f"{{{S3_NAMESPACE}}}"
INVENTORY_COLUMNS: str = (
    "bucket VARCHAR, key VARCHAR, size BIGINT, last_modified TIMESTAMPTZ, etag VARCHAR, "
    "kind VARCHAR, is_bomhort_copy BOOLEAN, project_slug VARCHAR, subproject VARCHAR, version VARCHAR"
)


async def _list_bucket(bucket: str, out_jsonl: Path, endpoint: str) -> int:
    import json

    n = 0
    token: str | None = None
    tr = telemetry.tracer(__name__)
    async with http.client() as c:
        with tr.start_as_current_span("inventory.list_bucket") as span, out_jsonl.open("w") as f:
            span.set_attribute("bucket", bucket)
            while True:
                params = {"list-type": "2", "max-keys": str(S3_PAGE_SIZE)}
                if token:
                    params["continuation-token"] = token
                resp = await c.get(f"{endpoint}/{bucket}", params=params)
                if resp.status_code == 404:
                    log.warning("bucket %s not listable (404)", bucket)
                    return 0
                resp.raise_for_status()
                root = ET.fromstring(resp.content)
                for el in root.findall(f"{NS}Contents"):
                    key = el.findtext(f"{NS}Key") or ""
                    k = parse(bucket, key)
                    row = {
                        "bucket": bucket,
                        "key": key,
                        "size": int(el.findtext(f"{NS}Size") or 0),
                        "last_modified": el.findtext(f"{NS}LastModified"),
                        "etag": (el.findtext(f"{NS}ETag") or "").strip('"'),
                        **k.model_dump(exclude={"bucket", "key"}),
                    }
                    f.write(json.dumps(row) + "\n")
                    n += 1
                token = root.findtext(f"{NS}NextContinuationToken")
                if root.findtext(f"{NS}IsTruncated") != "true":
                    break
            span.set_attribute("objects", n)
    log.info("listed %s: %d objects", bucket, n)
    return n


def run(data_dir: Path, buckets: tuple[str, ...] = BUCKETS, endpoint: str = S3_ENDPOINT) -> Path:
    """List buckets and write data_dir/inventory.parquet."""
    data_dir.mkdir(parents=True, exist_ok=True)
    parts = [data_dir / f"inventory-{b}.jsonl" for b in buckets]

    async def _all() -> None:
        await asyncio.gather(*(_list_bucket(b, p, endpoint) for b, p in zip(buckets, parts, strict=True)))

    asyncio.run(_all())
    out = data_dir / "inventory.parquet"
    files = [str(p) for p in parts if p.exists() and p.stat().st_size > 0]
    duckdb.sql(
        f"""COPY (SELECT * FROM read_json({files}, format='newline_delimited',
                 columns={{{_columns_struct()}}}))
            TO '{out}' (FORMAT parquet)"""
    )
    return out


def _columns_struct() -> str:
    cols = [c.strip().split(" ", 1) for c in INVENTORY_COLUMNS.split(",")]
    return ", ".join(f"'{name}': '{typ}'" for name, typ in cols)
