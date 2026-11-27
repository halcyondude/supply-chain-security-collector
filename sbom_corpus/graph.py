"""Build the LadybugDB property graph: cncf/sbom base layer + collector overlays.

Every node and rel table is materialised by one DuckDB query (GRAPH_TABLES),
written to Parquet, and bulk-loaded with COPY FROM. DuckDB guarantees unique
primary keys and that every rel endpoint exists, which LadybugDB requires.

Base layer (from cncf/sbom):  Project, Repository, Release, Sbom, Package,
  PackageVersion, License; HAS_REPO, HAS_RELEASE, DESCRIBED_BY, INCLUDES,
  DEPENDS_ON, VERSION_OF, DECLARES, PUBLISHED_FROM, DEPENDS_ON_REPO.
Overlays (from the collector, only when collector_* tables exist):
  ReleaseAsset, Tool; HAS_ASSET, USES_TOOL; signal properties on Repository.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

import duckdb
import real_ladybug as lb

from . import telemetry
from .load import connect

log = logging.getLogger(__name__)
GRAPH_DIR: str = "graph.lbug"
# Versions that mean "not resolved" across the generators seen in the corpus.
UNRESOLVED_VERSION_RE: str = r"(?i)(^|[-.])unknown$|^v?0\.0\.0$|^noassertion$|^$"
EXPORT_DIR: str = "graph-parquet"


@dataclass(frozen=True)
class GraphTable:
    name: str
    ddl: str
    sql: str
    overlay: bool = False  # needs collector_* tables


# Preferred SBOM per release; every base-layer table builds on it.
PREAMBLE_SQL: str = """
CREATE OR REPLACE TEMP VIEW rel_sbom AS
SELECT r.release_key, r.owner_repo, r.tag, r.version_norm, d.*  EXCLUDE (owner_repo, tag)
FROM base_sbom_releases r JOIN base_sbom_documents d USING (sbom_id);

-- A package version is global (shared by every release that uses it) unless the
-- scanner could not resolve a version: workspace modules and local packages
-- (v0.0.0-unknown, 0.0.0, NOASSERTION) stay local to their release, or they
-- would bridge unrelated SBOMs into false paths.
CREATE OR REPLACE TEMP VIEW pkg AS
SELECT p.*,
       CASE WHEN p.version IS NULL OR regexp_matches(p.version, '{unresolved_version_re}')
            THEN p.package_key || '@local:' || s.release_key
            ELSE p.package_key || '@' || p.version END AS pv_id,
       s.release_key
FROM base_sbom_packages p JOIN rel_sbom s USING (sbom_id)
WHERE NOT p.is_root;

-- Scope of each package within its SBOM: strongest scope among incoming edges,
-- then Waybill's lifecycle annotation, else unknown.
CREATE OR REPLACE TEMP VIEW pkg_scope AS
SELECT e.sbom_id, e.dependency_spdx_id AS spdx_id,
       CASE WHEN bool_or(e.scope = 'runtime') THEN 'runtime'
            WHEN bool_or(e.scope = 'build') THEN 'build'
            WHEN bool_or(e.scope = 'test') THEN 'test'
            WHEN bool_or(e.scope = 'dev') THEN 'dev' ELSE min(e.scope) END AS scope,
       bool_or(e.dependent_spdx_id = d.root_spdx_id) AS direct
FROM base_sbom_dependencies e JOIN rel_sbom d USING (sbom_id)
GROUP BY ALL;

