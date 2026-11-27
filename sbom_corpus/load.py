"""Normalize SPDX 2.x JSON documents into DuckDB base_sbom_* tables.

Works for every generator found in the corpus (Waybill, mikebom, sigs.k8s.io/bom,
and imported release SBOMs such as syft), keyed on the fields cncf/sbom's
post-processing guarantees: document name, root purl pkg:github/<owner>/<repo>@<tag>,
root downloadLocation, and the bucket key. Older objects predate that
post-processing, so repository and tag fall back to other fields (see
_DOCUMENT_SQL).

Documents are read in fixed-size batches with read_json_objects, so peak memory
is bounded by the batch, not by the corpus. DuckDB spills to temp_directory.
"""

from __future__ import annotations

import logging
from pathlib import Path

import duckdb

from . import ref, telemetry
from .config import DEPENDENCY_SCOPES, PROJECT_BUCKET, REVERSED_DEPENDENCY_TYPES, DuckDbSettings

log = logging.getLogger(__name__)
DB_NAME: str = "sbom.duckdb"

# Go vanity import prefixes that map to GitHub repositories. Extend as needed;
# github.com/<owner>/<repo>/... paths need no entry.
GO_VANITY_PREFIXES: dict[str, str] = {
    "k8s.io/": "kubernetes/",
    "sigs.k8s.io/": "kubernetes-sigs/",
    "go.etcd.io/etcd": "etcd-io/etcd",
    "go.etcd.io/bbolt": "etcd-io/bbolt",
    "go.etcd.io/raft": "etcd-io/raft",
    "go.opentelemetry.io/collector": "open-telemetry/opentelemetry-collector",
    "go.opentelemetry.io/contrib": "open-telemetry/opentelemetry-go-contrib",
    "go.opentelemetry.io/otel": "open-telemetry/opentelemetry-go",
    "go.opentelemetry.io/proto/otlp": "open-telemetry/opentelemetry-proto-go",
    "helm.sh/helm": "helm/helm",
    "oras.land/oras-go": "oras-project/oras-go",
    "cuelang.org/go": "cue-lang/cue",
    "go.uber.org/zap": "uber-go/zap",
    "google.golang.org/grpc": "grpc/grpc-go",
    "google.golang.org/protobuf": "protocolbuffers/protobuf-go",
    "golang.org/x/": "golang/",
    "gopkg.in/yaml.v3": "go-yaml/yaml",
    "istio.io/": "istio/",
    "knative.dev/": "knative/",
    "tags.cncf.io/container-device-interface": "cncf-tags/container-device-interface",
    "dario.cat/mergo": "darccio/mergo",
}

DDL: str = """
CREATE TABLE IF NOT EXISTS base_sbom_documents (
    sbom_id VARCHAR PRIMARY KEY, source VARCHAR, bucket VARCHAR, object_key VARCHAR,
    project_slug VARCHAR, subproject VARCHAR, key_version VARCHAR,
    spdx_version VARCHAR, document_name VARCHAR, document_namespace VARCHAR,
    created TIMESTAMPTZ, creators VARCHAR, generator VARCHAR, generator_version VARCHAR,
    root_spdx_id VARCHAR, root_name VARCHAR, root_version VARCHAR, root_purl VARCHAR,
    root_supplier VARCHAR, owner_repo VARCHAR, tag VARCHAR,
    package_count INTEGER, relationship_count INTEGER, file_count INTEGER,
    graph_completeness VARCHAR, go_transitive_coverage VARCHAR, scope_comment VARCHAR
);
CREATE TABLE IF NOT EXISTS base_sbom_packages (
    sbom_id VARCHAR, spdx_id VARCHAR, name VARCHAR, version VARCHAR,
    purl VARCHAR, purl_type VARCHAR, package_key VARCHAR, source_owner_repo VARCHAR,
    license_declared VARCHAR, license_concluded VARCHAR, supplier VARCHAR,
    download_location VARCHAR, sha256 VARCHAR, has_checksum BOOLEAN,
    primary_purpose VARCHAR, lifecycle_scope VARCHAR, sbom_tier VARCHAR, is_root BOOLEAN
);
CREATE TABLE IF NOT EXISTS base_sbom_relationships (
    sbom_id VARCHAR, from_spdx_id VARCHAR, relationship_type VARCHAR, to_spdx_id VARCHAR
);
CREATE TABLE IF NOT EXISTS base_sbom_annotations (
    sbom_id VARCHAR, spdx_element VARCHAR, annotator VARCHAR, annotation_type VARCHAR,
    field VARCHAR, value VARCHAR, comment VARCHAR
);
"""

