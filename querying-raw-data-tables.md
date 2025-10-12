# Querying Raw Data in DuckDB

## Overview

The `raw_<QueryName>` table contains the complete nested GraphQL response loaded with DuckDB's `read_json_auto()`. This preserves the exact structure from GraphQL, including all nested objects and arrays.

DuckDB has excellent support for querying nested JSON structures directly - no need to flatten first!

## Table Structure

For `GetRepoDataArtifacts` query, the raw table looks like:

```sql
DESCRIBE raw_GetRepoDataArtifacts;
```

Output:
```
column_name  | column_type
-------------|--------------------------------------------------
repository   | STRUCT(__typename VARCHAR, id VARCHAR, name VARCHAR, 
             |        nameWithOwner VARCHAR, releases STRUCT(...))
```

The entire GraphQL response is stored as a STRUCT (nested object).

## Basic Queries

### 1. Access Top-Level Fields

```sql
-- Get repository names
SELECT 
    repository.name,
    repository.nameWithOwner
FROM raw_GetRepoDataArtifacts;
```

```sql
-- Get repository IDs and types
SELECT 
    repository.__typename,
    repository.id,
    repository.name
FROM raw_GetRepoDataArtifacts;
```

### 2. Count Nested Arrays

```sql
-- How many releases per repository?
SELECT 
    repository.name,
    len(repository.releases.nodes) as release_count
FROM raw_GetRepoDataArtifacts;
```

```sql
-- Total releases across all repositories
SELECT 
    SUM(len(repository.releases.nodes)) as total_releases
FROM raw_GetRepoDataArtifacts;
```

### 3. Access Nested Fields

```sql
-- Get repository name and first release tag
SELECT 
    repository.name,
    repository.releases.nodes[1].tagName as latest_tag,
    repository.releases.nodes[1].createdAt as release_date
FROM raw_GetRepoDataArtifacts;
```

**Note**: DuckDB arrays are 1-indexed (first element is `[1]`, not `[0]`)

## Working with Arrays: UNNEST

### 4. Explode Releases into Rows

```sql
-- Get all releases for all repositories
SELECT 
    repository.name as repo_name,
    release.__typename,
    release.id,
    release.tagName,
    release.url,
    release.createdAt
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release;
```

This creates one row per release (array explosion).

### 5. Explode Release Assets

```sql
-- Get all release assets with their release info
SELECT 
    repository.name as repo_name,
    release.tagName as release_tag,
    asset.name as asset_name,
    asset.downloadUrl
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release,
LATERAL UNNEST(release.releaseAssets.nodes) AS asset;
```

This creates one row per asset (double explosion: releases × assets).

### 6. Filter During Unnesting

```sql
-- Only releases from 2024
SELECT 
    repository.name,
    release.tagName,
    release.createdAt
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
WHERE YEAR(release.createdAt) = 2024;
```

```sql
-- Only releases with version 1.x tags
SELECT 
    repository.name,
    release.tagName
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
WHERE release.tagName LIKE 'v1.%';
```

## Aggregations

### 7. Count Assets per Release

```sql
-- How many assets does each release have?
SELECT 
    repository.name as repo_name,
    release.tagName,
    len(release.releaseAssets.nodes) as asset_count
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
ORDER BY asset_count DESC;
```

### 8. Summary Statistics

```sql
-- Average assets per release
SELECT 
    repository.name,
    AVG(len(release.releaseAssets.nodes)) as avg_assets_per_release,
    MAX(len(release.releaseAssets.nodes)) as max_assets,
    COUNT(*) as total_releases
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
GROUP BY repository.name;
```

### 9. Find Latest Release

```sql
-- Latest release per repository
SELECT 
    repository.name,
    release.tagName,
    release.createdAt
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
WHERE release.createdAt = (
    SELECT MAX(r.createdAt)
    FROM UNNEST(repository.releases.nodes) AS r
);
```

## Advanced Queries

### 10. Create a Temporary Normalized View

```sql
-- Create a view that looks like a normalized table
CREATE VIEW releases_view AS
SELECT 
    repository.id as repository_id,
    repository.name as repository_name,
    release.id as release_id,
    release.tagName,
    release.url,
    release.createdAt
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release;

-- Now query it like a normal table
SELECT * FROM releases_view 
WHERE repository_name = 'cosign';
```

### 11. JSON Functions

```sql
-- Extract as JSON for further processing
SELECT 
    repository.name,
    to_json(repository.releases.nodes[1]) as latest_release_json
FROM raw_GetRepoDataArtifacts;
```

```sql
-- Check if a field exists
SELECT 
    repository.name,
    CASE 
        WHEN repository.releases.nodes IS NOT NULL 
        THEN 'Has releases'
        ELSE 'No releases'
    END as status
FROM raw_GetRepoDataArtifacts;
```

### 12. Filter by Nested Conditions

```sql
-- Repositories with at least one release that has assets
SELECT DISTINCT
    repository.name
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
WHERE len(release.releaseAssets.nodes) > 0;
```