-- Repositories that publish packages, as owner/repo, limited to repos CNCF tracks.
CREATE OR REPLACE TEMP VIEW tracked_repo AS
SELECT DISTINCT owner_repo FROM ref_sbom_repos
UNION SELECT DISTINCT owner_repo FROM base_sbom_releases;
"""

GRAPH_TABLES: tuple[GraphTable, ...] = (
    GraphTable("Project",
               "CREATE NODE TABLE Project(id STRING PRIMARY KEY, name STRING, status STRING)",
               """SELECT project_slug AS id, min(project_name) AS name, min(project_status) AS status
                  FROM ref_sbom_repos WHERE project_slug IS NOT NULL AND project_slug <> ''
                  GROUP BY 1"""),
    GraphTable("Repository",
               """CREATE NODE TABLE Repository(id STRING PRIMARY KEY, owner STRING, name STRING,
                  in_cncf_lists BOOLEAN, has_sbom BOOLEAN, has_signature_artifact BOOLEAN,
                  has_sbom_artifact BOOLEAN, has_attestation_artifact BOOLEAN, uses_signer BOOLEAN,
                  uses_sbom_generator BOOLEAN)""",
               """WITH ids AS (
                      SELECT owner_repo AS id FROM tracked_repo
                      UNION SELECT DISTINCT source_owner_repo FROM pkg
                      WHERE source_owner_repo IN (SELECT owner_repo FROM tracked_repo)
                  )
                  SELECT i.id, split_part(i.id, '/', 1), split_part(i.id, '/', 2),
                         i.id IN (SELECT owner_repo FROM ref_sbom_repos),
                         i.id IN (SELECT owner_repo FROM base_sbom_releases),
                         {overlay_cols}
                  FROM ids i {overlay_join}"""),
    GraphTable("Release",
               """CREATE NODE TABLE Release(id STRING PRIMARY KEY, tag STRING, version STRING,
                  in_corpus BOOLEAN, in_collector BOOLEAN)""",
               """SELECT release_key AS id, min(tag), min(version_norm), bool_or(src = 'sbom'), bool_or(src = 'collector')
                  FROM (SELECT release_key, tag, version_norm, 'sbom' AS src FROM base_sbom_releases
                        {collector_releases})
                  GROUP BY 1"""),
    GraphTable("Sbom",
               """CREATE NODE TABLE Sbom(id STRING PRIMARY KEY, origin STRING, generator STRING,
                  generator_version STRING, created TIMESTAMP, package_count INT64,
                  dependency_edges INT64, transitive_edges INT64, graph_completeness STRING)""",
               """SELECT d.sbom_id, coalesce(d.bucket, d.source), d.generator, d.generator_version,
                         CAST(d.created AS TIMESTAMP), d.package_count,
                         count(e.sbom_id), count(e.sbom_id) FILTER (WHERE e.dependent_spdx_id <> d.root_spdx_id),
                         d.graph_completeness
                  FROM rel_sbom d LEFT JOIN base_sbom_dependencies e USING (sbom_id)
                  GROUP BY ALL"""),
    GraphTable("Package",
               "CREATE NODE TABLE Package(id STRING PRIMARY KEY, purl_type STRING, name STRING)",
               "SELECT package_key, min(purl_type), min(name) FROM pkg GROUP BY 1"),
    GraphTable("PackageVersion",
               """CREATE NODE TABLE PackageVersion(id STRING PRIMARY KEY, version STRING,
                  license_declared STRING, license_concluded STRING)""",
               """SELECT pv_id, min(version), max(license_declared), max(license_concluded)
                  FROM pkg GROUP BY 1"""),
    GraphTable("License",
               "CREATE NODE TABLE License(id STRING PRIMARY KEY)",
               """SELECT DISTINCT coalesce(license_declared, license_concluded) FROM pkg
                  WHERE coalesce(license_declared, license_concluded) IS NOT NULL"""),
    # --- rels -------------------------------------------------------------
    GraphTable("HAS_REPO",
               "CREATE REL TABLE HAS_REPO(FROM Project TO Repository, role STRING)",
               """SELECT project_slug AS "from", owner_repo AS "to",
                         CASE WHEN bool_or(source IN ('cncf', 'manual')) THEN 'primary' ELSE 'subproject' END
                  FROM ref_sbom_repos WHERE project_slug IS NOT NULL AND project_slug <> '' GROUP BY 1, 2"""),
    GraphTable("HAS_RELEASE",
               "CREATE REL TABLE HAS_RELEASE(FROM Repository TO Release)",
               """SELECT DISTINCT split_part(release_key, '@', 1) AS "from", release_key AS "to"
                  FROM (SELECT release_key FROM base_sbom_releases {collector_releases_keys})
                  WHERE split_part(release_key, '@', 1) IN (SELECT owner_repo FROM tracked_repo)"""),
    GraphTable("DESCRIBED_BY",
               "CREATE REL TABLE DESCRIBED_BY(FROM Release TO Sbom)",
               'SELECT release_key AS "from", sbom_id AS "to" FROM rel_sbom'),
    GraphTable("INCLUDES",
               "CREATE REL TABLE INCLUDES(FROM Release TO PackageVersion, scope STRING, direct BOOLEAN)",
               """SELECT p.release_key AS "from", p.pv_id AS "to",
                         coalesce(min(s.scope), min(p.lifecycle_scope), 'unknown'), coalesce(bool_or(s.direct), false)
                  FROM pkg p LEFT JOIN pkg_scope s ON s.sbom_id = p.sbom_id AND s.spdx_id = p.spdx_id
                  GROUP BY 1, 2"""),
    GraphTable("DEPENDS_ON",
               # One edge per release that asserts it: traversals filter on `release`
               # so a path never mixes edges from different SBOMs.
               """CREATE REL TABLE DEPENDS_ON(FROM PackageVersion TO PackageVersion, scope STRING,
                  release STRING)""",
               """SELECT a.pv_id AS "from", b.pv_id AS "to", min(e.scope), a.release_key
                  FROM base_sbom_dependencies e
                  JOIN pkg a ON a.sbom_id = e.sbom_id AND a.spdx_id = e.dependent_spdx_id
                  JOIN pkg b ON b.sbom_id = e.sbom_id AND b.spdx_id = e.dependency_spdx_id
                  WHERE a.pv_id <> b.pv_id GROUP BY 1, 2, 4"""),
    GraphTable("VERSION_OF",
               "CREATE REL TABLE VERSION_OF(FROM PackageVersion TO Package)",
               'SELECT DISTINCT pv_id AS "from", package_key AS "to" FROM pkg'),
    GraphTable("DECLARES",
               "CREATE REL TABLE DECLARES(FROM PackageVersion TO License)",
               """SELECT DISTINCT pv_id AS "from", coalesce(license_declared, license_concluded) AS "to"
                  FROM pkg WHERE coalesce(license_declared, license_concluded) IS NOT NULL"""),
    GraphTable("PUBLISHED_FROM",
               "CREATE REL TABLE PUBLISHED_FROM(FROM Package TO Repository)",
               """SELECT DISTINCT package_key AS "from", source_owner_repo AS "to" FROM pkg
                  WHERE source_owner_repo IN (SELECT owner_repo FROM tracked_repo)"""),
    # Rolled-up repo -> repo edge for views that cannot afford package detail.
    GraphTable("DEPENDS_ON_REPO",
               """CREATE REL TABLE DEPENDS_ON_REPO(FROM Repository TO Repository, packages INT64,
                  runtime BOOLEAN, release STRING)""",
               """WITH latest AS (
                      SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY owner_repo
                                     ORDER BY created DESC NULLS LAST) rn FROM rel_sbom) WHERE rn = 1
                  )
                  SELECT l.owner_repo AS "from", p.source_owner_repo AS "to",
                         count(DISTINCT p.package_key), bool_or(coalesce(s.scope, 'runtime') = 'runtime'),
                         min(l.release_key)
                  FROM latest l JOIN pkg p ON p.sbom_id = l.sbom_id
                  LEFT JOIN pkg_scope s ON s.sbom_id = p.sbom_id AND s.spdx_id = p.spdx_id
                  WHERE p.source_owner_repo IN (SELECT owner_repo FROM tracked_repo)
                    AND p.source_owner_repo <> l.owner_repo
                  GROUP BY 1, 2"""),
    # --- collector overlays ------------------------------------------------
    GraphTable("ReleaseAsset",
               """CREATE NODE TABLE ReleaseAsset(id STRING PRIMARY KEY, name STRING, is_sbom BOOLEAN,
                  sbom_format STRING, is_signature BOOLEAN, is_attestation BOOLEAN,
                  is_slsa_provenance BOOLEAN, is_vex BOOLEAN)""",
               """SELECT asset_id, asset_name, is_sbom, sbom_format, is_signature, is_attestation,
                         is_slsa_provenance, is_vex FROM collector_agg_artifact_patterns""",
               overlay=True),
    GraphTable("HAS_ASSET",
               "CREATE REL TABLE HAS_ASSET(FROM Release TO ReleaseAsset)",
               """SELECT DISTINCT cr.release_key AS "from", a.asset_id AS "to"
                  FROM collector_agg_artifact_patterns a JOIN collector_release_keys cr ON cr.release_id = a.release_id""",
               overlay=True),
    GraphTable("Tool",
               "CREATE NODE TABLE Tool(id STRING PRIMARY KEY, category STRING)",
               "SELECT tool_name, min(tool_category) FROM collector_agg_workflow_tools GROUP BY 1",
               overlay=True),
    GraphTable("USES_TOOL",
               "CREATE REL TABLE USES_TOOL(FROM Repository TO Tool, workflows INT64)",
               """SELECT lower(nameWithOwner) AS "from", tool_name AS "to", count(DISTINCT workflow_id)
                  FROM collector_agg_workflow_tools
                  WHERE lower(nameWithOwner) IN (SELECT owner_repo FROM tracked_repo) GROUP BY 1, 2""",
               overlay=True),
)

COLLECTOR_RELEASE_KEYS_SQL: str = """
CREATE OR REPLACE TEMP VIEW collector_release_keys AS
SELECT r.id AS release_id, lower(p.nameWithOwner) || '@' || regexp_replace(r.tagName, '^[vV]', '') AS release_key,
       r.tagName AS tag, regexp_replace(r.tagName, '^[vV]', '') AS version_norm