# One row per document. `j` is the whole document as JSON.
_DOCUMENT_SQL: str = """
WITH d AS (
    SELECT filename, j,
           coalesce(j->>'$.documentDescribes[0]',
                    (SELECT r->>'relatedSpdxElement'
                     FROM unnest(CAST(j->'$.relationships' AS JSON[])) t(r)
                     WHERE r->>'spdxElementId' = 'SPDXRef-DOCUMENT' AND r->>'relationshipType' = 'DESCRIBES'
                     LIMIT 1)) AS root_id,
           array_to_string(CAST(j->'$.creationInfo.creators' AS VARCHAR[]), '; ') AS creators
    FROM batch
), r AS (
    SELECT d.*,
           (SELECT p FROM unnest(CAST(j->'$.packages' AS JSON[])) t(p) WHERE p->>'SPDXID' = root_id LIMIT 1) AS root
    FROM d
), x AS (
    SELECT r.*,
           (SELECT e->>'referenceLocator' FROM unnest(CAST(root->'$.externalRefs' AS JSON[])) t(e)
            WHERE e->>'referenceType' = 'purl' LIMIT 1) AS root_purl,
           (SELECT a->>'comment' FROM unnest(CAST(j->'$.annotations' AS JSON[])) t(a)
            WHERE a->>'comment' LIKE '%Repository:%' LIMIT 1) AS bom_note,
           regexp_extract(filename, '/objects/([^/]+)/', 1) AS bucket,
           regexp_extract(filename, '/objects/[^/]+/(.*)$', 1) AS object_key
    FROM r
)
SELECT
    CASE WHEN bucket <> '' THEN bucket || '/' || object_key ELSE 'extra/' || parse_filename(filename) END,
    CASE WHEN bucket <> '' THEN 'bucket' ELSE 'extra' END,
    nullif(bucket, ''), nullif(object_key, ''),
    CASE WHEN bucket <> '' THEN split_part(object_key, '/', 1) END,
    CASE WHEN bucket <> '' AND bucket <> '{project_bucket}' AND len(string_split(object_key, '/')) >= 3
         THEN split_part(object_key, '/', 2) END,
    CASE WHEN bucket <> '' AND len(string_split(object_key, '/')) >= 3
         THEN string_split(object_key, '/')[-2] END,
    j->>'$.spdxVersion', j->>'$.name', j->>'$.documentNamespace',
    try_cast(j->>'$.creationInfo.created' AS TIMESTAMPTZ), creators,
    CASE WHEN creators ILIKE '%waybill%' THEN 'waybill'
         WHEN creators ILIKE '%mikebom%' THEN 'mikebom'
         WHEN creators ILIKE '%bom-v%' THEN 'k8s-bom'
         WHEN creators ILIKE '%syft%' THEN 'syft'
         WHEN creators ILIKE '%trivy%' THEN 'trivy'
         ELSE 'other' END,
    regexp_extract(creators, '(?:waybill|mikebom|bom|syft|trivy)-v?([0-9][^; ]*)', 1),
    root_id, root->>'name', root->>'versionInfo', root_purl, root->>'supplier',
    lower(coalesce(
        nullif(regexp_extract(root_purl, '^pkg:github/([^@]+)@', 1), ''),
        nullif(regexp_extract(bom_note, 'Repository: ([^\\n]+)', 1), ''),
        nullif(regexp_extract(creators, 'source: (?:repo|git):https://github.com/([^/]+/[^/#.]+)', 1), ''),
        nullif(regexp_extract(j->>'$.documentNamespace', '^https://github.com/([^/]+/[^/]+)', 1), '')
    )),
    coalesce(
        nullif(url_decode(regexp_extract(root_purl, '^pkg:github/[^@]+@(.+)$', 1)), ''),
        nullif(regexp_extract(bom_note, 'Version: ([^\\n]+)', 1), ''),
        nullif(regexp_extract(creators, 'source: git:[^#]+#([^; ]+)', 1), ''),
        nullif(regexp_extract(j->>'$.documentNamespace', '/releases/tag/(.+)$', 1), '')
    ),
    json_array_length(j->'$.packages'), json_array_length(j->'$.relationships'),
    coalesce(json_array_length(j->'$.files'), 0),
    (SELECT a->>'comment' FROM unnest(CAST(j->'$.annotations' AS JSON[])) t(a)
     WHERE a->>'comment' LIKE '%waybill:graph-completeness%' LIMIT 1)::JSON->>'value',
    (SELECT a->>'comment' FROM unnest(CAST(j->'$.annotations' AS JSON[])) t(a)
     WHERE a->>'comment' LIKE '%waybill:go-transitive-coverage%' LIMIT 1)::JSON->>'value',
    j->>'$.creationInfo.comment'
FROM x
"""

