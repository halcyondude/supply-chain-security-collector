# Supply-Chain Security Collector — Internal Runbook

**Purpose:** Reproducible commands for the full data pipeline: repo-list refresh → collect → graph → export → query.
This is an internal engineering reference, not a CNCF report.

---

## Pipeline Overview

```
[1] build:repos      → input/cncf-expanded-repo-list.json   (no token needed)
[2] npm start        → output/<name>/<ts>/database.db        (GitHub token required)
[3] npm run graph    → output/<name>/<ts>/graph.lbug          (no token needed)
[4] export parquet   → bucket/<name>/<ts>/parquet/            (bucket URL needed)
[5] insight queries  → npm run graph:query / DuckDB SQL       (no token needed)
```

---

## Step 1 — Refresh the Repo List

Builds `input/cncf-expanded-repo-list.json` by UNION-ing:
- **(a)** CNCF landscape repos from `https://landscape.cncf.io/data/full.json` (`.items[]`)
- **(b)** `.project` `repositories[]` for each CNCF project (fetched from
  `https://raw.githubusercontent.com/<org>/.project/main/project.yaml`)

Each entry carries a `source` field: `"landscape"`, `"dot-project"`, or `"both"`.
Deduplication is on `owner/name` (case-insensitive).

### Run

```bash
# Full build: landscape + .project (recommended)
npm run build:repos

# Landscape only (no network calls to .project repos)
npm run build:repos -- --no-dot-project

# Custom output path
npm run build:repos -- --output input/my-custom-list.json

# Dry-run: print counts, don't write files
npm run build:repos -- --dry-run

# Verbose: log each .project repo discovered
npm run build:repos -- --verbose
```

### Optional: GitHub token to avoid rate-limiting

Without a token, all fetches use unauthenticated `raw.githubusercontent.com` GETs
(fine for public repos; degraded if GitHub starts rate-limiting unauthenticated GETs).

```bash
GITHUB_TOKEN=ghp_xxx npm run build:repos
# or
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx npm run build:repos
```

### What this replaces

Previously, `npm run fetch:landscape` fetched `landscape.yml` from GitHub raw and produced
`input/cncf-full-landscape.json` (landscape repos only). The new `build:repos` script
supersedes it and adds `.project` enrichment.

> **Landscape endpoint note:**
> `https://landscape.cncf.io/data/items.json` returns HTML (landscape2 SPA shell) — DEAD.
> `https://landscape.cncf.io/data/full.json` returns `application/json` with `.items[]` — USE THIS.
> `build-repo-list.ts` uses `full.json`. The legacy `fetch-cncf-landscape.ts` uses
> `raw.githubusercontent.com/.../landscape.yml` (also fine — YAML source is still live).

### Idempotency

Running `build:repos` multiple times produces the same output given the same upstream state.
The script is stateless — no local cache is written.

---

## Step 2 — Full Scan (GitHub token required)

Runs the GraphQL data collector against the expanded repo list.

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx

# Full landscape scan (use expanded list for maximum coverage)
npx ts-node src/neo.ts \
  --input input/cncf-expanded-repo-list.json \
  --queries GetRepoDataExtendedInfo \
  --analyze \
  --parallel

# Or with maturity filter (e.g., graduated only)
npx ts-node src/neo.ts \
  --input input/cncf-expanded-repo-list.json \
  --queries GetRepoDataExtendedInfo \
  --maturity graduated \
  --analyze \
  --parallel

# Or use npm alias (runs against cncf-full-landscape.json)
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx npm start
```

**Output structure:**

```
output/<input-basename>/<ISO-timestamp>/
  database.db                              ← DuckDB (base + agg tables)
  parquet/                                 ← Parquet files per table
  raw-responses.GetRepoDataExtendedInfo.jsonl  ← audit log (JSONL)
  files/                                   ← SECURITY.md, security-insights.yml
  security-insights-attestations.csv
  security-insights-sboms.csv