FROM collector_base_releases r JOIN collector_base_repositories p ON p.id = r.repository_id
WHERE lower(p.nameWithOwner) IN (SELECT owner_repo FROM tracked_repo);
"""

OVERLAY_REPO_COLS: str = (
    "s.has_signature_artifact, s.has_sbom_artifact, s.has_attestation_artifact, s.uses_signer, s.uses_sbom_generator"
)


def _has_overlays(con: duckdb.DuckDBPyConnection) -> bool:
    need = {"collector_agg_artifact_patterns", "collector_agg_workflow_tools", "collector_base_releases",
            "collector_base_repositories", "collector_agg_repo_summary"}
    have = {r[0] for r in con.execute("SELECT table_name FROM information_schema.tables").fetchall()}
    return need <= have


def _render(t: GraphTable, overlays: bool) -> str:
    return t.sql.format(
        overlay_cols=OVERLAY_REPO_COLS if overlays else ", ".join(["NULL::BOOLEAN"] * 5),
        overlay_join="LEFT JOIN collector_agg_repo_summary s ON lower(s.nameWithOwner) = i.id" if overlays else "",
        collector_releases=("UNION ALL SELECT release_key, tag, version_norm, 'collector' FROM collector_release_keys"
                            if overlays else ""),
        collector_releases_keys="UNION SELECT release_key FROM collector_release_keys" if overlays else "",
    )


def run(data_dir: Path) -> Path:
    con = connect(data_dir)
    con.execute(PREAMBLE_SQL.replace("{unresolved_version_re}", UNRESOLVED_VERSION_RE))
    overlays = _has_overlays(con)
    if overlays:
        con.execute(COLLECTOR_RELEASE_KEYS_SQL)
    export = data_dir / EXPORT_DIR
    shutil.rmtree(export, ignore_errors=True)
    export.mkdir(parents=True)
    tables = [t for t in GRAPH_TABLES if overlays or not t.overlay]
    tr = telemetry.tracer(__name__)
    with tr.start_as_current_span("graph.export"):
        for t in tables:
            con.execute(f"COPY ({_render(t, overlays)}) TO '{export / t.name}.parquet' (FORMAT parquet)")
    con.close()

    gdir = data_dir / GRAPH_DIR
    shutil.rmtree(gdir, ignore_errors=True)
    if gdir.exists():
        gdir.unlink()
    db = lb.Database(str(gdir))
    g = lb.Connection(db)
    with tr.start_as_current_span("graph.load") as span:
        for t in tables:
            g.execute(t.ddl)
            g.execute(f"COPY {t.name} FROM '{export / t.name}.parquet'")
            n = duckdb.sql(f"SELECT count(*) FROM '{export / t.name}.parquet'").fetchall()[0][0]
            span.set_attribute(f"rows.{t.name}", n)
            log.info("%-16s %9d rows", t.name, n)
    return gdir