_PACKAGE_SQL: str = """
WITH p AS (
    SELECT b.sbom_id, d.root_spdx_id, unnest(CAST(b.j->'$.packages' AS JSON[])) AS p
    FROM batch_ids b JOIN base_sbom_documents d USING (sbom_id)
), q AS (
    SELECT *,
        (SELECT e->>'referenceLocator' FROM unnest(CAST(p->'$.externalRefs' AS JSON[])) t(e)
         WHERE e->>'referenceType' = 'purl' LIMIT 1) AS purl,
        (SELECT c->>'checksumValue' FROM unnest(CAST(p->'$.checksums' AS JSON[])) t(c)
         WHERE c->>'algorithm' = 'SHA256' LIMIT 1) AS sha256,
        json_array_length(p->'$.checksums') AS n_checksums,
        list_transform(CAST(p->'$.annotations' AS JSON[]), lambda a: try_cast(a->>'comment' AS JSON)) AS ann
    FROM p
), k AS (
    SELECT *,
        lower(regexp_extract(purl, '^pkg:([^/]+)/', 1)) AS purl_type,
        -- package identity: purl without version, qualifiers or subpath
        regexp_replace(regexp_replace(purl, '[?#].*$', ''), '@[^@/]*$', '') AS purl_base
    FROM q
)
SELECT sbom_id, p->>'SPDXID', p->>'name',
       coalesce(nullif(p->>'versionInfo', 'NOASSERTION'),
                nullif(url_decode(regexp_extract(regexp_replace(purl, '[?#].*$', ''), '@([^@/]+)$', 1)), '')),
       purl, nullif(purl_type, ''),
       coalesce(nullif(purl_base, ''), 'name:' || lower(p->>'name')),
       {source_repo_sql},
       nullif(p->>'licenseDeclared', 'NOASSERTION'), nullif(p->>'licenseConcluded', 'NOASSERTION'),
       nullif(p->>'supplier', 'NOASSERTION'), nullif(p->>'downloadLocation', 'NOASSERTION'),
       sha256, coalesce(n_checksums, 0) > 0, p->>'primaryPackagePurpose',
       list_filter(ann, lambda a: a->>'field' = 'waybill:lifecycle-scope')[1]->>'value',
       list_filter(ann, lambda a: a->>'field' = 'waybill:sbom-tier')[1]->>'value',
       p->>'SPDXID' = root_spdx_id
FROM k
"""

_RELATIONSHIP_SQL: str = """
SELECT sbom_id, r->>'spdxElementId', r->>'relationshipType', r->>'relatedSpdxElement'
FROM (SELECT sbom_id, unnest(CAST(j->'$.relationships' AS JSON[])) AS r FROM batch_ids)
"""

