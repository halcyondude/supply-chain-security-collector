# Data Model: Relational Schema

## Overview

The data model consists of two table layers:

1. **Base Tables** (`base_*`) - Normalized relational data from GraphQL
2. **Aggregated Tables** (`agg_*`) - Business insights from SQL models

All tables reside in DuckDB databases (one per query type) and are exported to Parquet files for portable analysis.

## Raw Data Preservation

Raw GraphQL responses are preserved in `raw-responses.jsonl` (JSONL file), NOT in database tables.

**Why JSONL instead of database tables?**
- Append-only for historical tracking
- One line per API call with metadata
- Can be versioned in git (line-based diffs)
- Standard format readable by jq, DuckDB, etc.

**Note:** A `raw_GetRepoDataExtendedInfo` Parquet file IS created during the export phase, but it's derived from the normalized data, not the primary storage method.

## Base Tables (Collection Layer)

These tables are produced by the `neo.ts` → `ArtifactWriter.ts` → normalizer pipeline.

### base_repositories

Core repository metadata from GraphQL.

**Schema:**
```sql
CREATE TABLE base_repositories (
  id TEXT PRIMARY KEY,
  __typename TEXT,
  name TEXT NOT NULL,
  nameWithOwner TEXT NOT NULL,
  url TEXT,
  description TEXT,
  hasVulnerabilityAlertsEnabled BOOLEAN,
  license_key TEXT,
  license_name TEXT,
  license_spdxId TEXT,
  defaultBranch_name TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**Source:** Extracted from `repository` object in GraphQL response

**Example Row:**
```
id: R_kgDOHJ8xYw
name: cosign
nameWithOwner: sigstore/cosign
url: https://github.com/sigstore/cosign
description: Code signing and transparency for containers
```

### base_releases

Release information with foreign key to repository.

**Schema:**
```sql
CREATE TABLE base_releases (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  tagName TEXT NOT NULL,
  name TEXT,
  createdAt TIMESTAMP,
  publishedAt TIMESTAMP,
  isPrerelease BOOLEAN,
  isDraft BOOLEAN,
  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)
);
```

**Source:** Extracted from `repository.releases.nodes[]` in GraphQL response

**Example Row:**
```
id: RE_kwDOHJ8xY84Fe7i7
repository_id: R_kgDOHJ8xYw
tagName: v2.2.0
name: v2.2.0
createdAt: 2023-10-15T10:30:00Z
isPrerelease: false
```

### base_release_assets

Individual release artifacts with foreign keys to release and repository.

**Schema:**
```sql
CREATE TABLE base_release_assets (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  name TEXT NOT NULL,
  downloadUrl TEXT,
  size BIGINT,
  contentType TEXT,
  createdAt TIMESTAMP,
  FOREIGN KEY (repository_id) REFERENCES base_repositories(id),
  FOREIGN KEY (release_id) REFERENCES base_releases(id)
);
```

**Source:** Extracted from `repository.releases.nodes[].releaseAssets.nodes[]` in GraphQL response

**Example Rows:**
```
id: RA_001
release_id: RE_kwDOHJ8xY84Fe7i7
name: cosign-linux-amd64
downloadUrl: https://github.com/sigstore/cosign/releases/download/v2.2.0/cosign-linux-amd64