```sql
-- Assets larger than 10MB (if size field exists)
SELECT 
    repository.name,
    release.tagName,
    asset.name,
    asset.size
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release,
LATERAL UNNEST(release.releaseAssets.nodes) AS asset
WHERE asset.size > 10485760;  -- 10MB in bytes
```

## Export Queries

### 13. Export to CSV

```sql
-- Export flattened releases to CSV
COPY (
    SELECT 
        repository.name as repo_name,
        release.tagName,
        release.createdAt
    FROM raw_GetRepoDataArtifacts,
    LATERAL UNNEST(repository.releases.nodes) AS release
) TO 'releases.csv' WITH (HEADER, DELIMITER ',');
```

### 14. Export to Parquet

```sql
-- Export to Parquet for analysis in Python
COPY (
    SELECT 
        repository.name as repo_name,
        release.tagName,
        asset.name as asset_name,
        asset.downloadUrl
    FROM raw_GetRepoDataArtifacts,
    LATERAL UNNEST(repository.releases.nodes) AS release,
    LATERAL UNNEST(release.releaseAssets.nodes) AS asset
) TO 'assets.parquet' (FORMAT PARQUET);
```

## Tips and Best Practices

### Accessing Nested Fields

Use dot notation for struct fields:
```sql
repository.releases.nodes
```

Use brackets for array indexing (1-indexed):
```sql
repository.releases.nodes[1]  -- First element
```

### LATERAL UNNEST

Use `LATERAL UNNEST` to explode arrays into rows:
```sql
FROM table,
LATERAL UNNEST(array_field) AS element
```

### NULL Handling

Check for NULL before accessing nested fields:
```sql
WHERE repository.releases.nodes IS NOT NULL
```

### Performance

- For large datasets, consider creating indexes on commonly filtered fields
- Use `DESCRIBE` to understand the nested structure before querying
- Create VIEWs for frequently used query patterns

## Common Patterns

### Pattern 1: Repository + All Releases

```sql
SELECT 
    repository.id,
    repository.name,
    release.tagName,
    release.createdAt
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release;
```

### Pattern 2: Repository + Release + All Assets

```sql
SELECT 
    repository.name,
    release.tagName,
    asset.name,
    asset.downloadUrl
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release,
LATERAL UNNEST(release.releaseAssets.nodes) AS asset;
```

### Pattern 3: Aggregation at Each Level

```sql
-- Count at each nesting level
SELECT 
    COUNT(DISTINCT repository.id) as repo_count,
    COUNT(DISTINCT release.id) as release_count,
    COUNT(*) as asset_count
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release,
LATERAL UNNEST(release.releaseAssets.nodes) AS asset;
```

## Example Analysis Workflows

### Workflow 1: Release Velocity Analysis

```sql
-- How many releases per month?
SELECT 
    repository.name,
    DATE_TRUNC('month', release.createdAt) as month,
    COUNT(*) as releases_per_month
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
GROUP BY repository.name, month
ORDER BY repository.name, month;
```

### Workflow 2: Asset Type Distribution

```sql
-- What types of assets are published?
SELECT 
    repository.name,
    CASE 
        WHEN asset.name LIKE '%.tar.gz' THEN 'tarball'
        WHEN asset.name LIKE '%.zip' THEN 'zip'
        WHEN asset.name LIKE '%.exe' THEN 'windows exe'
        WHEN asset.name LIKE '%.deb' THEN 'debian package'
        ELSE 'other'
    END as asset_type,
    COUNT(*) as count
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release,
LATERAL UNNEST(release.releaseAssets.nodes) AS asset
GROUP BY repository.name, asset_type
ORDER BY repository.name, count DESC;
```

### Workflow 3: Latest Release Summary

```sql
-- For each repo, get the latest release and its asset count
SELECT 
    repository.name,
    release.tagName as latest_version,
    release.createdAt as release_date,
    len(release.releaseAssets.nodes) as asset_count
FROM raw_GetRepoDataArtifacts,
LATERAL UNNEST(repository.releases.nodes) AS release
WHERE release.createdAt = (
    SELECT MAX(r.createdAt)
    FROM UNNEST(repository.releases.nodes) AS r
);
```

## Integration with Python

Once you've prototyped your queries in DuckDB, load into pandas:

```python
import duckdb

con = duckdb.connect('database.db')

# Run your query
df = con.execute("""
    SELECT 
        repository.name,
        release.tagName,
        release.createdAt
    FROM raw_GetRepoDataArtifacts,
    LATERAL UNNEST(repository.releases.nodes) AS release
""").df()

# Now use pandas for further analysis
print(df.describe())
df.to_csv('results.csv')
```

## Next Steps

Once you're comfortable querying the raw data, you can:

1. **Create normalized tables** - The pipeline will soon generate proper relational tables automatically
2. **Use Python for complex transformations** - Load into pandas/polars for advanced analysis
3. **Build dashboards** - Connect BI tools directly to the DuckDB database

The raw table gives you complete flexibility - query it however you need!