_ANNOTATION_SQL: str = """
WITH a AS (
    SELECT sbom_id, 'SPDXRef-DOCUMENT' AS el, unnest(CAST(j->'$.annotations' AS JSON[])) AS a FROM batch_ids
    UNION ALL
    SELECT sbom_id, p->>'SPDXID', unnest(CAST(p->'$.annotations' AS JSON[]))
    FROM (SELECT sbom_id, unnest(CAST(j->'$.packages' AS JSON[])) AS p FROM batch_ids)
)
SELECT sbom_id, el, a->>'annotator', a->>'annotationType',
       try_cast(a->>'comment' AS JSON)->>'field',
       CASE WHEN json_type(try_cast(a->>'comment' AS JSON)->'value') = 'VARCHAR'
            THEN try_cast(a->>'comment' AS JSON)->>'value'
            ELSE CAST(try_cast(a->>'comment' AS JSON)->'value' AS VARCHAR) END,
       a->>'comment'
FROM a
"""

# Legacy objects predate post-processing: fill owner/repo and tag from the bucket
# key and cncf/sbom's repo lists (ref_sbom_repos).
FILL_FROM_KEY_SQL: str = """
UPDATE base_sbom_documents d SET owner_repo = r.owner_repo
FROM (SELECT project_slug, min(owner_repo) AS owner_repo FROM ref_sbom_repos
      WHERE source IN ('cncf', 'manual') GROUP BY 1) r
WHERE d.owner_repo IS NULL AND d.bucket = 'cncf-project-sboms' AND d.subproject IS NULL
  AND d.project_slug = r.project_slug;
UPDATE base_sbom_documents d SET owner_repo = r.owner_repo
FROM (SELECT project_slug, repo, min(owner_repo) AS owner_repo FROM ref_sbom_repos GROUP BY 1, 2) r
WHERE d.owner_repo IS NULL AND d.subproject = r.repo
  AND (d.project_slug = r.project_slug OR d.project_slug = split_part(r.owner_repo, '/', 1));
UPDATE base_sbom_documents SET tag = key_version WHERE tag IS NULL;
"""

# Derived tables, rebuilt after every load.
DERIVED_SQL: str = f"""
CREATE OR REPLACE TABLE base_sbom_dependencies AS
SELECT sbom_id,
       CASE WHEN relationship_type IN ({", ".join(repr(t) for t in sorted(REVERSED_DEPENDENCY_TYPES))})
            THEN to_spdx_id ELSE from_spdx_id END AS dependent_spdx_id,
       CASE WHEN relationship_type IN ({", ".join(repr(t) for t in sorted(REVERSED_DEPENDENCY_TYPES))})
            THEN from_spdx_id ELSE to_spdx_id END AS dependency_spdx_id,
       relationship_type,
       CASE relationship_type {" ".join(f"WHEN '{t}' THEN '{s}'" for t, s in DEPENDENCY_SCOPES.items())} END AS scope
FROM base_sbom_relationships
WHERE relationship_type IN ({", ".join(repr(t) for t in DEPENDENCY_SCOPES)});

-- One row per release (owner/repo@tag) with its preferred SBOM: project-wide
-- release asset or Waybill scan first, newest document first.
-- version_norm drops a leading 'v' so bucket versions (no 'v') join GitHub tags.
CREATE OR REPLACE TABLE base_sbom_releases AS
SELECT * EXCLUDE (rn) FROM (
    SELECT owner_repo, tag, regexp_replace(tag, '^[vV]', '') AS version_norm,
           owner_repo || '@' || regexp_replace(tag, '^[vV]', '') AS release_key,
           sbom_id, project_slug, subproject, generator, created,
           row_number() OVER (PARTITION BY owner_repo, regexp_replace(tag, '^[vV]', '')
                              ORDER BY created DESC NULLS LAST, sbom_id) AS rn
    FROM base_sbom_documents WHERE owner_repo IS NOT NULL AND tag IS NOT NULL
) WHERE rn = 1;
"""