output/<input-basename>/current -> <latest-timestamp>/   ← symlink
```

**What requires the token:**
- All `npm start` / `npx ts-node src/neo.ts` invocations — GitHub GraphQL API requires auth.
- `--scan-orgs` mode (org-level repo discovery) — also requires token.

**What does NOT require a token:**
- Steps 1, 3, 4, 5 (repo list build, graph build, export, queries).

---

## Step 3 — Build the Graph (LadybugDB)

Reads the DuckDB output from Step 2 and builds a LadybugDB property graph
for Cypher-based supply chain security queries.

```bash
# Build graph from the latest collect run (using the 'current' symlink)
npm run graph -- --database output/cncf-expanded-repo-list/current/database.db

# Or specify explicit timestamp directory
npm run graph -- --database output/cncf-expanded-repo-list/2026-07-17T12-00-00/database.db

# Optional: custom output graph path
npm run graph -- \
  --database output/cncf-expanded-repo-list/current/database.db \
  --output output/cncf-expanded-repo-list/current/graph.lbug
```

**Output:** `graph.lbug` directory alongside the `database.db`.

**List available Cypher queries:**

```bash
npm run graph:list
```

---

## Step 4 — Export DuckDB + Parquet to Bucket

> Replace `BUCKET_URL` with your actual bucket path (e.g. `s3://my-bucket/supply-chain/`
> or `gs://my-bucket/supply-chain/`).

### Export Parquet files

```bash
BUCKET_URL="s3://my-bucket/supply-chain"
RUN_DIR="output/cncf-expanded-repo-list/current"

# Copy the full run directory (DuckDB + Parquet + audit log)
aws s3 cp --recursive "${RUN_DIR}/parquet/" "${BUCKET_URL}/parquet/"
aws s3 cp "${RUN_DIR}/database.db" "${BUCKET_URL}/database.db"
aws s3 cp "${RUN_DIR}/raw-responses.GetRepoDataExtendedInfo.jsonl" \
          "${BUCKET_URL}/raw-responses.GetRepoDataExtendedInfo.jsonl"
```

### Export with DuckDB COPY (direct from database)

```bash
# Example: export a specific table to Parquet in the bucket
duckdb output/cncf-expanded-repo-list/current/database.db \
  "COPY base_repositories TO '${BUCKET_URL}/base_repositories.parquet' (FORMAT PARQUET)"
```

### Read Parquet from bucket in DuckDB (for remote analysis)

```bash
duckdb :memory: \
  "SELECT * FROM read_parquet('${BUCKET_URL}/parquet/base_repositories.parquet') LIMIT 10"
```

---

## Step 5 — Run Insight Queries

### Cypher queries (graph)

Run against the LadybugDB graph built in Step 3.

```bash
GRAPH_PATH="output/cncf-expanded-repo-list/current/graph.lbug"

# List all built-in queries
npm run graph:list

# Run a built-in query
npm run graph:query -- --graph "${GRAPH_PATH}" --name graduated-no-signing
npm run graph:query -- --graph "${GRAPH_PATH}" --name project-tool-summary
npm run graph:query -- --graph "${GRAPH_PATH}" --name tool-cooccurrence
npm run graph:query -- --graph "${GRAPH_PATH}" --name maturity-tool-adoption
npm run graph:query -- --graph "${GRAPH_PATH}" --name full-pipeline
npm run graph:query -- --graph "${GRAPH_PATH}" --name unmonitored-graduated

# Run an ad-hoc Cypher query
npm run graph:query -- \
  --graph "${GRAPH_PATH}" \
  --cypher "MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository) RETURN p.display_name, count(r) AS repos ORDER BY repos DESC LIMIT 20"

# Run a query from a .cypher file
npm run graph:query -- --graph "${GRAPH_PATH}" --file cypher/maturity-tool-adoption.cypher
```

### SQL queries (DuckDB)