id: RA_002
release_id: RE_kwDOHJ8xY84Fe7i7
name: cosign-linux-amd64.sig
downloadUrl: https://github.com/sigstore/cosign/releases/download/v2.2.0/cosign-linux-amd64.sig
```

### base_workflows

GitHub Actions workflows with foreign key to repository.

**Schema:**
```sql
CREATE TABLE base_workflows (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT,
  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)
);
```

**Source:** Extracted from `repository.object.entries[]` (tree traversal for `.github/workflows/*.yml`)

**Example Row:**
```
id: WF_001
repository_id: R_kgDOHJ8xYw
filename: release.yaml
path: .github/workflows/release.yaml
content: |
  name: Release
  on:
    push:
      tags: ['v*']
  jobs:
    goreleaser:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: goreleaser/goreleaser-action@v4
```

### base_branch_protection_rules

Branch protection settings with foreign key to repository.

**Schema:**
```sql
CREATE TABLE base_branch_protection_rules (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  requiresApprovingReviews BOOLEAN,
  requiredApprovingReviewCount INTEGER,
  requiresCodeOwnerReviews BOOLEAN,
  requiresCommitSignatures BOOLEAN,
  requiresLinearHistory BOOLEAN,
  requiresStatusChecks BOOLEAN,
  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)
);
```

**Source:** Extracted from `repository.branchProtectionRules.nodes[]` (GetRepoDataExtendedInfo only)

### base_cncf_projects (optional)

CNCF project metadata when using rich input format.

**Schema:**
```sql
CREATE TABLE base_cncf_projects (
  project_name TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  maturity TEXT,
  category TEXT,
  subcategory TEXT,
  date_accepted DATE,
  date_graduated DATE,
  homepage_url TEXT,
  has_security_audits BOOLEAN,
  security_audit_count INTEGER
);
```

**Source:** Extracted from rich format input JSON (not from GraphQL)

**Note:** Only exists when using rich format input with CNCF project metadata.

### base_cncf_project_repos (optional)

Junction table linking CNCF projects to repositories.

**Schema:**
```sql
CREATE TABLE base_cncf_project_repos (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  is_primary BOOLEAN,
  FOREIGN KEY (project_name) REFERENCES base_cncf_projects(project_name),
  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)
);
```

**Source:** Extracted from `repos[]` array in rich format input JSON

## Aggregated Tables (Analysis Layer)

These tables are produced by the `analyze.ts` → `SecurityAnalyzer.ts` → SQL models pipeline.

### agg_artifact_patterns

Classifies release artifacts by security artifact type.

**Schema:**
```sql
CREATE TABLE agg_artifact_patterns AS
SELECT 
  ra.id as artifact_id,
  ra.repository_id,
  ra.release_id,
  ra.name AS artifact_name,
  -- Pattern detection flags
  REGEXP_MATCHES(ra.name, '\.(sbom|spdx|cyclonedx)\.(json|xml)$', 'i') AS is_sbom,
  REGEXP_MATCHES(ra.name, '\.(sig|asc|signature)$', 'i') AS is_signature,
  REGEXP_MATCHES(ra.name, 'attestation', 'i') AS is_attestation,
  REGEXP_MATCHES(ra.name, 'provenance', 'i') AS is_provenance,
  ra.downloadUrl as download_url
FROM base_release_assets ra
JOIN base_releases r ON ra.release_id = r.id
WHERE ra.name IS NOT NULL;
```

**Purpose:** Detect presence of SBOMs, signatures, attestations, and provenance files

**Example Rows:**
```
artifact_name: cosign-linux-amd64.sig
is_sbom: false
is_signature: true
is_attestation: false

artifact_name: cosign-sbom.spdx.json
is_sbom: true
is_signature: false
is_attestation: false
```

### agg_workflow_tools

Detects CI/CD security tools used in GitHub Actions workflows.

**Schema:**
```sql
CREATE TABLE agg_workflow_tools AS
SELECT 
  w.id as workflow_id,
  w.repository_id,
  SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
  repo.name as repo,
  repo.nameWithOwner,
  w.filename as workflow_name,
  'sbom-generator' as tool_category,
  'syft' as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'syft') IS NOT NULL
UNION ALL
-- ... more tool detections
```

**Purpose:** Identify which security tools are integrated into CI/CD pipelines using Full-Text Search

**Example Row:**
```
workflow_id: WF_001
repository_id: R_kgDOHJ8xYw
workflow_name: release.yaml
tool_category: signing
tool_name: cosign
```

### agg_repo_summary

Repository-level rollup statistics.

**Schema:**
```sql
CREATE TABLE agg_repo_summary AS
SELECT 
  r.id AS repository_id,
  r.name,
  r.nameWithOwner,
  COUNT(DISTINCT rel.id) AS total_releases,
  COUNT(DISTINCT ra.id) AS total_artifacts,
  BOOL_OR(ap.is_sbom) AS has_sbom_artifact,
  BOOL_OR(ap.is_signature) AS has_signature_artifact,
  BOOL_OR(ap.is_attestation) AS has_attestation_artifact,
  BOOL_OR(wt.tool_name = 'syft' OR wt.tool_name = 'trivy') AS uses_sbom_ci_tool,
  BOOL_OR(wt.tool_name = 'cosign') AS uses_cosign,
  BOOL_OR(wt.tool_name = 'goreleaser') AS uses_goreleaser
FROM base_repositories r
LEFT JOIN base_releases rel ON r.id = rel.repository_id
LEFT JOIN base_release_assets ra ON rel.id = ra.release_id
LEFT JOIN agg_artifact_patterns ap ON ra.id = ap.artifact_id
LEFT JOIN agg_workflow_tools wt ON r.id = wt.repository_id
GROUP BY r.id, r.name, r.nameWithOwner;
```

**Purpose:** High-level security posture summary for each repository

**Example Row:**
```
repository_id: R_kgDOHJ8xYw
name: cosign
nameWithOwner: sigstore/cosign
total_releases: 42
total_artifacts: 420
has_sbom_artifact: true
has_signature_artifact: true
has_attestation_artifact: true
uses_sbom_ci_tool: true
uses_cosign: true
uses_goreleaser: true
```

### agg_cncf_project_summary (optional)

CNCF project-level aggregations when using rich format input.

**Schema:**
```sql
CREATE TABLE agg_cncf_project_summary AS
SELECT 
  cp.project_name,
  cp.display_name,
  cp.maturity,
  cp.category,
  COUNT(DISTINCT cpr.repository_id) as total_repos,
  COUNT(DISTINCT CASE WHEN rs.has_sbom_artifact THEN cpr.repository_id END) as repos_with_sbom,
  ROUND(AVG(CASE WHEN rs.has_sbom_artifact THEN 1.0 ELSE 0.0 END), 2) as sbom_adoption_rate
FROM base_cncf_projects cp
JOIN base_cncf_project_repos cpr ON cp.project_name = cpr.project_name
LEFT JOIN agg_repo_summary rs ON cpr.repository_id = rs.repository_id
GROUP BY cp.project_name, cp.display_name, cp.maturity, cp.category;
```

**Purpose:** Project-level security metrics across all repos in a CNCF project

**Note:** Only exists when using rich format input with CNCF metadata.

## Transformation Pipeline

The normalization process transforms nested GraphQL responses into flat relational arrays:

**Input (GraphQL Response):**
```json
{
  "repository": {
    "id": "R_abc",
    "name": "cosign",
    "owner": { "login": "sigstore" },
    "releases": {
      "nodes": [
        {
          "id": "REL_001",
          "tagName": "v2.2.0",
          "releaseAssets": {
            "nodes": [
              { "id": "RA_001", "name": "cosign.sig" }
            ]
          }
        }
      ]
    }
  }
}
```

**Output (Relational Arrays):**
```typescript
{
  repositories: [
    { id: "R_abc", name: "cosign", nameWithOwner: "sigstore/cosign", ... }
  ],
  releases: [
    { id: "REL_001", repository_id: "R_abc", tagName: "v2.2.0", ... }
  ],
  releaseAssets: [
    { id: "RA_001", repository_id: "R_abc", release_id: "REL_001", name: "cosign.sig", ... }
  ]
}
```

These arrays are then inserted into DuckDB using Apache Arrow IPC for performance.

## Querying the Data

### Example Queries

**Find all repositories with SBOM artifacts:**
```sql
SELECT r.nameWithOwner, COUNT(*) AS sbom_count
FROM base_repositories r
JOIN agg_artifact_patterns ap ON r.id = ap.repository_id
WHERE ap.is_sbom = true
GROUP BY r.nameWithOwner
ORDER BY sbom_count DESC;
```

**Find repositories using both Syft and Cosign in CI:**
```sql
SELECT DISTINCT r.nameWithOwner
FROM base_repositories r
JOIN agg_workflow_tools wt ON r.id = wt.repository_id
WHERE wt.tool_name IN ('syft', 'cosign')
GROUP BY r.nameWithOwner
HAVING COUNT(DISTINCT wt.tool_name) = 2;
```

**Get detailed artifact breakdown for a specific repository:**
```sql
SELECT 
  rel.tagName,
  ra.name,
  ap.is_sbom,
  ap.is_signature,
  ap.is_attestation
FROM base_repositories r
JOIN base_releases rel ON r.id = rel.repository_id
JOIN base_release_assets ra ON rel.id = ra.release_id
JOIN agg_artifact_patterns ap ON ra.id = ap.artifact_id
WHERE r.nameWithOwner = 'sigstore/cosign'
ORDER BY rel.createdAt DESC, ra.name;
```

## Parquet Export

All tables are exported to Parquet files with metadata:

```text
output/test-run-2025-10-12T19-20-16/
└── GetRepoDataExtendedInfo/
    ├── database.db
    └── parquet/
        ├── raw_GetRepoDataExtendedInfo.parquet
        ├── base_repositories.parquet
        ├── base_releases.parquet
        ├── base_release_assets.parquet
        ├── base_workflows.parquet
        ├── base_branch_protection_rules.parquet
        ├── agg_artifact_patterns.parquet
        ├── agg_workflow_tools.parquet
        └── agg_repo_summary.parquet
```

These can be queried directly with DuckDB, Python (PyArrow/Pandas), or any Parquet-compatible tool.

## Schema Evolution

As the data model evolves:

1. **Normalizers change**: Update the TypeScript normalizer to add/remove fields
2. **Base tables change**: DuckDB automatically infers schema from the arrays
3. **SQL models change**: Update `sql/models/*.sql` to use new fields
4. **Parquet regenerated**: Next run produces new Parquet files with updated schema

The beauty of this architecture is that schema changes are localized to the normalizer and SQL model files - no manual schema management required.
