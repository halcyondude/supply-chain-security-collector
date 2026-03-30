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
    security-insights-sboms.csv
    security-insights-attestations.csv
    files/                              # extracted workflow/insights files
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
- Full-text search indexes
- Foreign key relationships

**Use this for:**
- Interactive SQL queries
- Joining across tables
- Complex analytics
- Report generation

### Secondary: Parquet Files

Parquet files are exports of all DuckDB tables for:
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

### Schema Metadata Preservation

We embed field descriptions from `{dataset}-schema.json` into the Parquet file's `KV_METADATA`.

Example schema.json:

```json
```json
{
  "fields": {
    "repository_name": {
      "type": "string",
      "description": "Name of the repository",
      "category": "repository"
    },
    "artifact_is_sbom": {
      "type": "boolean",
      "description": "Boolean indicating if artifact is a Software Bill of Materials",
      "category": "artifacts"
    }
  }
}
```

Embedded in Parquet as KV_METADATA:

```sql
SELECT * FROM parquet_kv_metadata('graduated-analyzed.parquet');

-- Returns:
key                         | value
---------------------------|----------------------------------------------
schema_title                | GitHub Supply Chain Security Analysis Schema
schema_version              | 1.0.0
run_query_type              | GetRepoDataArtifacts
run_timestamp               | 2025-10-06T22-30-15
run_total_repos             | 210
run_successful_repos        | 208
run_failed_repos            | 2
field_repository_name       | Name of the repository
field_artifact_is_sbom      | Boolean indicating if artifact is a Software Bill of Materials
...
```

### Implementation: `src/ArtifactWriter.ts`

The Parquet writing logic is integrated into the main `ArtifactWriter.ts` module, which handles:

1. Writing raw GraphQL responses to `raw-responses.jsonl` audit log
2. Calling query-specific normalizers to produce flat, relational arrays
3. Writing normalized data to DuckDB `base_*` tables
4. Exporting all tables to Parquet files with metadata

### DuckDB SQL Query

```sql
COPY (
  SELECT * FROM read_json_auto('graduated-analyzed.json')
) TO 'graduated-analyzed.parquet' (
  FORMAT PARQUET,
  COMPRESSION ZSTD,
  ROW_GROUP_SIZE 100000,
  KV_METADATA {
    schema_title: 'GitHub Supply Chain Security Analysis Schema',
    schema_version: '1.0.0',
    run_query_type: 'GetRepoDataArtifacts',
    run_timestamp: '2025-10-06T22-30-15',
    field_repository_name: 'Name of the repository',
    field_artifact_is_sbom: 'Boolean indicating if artifact is a Software Bill of Materials',
    -- ... up to 50 field descriptions ...
  }
);
```

### Integration

Automatically called by `generateReports()` in `src/report.ts`:

```typescript
// After JSON/CSV/schema generation:
if (runMetadata) {
  await generateParquetFiles(
    basePathForParquet,
    jsonPath,
    schemaPath,
    runMetadata
  );
}
```

---

## Data Pipeline

The output is produced in three stages:

1. **Collection** (`neo.ts`): Fetches data from GitHub GraphQL API, passes responses through query-specific normalizers, and writes to DuckDB `base_*` tables and Parquet via `ArtifactWriter`.

2. **Analysis** (`analyze.ts`): Runs `SecurityAnalyzer` with SQL models (`sql/models/*.sql`) to produce `agg_*` tables, then exports them to Parquet.

3. **Reporting** (optional, `report-cli.ts`): Runs `ReportGenerator` to produce a Markdown summary report from the analyzed data.