```bash
DB_PATH="output/cncf-expanded-repo-list/current/database.db"

# List tables
duckdb "${DB_PATH}" ".tables"

# Basic provenance check
duckdb "${DB_PATH}" \
  "SELECT maturity, count(*) AS projects, sum(repo_count) AS repos
   FROM agg_project_summary GROUP BY maturity ORDER BY maturity"

# Workflow tool usage by project
duckdb "${DB_PATH}" \
  "SELECT project_name, tool_name, category
   FROM agg_workflow_tools ORDER BY project_name, category"
```

---

## Milestone-1 Target Queries

These are the Milestone-1 analytical questions. Implement as Cypher or SQL against
the graph/DuckDB built above.

### Q1 — License "rug pull" impact

> *Which CNCF projects changed their license? How many downstream dependents
> (by release asset count or workflow SBOM references) are potentially impacted?*

**Approach:** The current schema captures `license` per project from the landscape.
A rug-pull signal requires a historical diff (not yet implemented). For now, identify
projects whose landscape-declared license differs from what the collector read from
their GitHub repo's `license_info.spdx_id`:

```sql
-- DuckDB: projects where landscape-declared license differs from GitHub-detected license
SELECT
    r.project_name,
    r.maturity,
    r.landscape_license,
    r.github_license
FROM base_repositories r
WHERE r.landscape_license IS NOT NULL
  AND r.github_license IS NOT NULL
  AND r.landscape_license != r.github_license
ORDER BY r.maturity, r.project_name;
```

```cypher
// Cypher: graduated projects with a mismatched or missing license
MATCH (p:CNCFProject {maturity: 'graduated'})<-[:BELONGS_TO]-(r:Repository)
WHERE r.landscape_license IS NOT NULL
  AND (r.github_license IS NULL OR r.landscape_license <> r.github_license)
RETURN p.display_name, r.nameWithOwner, r.landscape_license, r.github_license
ORDER BY p.display_name
```

### Q2 — CVE impact across the CNCF ecosystem

> *Which CVEs (from security-insights.yml / SBOM attestations) affect the most
> CNCF projects? What is the blast radius?*

**Approach:** `security-insights.yml` files (collected in `files/`) and SBOM assets
from releases. The collector writes `security-insights-sboms.csv` and
`security-insights-attestations.csv`. Query across projects:

```sql
-- DuckDB: release assets that look like SBOM or attestation files
SELECT
    r.project_name,
    r.nameWithOwner,
    ra.name AS asset_name,
    ra.download_count
FROM base_release_assets ra
JOIN base_repositories r ON r.id = ra.repository_id
WHERE lower(ra.name) LIKE '%sbom%'
   OR lower(ra.name) LIKE '%.intoto.jsonl'
   OR lower(ra.name) LIKE '%.att'
ORDER BY r.project_name, ra.name;
```

```cypher
// Cypher (graph Q15): landscape question — projects with SBOM assets but no signing tool
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)-[:HAS_RELEASE]->(rel:Release)-[:HAS_ASSET]->(a:ReleaseAsset)
WHERE a.name CONTAINS 'sbom'
  AND NOT EXISTS {
      MATCH (r)-[:HAS_WORKFLOW]->(:Workflow)-[:USES_TOOL]->(t:Tool)
      WHERE t.tool_name IN ['cosign', 'sigstore', 'notation']
  }
RETURN p.display_name, p.maturity, r.nameWithOwner,
       count(DISTINCT rel) AS releases_with_sbom
ORDER BY p.maturity, p.display_name
```

### Q3 — Landscape graph question #15

> *Which graduated projects publish SBOM assets in releases but have no signing
> tool detected in any CI workflow?*

