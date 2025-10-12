# Output Architecture: Timestamped Runs + Parquet Generation

## Overview

This document describes the output file structure and Parquet generation strategy implemented in the GitHub Supply Chain Security Analyzer.

## Timestamped Run Directories

### Structure

Each run creates a timestamped directory:

```
output/
  graduated-2025-10-06T22-30-15/
    raw-responses.jsonl           # Raw GraphQL API responses (JSONL)
    graduated-analyzed.json       # Analyzed domain model
    graduated.csv                 # Normalized flat CSV
    graduated-schema.json         # Schema documentation with field descriptions
    graduated-analyzed.parquet    # Parquet with embedded metadata
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

## Parquet Generation with DuckDB

### Why DuckDB?

- Stable and production-ready (used by many data tools)
- Simple SQL interface for JSON → Parquet conversion
- Built-in key-value metadata support (embeds schema docs)
- Handles nested JSON automatically
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

1. Writing raw GraphQL responses to DuckDB `raw_*` tables
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

## File Generation Flow

```
1. Fetch data from GitHub API
   ↓
2. Save raw responses to raw-responses.jsonl
   ↓
3. Analyze and classify artifacts
   ↓
4. Generate {dataset}-analyzed.json (domain model)
   ↓
5. Flatten to normalized rows
   ↓
6. Generate {dataset}.csv (normalized flat)
   ↓
7. Generate {dataset}-schema.json (field docs)
   ↓
8. Read schema.json + analyzed.json
   ↓
9. Convert to {dataset}-analyzed.parquet with embedded metadata
```

---

## JSONL Long Lines

Lines in `raw-responses.jsonl` can be 10KB-100KB+ (full GraphQL response with 5 releases × N assets).

This is fine because:

- `jq` handles it: `jq -c '.metadata' raw-responses.jsonl`
- DuckDB handles it: Designed for large JSON records
- Streaming parsers handle it: Node.js `readline`, Python `ijson`
- Parquet solves it: Columnar format, no line-length concerns

Mitigation:

- Document in README: "JSONL files have very long lines"
- Use `.jsonl` extension (not `.json`) to signal format
- Provide Parquet files for analysis (not JSONL)

---

## Querying Parquet Files

### Using DuckDB CLI

Count repos with SBOMs:

```sql
SELECT 
  repository_name_with_owner,
  COUNT(DISTINCT artifact_name) as sbom_count
FROM 'output/graduated-2025-10-06T22-30-15/graduated-analyzed.parquet'
WHERE artifact_is_sbom = true
GROUP BY repository_name_with_owner
ORDER BY sbom_count DESC;
```

Check embedded metadata:

```sql
SELECT * 
FROM parquet_kv_metadata('output/graduated-2025-10-06T22-30-15/graduated-analyzed.parquet')
WHERE key LIKE 'field_%'
LIMIT 10;
```

### Using Python (PyArrow)

```python
import pyarrow.parquet as pq

# Read Parquet file
table = pq.read_table('output/graduated-2025-10-06T22-30-15/graduated-analyzed.parquet')

# Access metadata
metadata = table.schema.metadata
print(metadata[b'field_repository_name'].decode())  # "Name of the repository"

# Query with Pandas
df = table.to_pandas()
sbom_repos = df[df['artifact_is_sbom'] == True]
print(sbom_repos['repository_name_with_owner'].unique())
```

---

## Future Enhancements

### Phase 3: Raw Responses to Parquet

Currently, only analyzed JSON is converted to Parquet. Future work will convert raw-responses.jsonl → raw-responses.parquet:

```sql
COPY (
  SELECT 
    metadata.queryType as query_type,
    metadata.timestamp as timestamp,
    metadata.owner as owner,
    metadata.repo as repo,
    response
  FROM read_json_auto('raw-responses.jsonl', format='newline_delimited')
) TO 'raw-responses.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
```

Benefits:

- Smaller file size (ZSTD compression)
- Faster queries (columnar format)
- Same metadata embedding

### Phase 4: Query-Specific Tables

Split by query type for schema consistency:

```text
output/
  graduated-2025-10-06T22-30-15/
    artifacts-raw.parquet         # GetRepoDataArtifacts responses
    extended-raw.parquet          # GetRepoDataExtendedInfo responses
```

Implementation:

```sql
-- Filter by query type
COPY (
  SELECT * FROM 'raw-responses.jsonl'
  WHERE metadata.queryType = 'GetRepoDataArtifacts'
) TO 'artifacts-raw.parquet';
```

### Phase 5: DuckDB Query Engine

Add `query` subcommand for SQL over Parquet files:

```bash
npm start -- query --sql "SELECT COUNT(*) FROM '*/graduated-analyzed.parquet' WHERE artifact_is_sbom"
```

---

## Dependencies

- **duckdb** (^1.1.3) - SQL database for JSON/Parquet conversion
- **chalk** - Console colors
- **json-2-csv** - JSON to CSV conversion

---

## Testing

Validate Parquet generation:

```bash
# Run with mock data
npm start -- --mock --input input/test-single.jsonl

# Check output directory
ls output/test-single-*/

# Verify Parquet metadata
npx duckdb -c "SELECT * FROM parquet_kv_metadata('output/test-single-*/test-single-analyzed.parquet')"
```

Expected output:

- `raw-responses.jsonl` (or skipped in mock mode)
- `test-single-analyzed.json`
- `test-single.csv`
- `test-single-schema.json`
- `test-single-analyzed.parquet` (with 50+ KV metadata entries)

## Troubleshooting

### "Cannot find module 'duckdb'"

Solution: Install dependencies

```bash
npm install
```

### Parquet file not generated

Check:

1. Is `runMetadata` provided to `generateReports()`?
2. Does `{dataset}-analyzed.json` exist?
3. Does `{dataset}-schema.json` exist?
4. Are there compile errors in `parquetWriter.ts`?

Debug:

```typescript
// In src/report.ts, add logging:
console.log('Generating Parquet:', basePathForParquet);
await generateParquetFiles(...);
console.log('Parquet generation complete');
```

### DuckDB installation fails (native module)

Issue: DuckDB requires native compilation.

Solution:

- Ensure C++ compiler is installed (Xcode on macOS)
- Try: `npm install duckdb --build-from-source`
- Alternative: Use DuckDB CLI externally

## Summary

Implemented: Timestamped run directories prevent file collisions

Implemented: DuckDB Parquet generation with schema metadata embedding

Preserves: All field descriptions from schema.json in Parquet KV_METADATA

Enables: SQL queries over Parquet with full field documentation

Next: Add raw-responses.jsonl → Parquet conversion, query-specific tables