def _source_repo_sql() -> str:
    """SQL expression mapping a purl to the GitHub owner/repo that publishes it."""
    gh = "regexp_extract(purl, '^pkg:github/([^/@]+/[^/@?#]+)', 1)"
    go_gh = "regexp_extract(purl, '^pkg:golang/github\\.com/([^/@]+/[^/@?#]+)', 1)"
    go_path = "regexp_extract(purl, '^pkg:golang/([^@?#]+)', 1)"
    vanity = " ".join(
        f"WHEN starts_with({go_path}, '{prefix}') THEN "
        + (
            f"'{target}' || split_part(substr({go_path}, {len(prefix) + 1}), '/', 1)"
            if target.endswith("/")
            else f"'{target}'"
        )
        for prefix, target in GO_VANITY_PREFIXES.items()
    )
    return (
        f"lower(coalesce(nullif({gh}, ''), nullif({go_gh}, ''), "
        f"CASE {vanity} ELSE NULL END))"
    )


def connect(data_dir: Path, settings: DuckDbSettings | None = None) -> duckdb.DuckDBPyConnection:
    s = settings or DuckDbSettings()
    Path(s.temp_directory).mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(data_dir / DB_NAME))
    con.execute(f"SET memory_limit='{s.memory_limit}'; SET threads={s.threads}; "
                f"SET temp_directory='{s.temp_directory}'; SET preserve_insertion_order=false;")
    return con


def _files(data_dir: Path, extra: list[Path]) -> list[Path]:
    files = sorted((data_dir / "objects").rglob("*_spdx.json"))
    for e in extra:
        files += sorted(e.rglob("*.json")) if e.is_dir() else [e]
    return files


