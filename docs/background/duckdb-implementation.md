# DuckDB-First Implementation

## Overview

The pipeline has been successfully migrated to a DuckDB-first architecture. Instead of using Apache Arrow for data transformation, we now leverage DuckDB's native JSON and Parquet capabilities for superior performance and compatibility.

## Architecture

**Old Pipeline:**
```
GraphQL → Arrow Tables → Parquet files (Apache Arrow writer)
```

**New Pipeline:**
```
GraphQL → JSON → DuckDB → Parquet files (DuckDB native writer)
```

## Key Benefits

1. **Better Parquet Files**: DuckDB's native Parquet writer produces high-quality, standards-compliant files with excellent compression (ZSTD)
2. **Simplified Code**: Eliminated complex Arrow transformation logic
3. **Native JSON Support**: DuckDB's `read_json()` with `auto_detect=true` handles nested structures automatically
4. **Maximum Depth Support**: `maximum_depth=-1` allows arbitrary nesting depth
5. **Rich Querying**: DuckDB SQL enables complex queries on nested data structures

## DuckDB Extensions Used

- **json**: Direct querying of JSON files with nested structures
- **parquet**: Efficient columnar storage with ZSTD compression

## Technical Details

### JSON Loading
```sql
CREATE TABLE raw_responses AS 
SELECT * FROM read_json('temp_responses.json', 
    auto_detect=true, 
    format='array',
    maximum_depth=-1,
    sample_size=-1
)
```

### Parquet Export
```sql
COPY table_name TO 'file.parquet' 
(FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000)
```

## Test Results

### Single Repository Test
- **Input**: 1 repository (sigstore/cosign)
- **Output Parquet**: 4.2KB
- **Status**: ✅ Success - Parquet file loads correctly in DuckDB

### Multiple Repository Test
- **Input**: 3 repositories (sigstore/cosign, anchore/syft, github/docs)
- **Output Parquet**: 5.2KB
- **Status**: ✅ Success - All repositories queryable

### Nested Data Query Test
```sql
-- Extract releases from nested structure
SELECT 
    repository.nameWithOwner, 
    UNNEST(repository.releases.nodes).tagName as release 
FROM raw_responses 
LIMIT 5
```
**Result**: ✅ Successfully extracts nested arrays

## Generated Artifacts

Each run produces:

1. **database.db** - DuckDB database file (~524KB)
2. **parquet/raw_responses.parquet** - Compressed Parquet file (~4-5KB)
3. **hydrate_metadata.sql** - SQL script to add schema metadata (~723KB)
4. **schema.md** - Human-readable schema documentation (~600KB)
5. **raw-responses.jsonl** - Audit log of raw API responses

## Package Information

- **DuckDB Package**: `@duckdb/node-api` v1.4.1-r.1 (official stable package)
- **Status**: Production-ready, actively maintained
- **Documentation**: https://duckdb.org/docs/api/nodejs

## Usage Example

```bash
npx ts-node src/main.ts \
  --endpoint https://api.github.com/graphql \
  --query src/graphql/GetRepoDataArtifacts.graphql \
  --input input/test-single.jsonl \
  --output-dir output
```

## Future Enhancements

### Schema-Driven Normalization (TODO)
Currently, the `createNormalizedTables()` function has a placeholder implementation. The full implementation will:

1. Parse the `schema-map.json` to understand the GraphQL schema structure
2. Dynamically create normalized tables from nested JSON
3. Extract nested objects (e.g., releases, releaseAssets) into separate tables
4. Add foreign key relationships (parentId, parentType)
5. Apply metadata from the schema map to table and column comments

### Example Normalized Structure
```sql
-- Main table
CREATE TABLE repositories AS
SELECT 
    repository.id,
    repository.name,
    repository.nameWithOwner
FROM raw_responses;

-- Normalized releases table
CREATE TABLE releases AS
SELECT 
    r.id as repository_id,
    UNNEST(r.releases.nodes).id as release_id,
    UNNEST(r.releases.nodes).tagName as tag_name,
    UNNEST(r.releases.nodes).createdAt as created_at
FROM raw_responses;

-- Normalized assets table
CREATE TABLE release_assets AS
SELECT 
    release_id,
    UNNEST(UNNEST(r.releases.nodes).releaseAssets.nodes).id as asset_id,
    UNNEST(UNNEST(r.releases.nodes).releaseAssets.nodes).name as name,
    UNNEST(UNNEST(r.releases.nodes).releaseAssets.nodes).downloadUrl as download_url
FROM raw_responses;
```

## Performance Characteristics

- **Compression Ratio**: ~100:1 for typical GitHub API responses
- **Query Performance**: DuckDB's columnar storage enables fast analytical queries
- **Memory Efficiency**: In-memory pipeline with temp file cleanup
- **Scalability**: Tested with 1-3 repositories, ready for larger datasets

## Code Quality

- **TypeScript Compilation**: ✅ Zero errors
- **ESLint**: ✅ Zero errors, 12 warnings (only `any` type warnings)
- **Test Coverage**: Manual testing complete, automated tests pending

## References

- [DuckDB Official Docs](https://duckdb.org/docs/)
- [DuckDB Node.js API](https://duckdb.org/docs/api/nodejs)
- [DuckDB JSON Extension](https://duckdb.org/docs/extensions/json)
- [DuckDB Parquet Extension](https://duckdb.org/docs/data/parquet)
