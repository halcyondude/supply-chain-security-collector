"""Command line interface: python -m sbom_corpus <command> [options].

Pipeline: inventory -> fetch -> load (DuckDB) -> graph (LadybugDB) -> query.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import telemetry
from .config import BUCKETS, DEFAULT_DATA_DIR, S3_ENDPOINT

log = logging.getLogger("sbom_corpus")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m sbom_corpus",
        description="Load the cncf/sbom SBOM corpus into DuckDB (relational) and LadybugDB (graph).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="working directory for all outputs")
    p.add_argument("--verbose", action="store_true", help="debug logging and console OpenTelemetry export")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("inventory", help="list the buckets into inventory.parquet",
                       formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    s.add_argument("--bucket", action="append", choices=BUCKETS, help="bucket to list (repeatable; default all)")
    s.add_argument("--endpoint", default=S3_ENDPOINT)

    s = sub.add_parser("fetch", help="mirror selected SBOMs from the inventory",
                       formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    s.add_argument("--strategy", default="latest-per-project",
                   choices=["latest-per-project", "latest-per-repo", "all"])
    s.add_argument("--bucket", action="append", choices=BUCKETS)
    s.add_argument("--limit", type=int, help="cap the number of objects")
    s.add_argument("--endpoint", default=S3_ENDPOINT)

    s = sub.add_parser("bomhort", help="list BOMHort's SBOMs and mirror the newest per project (current corpus)",
                       formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    s.add_argument("--limit", type=int, help="cap the number of projects")
    s.add_argument("--inventory-only", action="store_true")

    s = sub.add_parser("load", help="normalize mirrored SPDX 2.x documents into DuckDB base_sbom_* tables",
                       formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    s.add_argument("--extra", type=Path, action="append", default=[],
                   help="extra SPDX JSON files or directories (e.g. release-attached or Waybill SBOMs)")
    s.add_argument("--collector-db", type=Path,
                   help="collector database.db or Parquet dir; joins overlays (repos, releases, assets, tools)")
    s.add_argument("--sbom-repo-dir", type=Path,
                   help="local cncf/sbom util/data dir for the repo lists (default: fetch from GitHub)")

    sub.add_parser("graph", help="build the LadybugDB property graph from the DuckDB tables")

    s = sub.add_parser("query", help="run a named Cypher query against the graph",
                       formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    s.add_argument("name", help="query name, or 'list'")
    s.add_argument("--param", action="append", default=[], metavar="KEY=VALUE")
    s.add_argument("--limit", type=int, default=25)

    sub.add_parser("profile", help="print field fill rates and edge statistics from DuckDB")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    telemetry.setup(args.verbose)
    d: Path = args.data_dir
    if args.command == "inventory":
        from . import inventory
        print(inventory.run(d, tuple(args.bucket or BUCKETS), args.endpoint))
    elif args.command == "fetch":
        from . import fetch
        print(fetch.run(d, fetch.Strategy(args.strategy), args.bucket, args.limit, args.endpoint))
    elif args.command == "bomhort":
        from . import bomhort
        print(bomhort.inventory(d) if args.inventory_only else bomhort.fetch_latest(d, args.limit))
    elif args.command == "load":
        from . import load
        print(load.run(d, args.extra, args.collector_db, args.sbom_repo_dir))
    elif args.command == "graph":
        from . import graph
        print(graph.run(d))
    elif args.command == "query":
        from . import queries
        return queries.run(d, args.name, dict(kv.split("=", 1) for kv in args.param), args.limit)
    elif args.command == "profile":
        from . import load
        load.profile(d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