```cypher
MATCH (p:CNCFProject {maturity: 'graduated'})<-[:BELONGS_TO]-(r:Repository)
      -[:HAS_RELEASE]->(rel:Release)-[:HAS_ASSET]->(a:ReleaseAsset)
WHERE (a.name CONTAINS 'sbom' OR a.name CONTAINS '.spdx' OR a.name CONTAINS '.cyclonedx')
  AND NOT EXISTS {
      MATCH (r)-[:HAS_WORKFLOW]->(:Workflow)-[:USES_TOOL]->(t:Tool)
      <-[:IN_CATEGORY]-(:ToolCategory {category_name: 'signer'})
  }
RETURN p.display_name, r.nameWithOwner,
       count(DISTINCT a) AS sbom_assets,
       count(DISTINCT rel) AS releases
ORDER BY sbom_assets DESC
```

---

## What Needs a Token vs. What Needs a Bucket

| Step | Needs GitHub Token | Needs Bucket |
|------|-------------------|--------------|
| `npm run build:repos` | No (but helps with rate limits) | No |
| `npm run fetch:landscape` | No | No |
| `npm start` / `npm run test:three` | **YES** | No |
| `npm run graph` | No | No |
| `npm run graph:list` | No | No |
| `npm run graph:query` | No | No |
| Parquet export to bucket | No | **YES** — set `BUCKET_URL` |
| Remote Parquet reads via httpfs | No | **YES** |
| `npm run analyze` / `npm run report` | No | No |

---

## Pipeline Validation (Without Token)

The following runs green without a GitHub token, using committed test fixtures
in `output/test-three-projects/`:

```bash
# 1. List available Cypher queries
npm run graph:list

# 2. Build graph from committed test fixture
npm run graph -- --database output/test-three-projects/current/database.db

# 3. Run a Cypher query on the test graph
npm run graph:query -- \
  --graph output/test-three-projects/current/graph.lbug \
  --name graduated-no-signing

# 4. Run project-tool-summary
npm run graph:query -- \
  --graph output/test-three-projects/current/graph.lbug \
  --name project-tool-summary

# 5. Dry-run the repo list builder (no writes, no token)
npm run build:repos -- --dry-run --no-dot-project
```

**Expected output for `graduated-no-signing` on test fixture:**
```
┌─────────┬────────────────┬────────────────────────┐
│ (index) │ p.display_name │ r.nameWithOwner        │
├─────────┼────────────────┼────────────────────────┤
│ 0       │ 'Helm'         │ 'helm/helm'            │
│ 1       │ 'Jaeger'       │ 'jaegertracing/jaeger' │
└─────────┴────────────────┴────────────────────────┘
2 row(s)
```

---

## Troubleshooting

### `items.json` returns HTML instead of JSON

**Symptom:** `fetch-cncf-landscape.ts` or a custom script hits
`https://landscape.cncf.io/data/items.json` and gets `content-type: text/html`.

**Cause:** The landscape2 migration moved the data to `full.json`. The `items.json`
URL now returns the SPA shell HTML.

**Fix:** Change the URL to `https://landscape.cncf.io/data/full.json` and access
`.items[]` instead of the top-level array. The `build-repo-list.ts` script already
uses `full.json`.

### `.project` repos return 404

Most CNCF projects have not yet published a `.project` repo. The builder degrades
gracefully — 404s are silently skipped, and the landscape data is used as-is.
As more projects adopt `.project`, the builder will automatically pick them up.

### DuckDB extension install failures

Extensions (`json`, `parquet`, `fts`, `httpfs`) are auto-installed on first run.
If you're in an air-gapped environment:

```bash
# Pre-install extensions manually
duckdb :memory: "INSTALL json; INSTALL parquet; INSTALL fts; INSTALL httpfs"
```

### Graph build skips tables

If `graph.lbug` is missing expected tables (e.g., `Tool`, `ToolCategory`), the
collect run may not have detected any workflow tool usage. This is expected for
projects with no GitHub Actions workflows, or workflows that use unrecognized tools.
Check `agg_workflow_tools` in the DuckDB database.