def run(data_dir: Path, extra: list[Path] | None = None, collector: Path | None = None,
        sbom_repo_dir: Path | None = None, settings: DuckDbSettings | None = None) -> Path:
    s = settings or DuckDbSettings()
    con = connect(data_dir, s)
    con.execute(DDL)
    done = {r[0] for r in con.execute("SELECT sbom_id FROM base_sbom_documents").fetchall()}
    files = _files(data_dir, extra or [])
    tr = telemetry.tracer(__name__)
    pkg_sql = _PACKAGE_SQL.format(source_repo_sql=_source_repo_sql())
    loaded = 0
    with tr.start_as_current_span("load.run") as span:
        for i in range(0, len(files), s.batch_files):
            chunk = [str(f.resolve()) for f in files[i:i + s.batch_files]]
            con.execute(
                f"CREATE OR REPLACE TEMP TABLE batch AS SELECT filename, json AS j FROM read_json_objects("
                f"{chunk}, format='unstructured', filename=true, maximum_object_size={s.maximum_object_size})"
            )
            con.execute("DELETE FROM batch WHERE j->>'$.spdxVersion' NOT LIKE 'SPDX-2%' OR j->>'$.spdxVersion' IS NULL")
            con.execute(f"CREATE OR REPLACE TEMP TABLE docs AS {_DOCUMENT_SQL.format(project_bucket=PROJECT_BUCKET)}")
            con.execute("DELETE FROM docs WHERE #1 IN (SELECT sbom_id FROM base_sbom_documents)")
            con.execute("INSERT INTO base_sbom_documents SELECT * FROM docs")
            con.execute(
                "CREATE OR REPLACE TEMP TABLE batch_ids AS SELECT d.sbom_id, b.j FROM batch b "
                "JOIN base_sbom_documents d ON d.sbom_id = CASE WHEN regexp_extract(b.filename, '/objects/([^/]+)/', 1) <> '' "
                "THEN regexp_extract(b.filename, '/objects/(.*)$', 1) ELSE 'extra/' || parse_filename(b.filename) END "
                "WHERE d.sbom_id NOT IN (SELECT unnest(?::VARCHAR[]))", [sorted(done)]
            )
            con.execute(f"INSERT INTO base_sbom_packages {pkg_sql}")
            con.execute(f"INSERT INTO base_sbom_relationships {_RELATIONSHIP_SQL}")
            con.execute(f"INSERT INTO base_sbom_annotations {_ANNOTATION_SQL}")
            n = con.execute("SELECT count(*) FROM batch_ids").fetchone()[0]
            done |= {r[0] for r in con.execute("SELECT sbom_id FROM batch_ids").fetchall()}
            loaded += n
            log.info("batch %d: %d documents (%d/%d files)", i // s.batch_files + 1, n, i + len(chunk), len(files))
        log.info("ref_sbom_repos: %d rows", ref.load(con, local_dir=sbom_repo_dir))
        con.execute(FILL_FROM_KEY_SQL)
        con.execute(DERIVED_SQL)
        if collector:
            load_collector_overlays(con, collector)
        span.set_attribute("documents", loaded)
    con.close()
    return data_dir / DB_NAME


# Collector tables used as overlays, read from a Parquet directory
# (e.g. site/public/data from PR #120) or an attached database.duckdb.
COLLECTOR_TABLES: tuple[str, ...] = (
    "base_repositories", "base_releases", "base_cncf_projects", "base_cncf_project_repos",
    "agg_artifact_patterns", "agg_workflow_tools", "agg_repo_summary", "base_branch_protection_rules",
)


def load_collector_overlays(con: duckdb.DuckDBPyConnection, collector: Path) -> None:
    """Copy collector tables in as collector_* so the graph can join overlays."""
    if collector.is_dir():
        for t in COLLECTOR_TABLES:
            f = collector / f"{t}.parquet"
            if f.exists():
                con.execute(f"CREATE OR REPLACE TABLE collector_{t} AS SELECT * FROM read_parquet('{f}')")
            else:
                log.warning("collector table %s not found in %s", t, collector)
    else:
        con.execute(f"ATTACH '{collector}' AS c (READ_ONLY)")
        have = {r[0] for r in con.execute("SELECT table_name FROM information_schema.tables WHERE table_catalog='c'").fetchall()}
        for t in COLLECTOR_TABLES:
            if t in have:
                con.execute(f"CREATE OR REPLACE TABLE collector_{t} AS SELECT * FROM c.{t}")
        con.execute("DETACH c")


PROFILE_SQL: dict[str, str] = {
    "documents by generator": """
        SELECT generator, count(*) docs, round(avg(package_count)) avg_pkgs,
               round(avg(relationship_count)) avg_rels, sum(file_count) files,
               count(*) FILTER (WHERE root_purl LIKE 'pkg:github/%') root_pkg_github,
               count(*) FILTER (WHERE owner_repo IS NOT NULL) has_repo,
               count(*) FILTER (WHERE tag IS NOT NULL) has_tag
        FROM base_sbom_documents GROUP BY ALL ORDER BY docs DESC""",
    "package field fill rate by generator (%)": """
        SELECT d.generator, count(*) pkgs,
               round(100 * avg((p.purl IS NOT NULL)::INT), 1) purl,
               round(100 * avg((p.version IS NOT NULL)::INT), 1) version,
               round(100 * avg((p.license_declared IS NOT NULL)::INT), 1) lic_declared,
               round(100 * avg((p.license_concluded IS NOT NULL)::INT), 1) lic_concluded,
               round(100 * avg(p.has_checksum::INT), 1) checksum,
               round(100 * avg((p.supplier IS NOT NULL)::INT), 1) supplier,
               round(100 * avg((p.source_owner_repo IS NOT NULL)::INT), 1) source_repo
        FROM base_sbom_packages p JOIN base_sbom_documents d USING (sbom_id)
        WHERE NOT p.is_root GROUP BY ALL ORDER BY pkgs DESC""",
    "dependency edges by generator": """
        SELECT d.generator, e.scope, count(*) edges,
               count(*) FILTER (WHERE e.dependent_spdx_id = d.root_spdx_id) from_root,
               round(100.0 * count(*) FILTER (WHERE e.dependent_spdx_id <> d.root_spdx_id) / count(*), 1) pct_transitive
        FROM base_sbom_dependencies e JOIN base_sbom_documents d USING (sbom_id)
        GROUP BY ALL ORDER BY d.generator, edges DESC""",
    "purl types": """
        SELECT purl_type, count(*) n, count(DISTINCT package_key) distinct_packages
        FROM base_sbom_packages WHERE NOT is_root GROUP BY ALL ORDER BY n DESC LIMIT 15""",
}


def profile(data_dir: Path) -> None:
    con = connect(data_dir)
    for title, sql in PROFILE_SQL.items():
        print(f"\n## {title}")
        print(con.sql(sql))
    con.close()
