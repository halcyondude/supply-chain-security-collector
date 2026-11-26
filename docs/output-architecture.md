# Output Architecture: Timestamped Runs + Parquet Generation

## Overview

This document describes the output file structure and Parquet generation strategy implemented in the supply chain security collector.

## Timestamped Run Directories

### Structure

Each run creates a timestamped directory under a flat layout named after the input file:

```text
output/<input-name>/
  <timestamp>/
    database.db                         # DuckDB database with all tables
    parquet/                            # Parquet exports of all tables
      base_*.parquet
      agg_*.parquet
      raw_*.parquet
    raw-responses.<QueryName>.jsonl     # API audit trail
    security-insights-sboms.csv          # written by SecurityAnalyzer (--analyze)
    security-insights-attestations.csv   # written by SecurityAnalyzer (--analyze)
    files/                              # persisted workflows and SECURITY.md (--persist-files)
  current -> <timestamp>/              # symlink to latest
```

### Benefits

- No file collisions between multiple runs
- Preserves history - every run is kept separately
- Easy comparison - diff between two run directories
- Clean organization - all outputs for one run in one place

### Timestamp Format

ISO 8601 with colons replaced: `2025-10-06T22-30-15`
- Sortable lexicographically
- Human-readable
- Filesystem-safe (no colons)

## Output Formats

### Primary: DuckDB Database

The `database.db` file is a fully-functional DuckDB database containing:
- All `base_*` tables (normalized GraphQL data)
- All `agg_*` tables (analysis results)
- Full-text search indexes (created by `00_initialize_indexes.sql`)

**Use this for:**
- Interactive SQL queries
- Joining across tables
- Complex analytics
- Report generation

### Secondary: Parquet Files

Parquet files are exports of the DuckDB tables (`base_*`, `raw_*`, `agg_*`) for:
- Portability (no DuckDB installation needed)
- Language interop (Python, R, Spark, etc.)
- Cloud storage (S3, GCS)
- Data lake integration

### Why DuckDB?

- Stable and production-ready (used by many data tools)
- Simple SQL interface for transformations
- Built-in Parquet support with metadata
- Handles relational data naturally
- ZSTD compression for smaller files

### Implementation

Writing is split across three modules:

1. `neo.ts` creates the run directory and the `current` symlink. `rawResponseWriter.ts` appends each API response to `raw-responses.<QueryName>.jsonl` as it arrives.
2. `ArtifactWriter.ts` loads the raw responses into a `raw_<QueryName>` table, calls the query-specific normalizer, writes the `base_*` tables, persists files to `files/`, and exports every table to `parquet/`. Org scans append `base_org_repos` through `writeOrgRepoArtifacts()`.
3. `SecurityAnalyzer.ts` runs the SQL models to create `agg_*` tables, exports them to `parquet/`, and writes the two Security Insights CSVs (`security-insights-sboms.csv`, `security-insights-attestations.csv`). These CSVs come from `SecurityAnalyzer`, not `ArtifactWriter`.

Parquet files use ZSTD compression and `ROW_GROUP_SIZE 100000`. They carry no custom key-value metadata; field descriptions are not embedded.

---

## Data Pipeline

The output is produced in three stages:

1. **Collection** (`neo.ts`): Fetches data from GitHub GraphQL API, passes responses through query-specific normalizers, and writes to DuckDB `base_*` tables and Parquet via `ArtifactWriter`.

2. **Analysis** (`analyze.ts`): Runs `SecurityAnalyzer` with SQL models (`sql/models/*.sql`) to produce `agg_*` tables, then exports them to Parquet.

3. **Reporting** (optional, `report-cli.ts`): Runs `ReportGenerator` to produce a Markdown summary report from the analyzed data.
