# Security Analysis

This directory contains SQL-based analysis models for GitHub supply chain security signals.

## Overview

The security analysis layer sits on top of the generic GraphQL data collection pipeline:

1. **Data Collection** (`neo.ts`) - Fetches data from GitHub GraphQL API → DuckDB
2. **Security Analysis** (`analyze.ts`) - Runs SQL models to detect security patterns

## Architecture

```
Generic Layer (neo.ts):
  ├── Fetch GraphQL data
  ├── Normalize to relational tables
  └── Export to DuckDB + Parquet

Domain-Specific Layer (analyze.ts):
  ├── Analyze release artifacts (SBOMs, signatures)
  ├── Detect CI/CD security tools in workflows
  └── Generate repository security summaries
```

## SQL Models

### 00_initialize_indexes.sql
Creates indexes for optimal query performance:
- **Full-text search indexes**: Enable fast keyword search in workflows, release assets, repository descriptions
- **B-tree indexes**: Foreign key relationships (repository_id, release_id)
- **CNCF indexes**: Conditional indexes for project metadata (only if CNCF tables exist)

**Output**: Index structures for faster queries

### 01_artifact_analysis.sql
Analyzes release assets to detect security artifact patterns:
- **SBOM formats**: SPDX, CycloneDX
- **Signatures**: .sig, .asc, .pem, .pub files
- **Attestations**: SLSA provenance, VEX documents, in-toto links
- **Container attestations**: Cosign, Rekor, Fulcio

**Output**: `agg_artifact_patterns` table with one row per asset

### 02_workflow_tool_detection.sql
Scans GitHub Actions workflow files for security tools:
- **SBOM generators**: Syft, Trivy, CycloneDX Generator
- **Signing tools**: Cosign, Sigstore, SLSA Generator
- **Scanners**: Snyk, CodeQL, Grype, Anchore
- **Dependency tools**: Dependabot, Renovate

**Output**: `agg_workflow_tools` table with one row per tool detection

### 03_repository_security_summary.sql
Aggregates security signals at repository level:
- Discrete boolean columns for each signal (no arrays!)
- Tool usage flags (uses_cosign, uses_syft, etc.)
- Adoption metrics (% of releases with SBOMs)

**Output**: `agg_repo_summary` table with one row per repository

### 04_summary_views.sql
Creates convenience views for common queries and reporting.

**Output**: View definitions for simplified querying

### 05_cncf_project_analysis.sql (optional)
Aggregates security metrics at the CNCF project level:
- **Project-level rollups**: Security tool adoption across all project repos
- **Maturity correlation**: How security practices vary by CNCF maturity level
- **Category analysis**: Security posture by Cloud Native landscape category

**Note**: Only runs when `base_cncf_projects` table exists (rich format input)

**Output**: `agg_cncf_project_summary` table with one row per CNCF project

## Usage

### Run analysis on collected data:
```bash
npm run analyze -- --database output/test-single-TIMESTAMP/GetRepoDataExtendedInfo/database.db
```

### Collect data AND analyze:
```bash
npm start -- --input repos.json --queries GetRepoDataExtendedInfo --analyze
```

### Run custom queries:
```bash
npm run analyze -- --database database.db --query sql/queries/top_tools.sql
```

### Export to CSV:
```bash
npm run analyze -- --database database.db --export-csv security-summary.csv
```

## Query Examples

### Repository-Level Queries

```sql
-- Repos using Cosign but not generating SBOMs
SELECT nameWithOwner
FROM agg_repo_summary
WHERE uses_cosign = true AND has_sbom_artifact = false;

-- SBOM format distribution
SELECT 
    SUM(CASE WHEN has_spdx_sbom THEN 1 ELSE 0 END) as spdx_count,
    SUM(CASE WHEN has_cyclonedx_sbom THEN 1 ELSE 0 END) as cyclonedx_count
FROM agg_repo_summary;

-- Tool combination usage
SELECT 
    uses_syft,
    uses_cosign,
    uses_trivy,
    COUNT(*) as repo_count
FROM agg_repo_summary
GROUP BY uses_syft, uses_cosign, uses_trivy
HAVING repo_count > 1
ORDER BY repo_count DESC;
```

### CNCF Project Queries (when using rich format)

```sql
-- Security tool adoption by CNCF maturity level
SELECT 
  maturity,
  COUNT(*) as project_count,
  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,
  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct
FROM agg_cncf_project_summary
GROUP BY maturity;

-- Projects with security audits
SELECT 
  display_name,
  maturity,
  security_audit_count,
  latest_audit_date,
  latest_audit_vendor
FROM agg_cncf_project_summary
WHERE has_security_audits = TRUE
ORDER BY maturity, display_name;
LIMIT 20;

-- Projects missing SBOMs
SELECT 
  display_name,
  maturity,
  category,
  total_repos,
  homepage_url
FROM agg_cncf_project_summary
WHERE repos_with_sbom = 0
  AND maturity IN ('graduated', 'incubating')
ORDER BY maturity, display_name;
```

## Design Principles

1. **Discrete Columns > Arrays**: Every signal is a boolean column for easy querying
2. **SQL First**: Complex analysis logic in SQL, not TypeScript
3. **Separation of Concerns**: Generic collection vs domain-specific analysis
4. **Testable**: SQL files can be tested independently
5. **Standard SQL**: No DuckDB-specific features (mostly)
6. **Documented**: Each SQL file explains what it does and why

## Adding New Patterns

To add detection for a new tool or artifact pattern:

1. **For artifacts**: Edit `01_artifact_analysis.sql`, add a new column with REGEXP_MATCHES
2. **For CI tools**: Edit `02_workflow_tool_detection.sql`, add a new UNION ALL clause
3. **For summary**: Edit `03_repository_security_summary.sql`, add aggregation columns

Example - adding Grype detection:
```sql
-- In 02_workflow_tool_detection.sql
UNION ALL
SELECT w.id, w.repository_id, w.filename, 'container-scanner', 'grype'
FROM workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\bgrype\b')

-- In 03_repository_security_summary.sql (in workflow_stats CTE)
BOOL_OR(tool_name = 'grype') as uses_grype,

-- Then in main SELECT
COALESCE(ws.uses_grype, false) as uses_grype,
```

## Files

```
sql/
├── models/                  # Analysis SQL models (run in order)
│   ├── 00_initialize_indexes.sql
│   ├── 01_artifact_analysis.sql
│   ├── 02_workflow_tool_detection.sql
│   ├── 03_repository_security_summary.sql
│   ├── 04_summary_views.sql
│   └── 05_cncf_project_analysis.sql    # CNCF-specific (optional)
└── queries/                 # Ad-hoc reporting queries
    ├── overview.sql
    ├── top_tools.sql
    └── cncf_security_analysis.sql      # CNCF-specific queries
```

## Performance

- **Artifact analysis**: ~1ms per asset (regex pattern matching)
- **Workflow analysis**: ~10ms per workflow (content search)
- **Summary aggregation**: ~50ms for 1000 repos
- **Total**: Scales linearly with data size

DuckDB's columnar storage makes these queries extremely fast even on large datasets.
