"""cncf/sbom's own repository lists, loaded as the reference table ref_sbom_repos.

These YAML files decide what cncf/sbom scans and which bucket folder each repo
lands in, so they are the authoritative join between bucket keys and
owner/repo (cncf/sbom README "S3 Object Naming Convention").
"""

from __future__ import annotations

import asyncio
import json
import re
import tempfile
from pathlib import Path

import duckdb
import yaml

from . import http

RAW_BASE: str = "https://raw.githubusercontent.com/cncf/sbom/{ref}/util/data/{name}"
REPO_LISTS: dict[str, str] = {
    "cncf": "cncf-projects.yaml",
    "manual": "repositories.yaml",
    "discovered": "discovered-repos.yaml",
}
_SLUG_DROP = re.compile(r"[^a-z0-9-]")


def slugify(name: str) -> str:
    """Same rule as sbom_slugify in cncf/sbom util/sbom-lib.sh."""
    return _SLUG_DROP.sub("", name.lower().replace(" ", "-"))


async def _fetch(ref: str) -> dict[str, str]:
    async with http.client() as c:
        texts = await asyncio.gather(*(c.get(RAW_BASE.format(ref=ref, name=n)) for n in REPO_LISTS.values()))
    for t in texts:
        t.raise_for_status()
    return {src: t.text for src, t in zip(REPO_LISTS, texts, strict=True)}


def rows(sources: dict[str, str]) -> list[dict[str, str | None]]:
    out: list[dict[str, str | None]] = []
    by_repo: dict[str, str] = {}
    for src, text in sources.items():
        for r in (yaml.safe_load(text) or {}).get("repositories", []) or []:
            owner_repo = f"{r['owner']}/{r['repo']}".lower()
            project = r.get("name") if src != "discovered" else r.get("parent_project")
            if src == "cncf":
                by_repo[owner_repo] = r.get("name")
            out.append({
                "source": src,
                "owner_repo": owner_repo,
                "repo": str(r["repo"]).lower(),
                "project_name": project,
                "project_status": r.get("project_status"),
                "parent_repo": (r.get("parent_repo") or "").lower() or None,
                "discovered_by": r.get("discovered_by"),
            })
    for r in out:
        if r["source"] == "discovered" and not r["project_name"]:
            m = re.search(r"from\s+(\S+/\S+)", r["discovered_by"] or "")
            r["project_name"] = by_repo.get(m.group(1).lower()) if m else None
        r["project_slug"] = slugify(r["project_name"]) if r["project_name"] else None
    return out


def load(con: duckdb.DuckDBPyConnection, ref: str = "main", local_dir: Path | None = None) -> int:
    """Create ref_sbom_repos from a local cncf/sbom checkout or from GitHub raw."""
    if local_dir:
        sources = {src: (local_dir / n).read_text() for src, n in REPO_LISTS.items()}
    else:
        sources = asyncio.run(_fetch(ref))
    data = rows(sources)
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        f.writelines(json.dumps(r) + "\n" for r in data)
    con.execute(f"CREATE OR REPLACE TABLE ref_sbom_repos AS SELECT * FROM read_json('{f.name}', format='newline_delimited')")
    Path(f.name).unlink()
    return len(data)
