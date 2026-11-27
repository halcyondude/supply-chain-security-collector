"""Named Cypher queries that answer the initiative's questions on the graph.

python -m sbom_corpus query list
python -m sbom_corpus query blast-radius --param package=pkg:golang/golang.org/x/net
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import real_ladybug as lb

from .graph import GRAPH_DIR


@dataclass(frozen=True)
class Query:
    description: str
    cypher: str
    defaults: dict[str, str] = field(default_factory=dict)


QUERIES: dict[str, Query] = {
    "stats": Query(
        "Node counts by label.",
        "MATCH (n) RETURN label(n) AS label, count(*) AS n ORDER BY n DESC",
    ),
    "blast-radius": Query(
        "#1873 / M1 CVE impact: CNCF projects whose newest scanned release includes any version of a package, "
        "with the strongest scope it appears in.",
        """MATCH (p:Project)-[:HAS_REPO]->(r:Repository)-[:HAS_RELEASE]->(rel:Release)-[i:INCLUDES]->(pv:PackageVersion)
                 -[:VERSION_OF]->(pkg:Package {id: $package})
           RETURN p.id AS project, r.id AS repo, rel.version AS release, pv.version AS dep_version, i.scope AS scope,
                  i.direct AS direct
           ORDER BY project, repo, release DESC LIMIT $limit""",
        {"package": "pkg:golang/golang.org/x/net"},
    ),
    "blast-radius-paths": Query(
        "Dependency chains inside one release's SBOM from a direct dependency to a package (needs real edges, not a flat list).",
        """MATCH (rel:Release {id: $release})-[:INCLUDES {direct: true}]->(a:PackageVersion),
                 (a)-[e:DEPENDS_ON* SHORTEST 1..8 (r, n | WHERE r.release = $release)]->(b:PackageVersion)-[:VERSION_OF]->(:Package {id: $package})
           RETURN a.id AS direct_dependency, length(e) AS hops, b.id AS target LIMIT $limit""",
        {"release": "kubernetes/kubernetes@1.35.0", "package": "pkg:golang/golang.org/x/net"},
    ),
    "license-exposure": Query(
        "M1 license rug-pull: projects that ship packages declaring a license (runtime scope only).",
        """MATCH (p:Project)-[:HAS_REPO]->(:Repository)-[:HAS_RELEASE]->(:Release)-[i:INCLUDES]->(pv:PackageVersion)
                 -[:DECLARES]->(l:License)
           WHERE l.id CONTAINS $license AND i.scope = 'runtime'
           MATCH (pv)-[:VERSION_OF]->(pkg:Package)
           RETURN p.id AS project, count(DISTINCT pkg) AS packages, collect(DISTINCT pkg.id)[1:4] AS examples
           ORDER BY packages DESC LIMIT $limit""",
        {"license": "AGPL"},
    ),
    "cncf-dependencies": Query(
        "Constellation edges: CNCF repos whose newest SBOM pulls packages published by another CNCF-tracked repo.",
        """MATCH (a:Repository)-[d:DEPENDS_ON_REPO]->(b:Repository)
           RETURN a.id AS dependent, b.id AS dependency, d.packages AS packages, d.runtime AS runtime
           ORDER BY packages DESC LIMIT $limit""",
    ),
    "most-depended-on": Query(
        "CNCF-tracked repos ranked by how many other repos depend on them.",
        """MATCH (a:Repository)-[:DEPENDS_ON_REPO]->(b:Repository)
           RETURN b.id AS repo, count(DISTINCT a) AS dependents ORDER BY dependents DESC LIMIT $limit""",
    ),
    "unsigned-dependencies": Query(
        "Overlay: CNCF repos that many others depend on but that publish no signature artifacts (collector).",
        """MATCH (a:Repository)-[:DEPENDS_ON_REPO]->(b:Repository)
           WHERE b.has_signature_artifact = false
           RETURN b.id AS repo, count(DISTINCT a) AS dependents, b.has_sbom_artifact AS publishes_sbom
           ORDER BY dependents DESC LIMIT $limit""",
    ),
    "sbom-quality": Query(
        "Which generator produced each release's preferred SBOM, and whether it has a real graph.",
        """MATCH (s:Sbom)
           RETURN s.generator AS generator, count(*) AS sboms,
                  sum(CASE WHEN s.transitive_edges > 0 THEN 1 ELSE 0 END) AS with_transitive_edges,
                  avg(s.package_count) AS avg_packages
           ORDER BY sboms DESC""",
    ),
}


def run(data_dir: Path, name: str, params: dict[str, str], limit: int) -> int:
    if name == "list":
        for k, q in QUERIES.items():
            print(f"{k:24s} {q.description}")
        return 0
    q = QUERIES[name]
    conn = lb.Connection(lb.Database(str(data_dir / GRAPH_DIR), read_only=True))
    args: dict[str, object] = {**q.defaults, **params}
    if "$limit" in q.cypher:
        args["limit"] = limit
    used = {k: v for k, v in args.items() if f"${k}" in q.cypher}
    res = conn.execute(q.cypher, used)
    cols = res.get_column_names()
    print(" | ".join(cols))
    while res.has_next():
        print(" | ".join(str(v) for v in res.get_next()))
    return 0
