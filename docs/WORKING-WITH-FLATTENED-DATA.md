# Working with Fully Flattened Data

## Overview

The pipeline now creates **two versions** of your data:

1. **`raw_<QueryName>`** - Preserves the complete nested GraphQL structure
2. **`flat_<QueryName>`** - **FULLY FLATTENED** for immediate spreadsheet/SQL analysis

The flat table is the **direct equivalent of `pandas.json_normalize()`** - all nested arrays are exploded into rows, and all nested structs are expanded into columns. This creates a **completely flat, spreadsheet-ready dataset** with only primitive types (VARCHAR, INT, TIMESTAMP, etc.).

Both tables are available in:
- The DuckDB database (`.db` file)
- Individual Parquet files  
- CSV export (for the flat table)

## Flattening Process

The `flat_<QueryName>` table is created through **iterative unnesting**:

1. **Load GraphQL response** with `read_json_auto()`
2. **Detect nested columns** (STRUCTs and arrays)
3. **For each nested column**:
   - If it's an **array** (`TYPE[]`) → **explode into multiple rows** using `LATERAL UNNEST`
   - If it's a **struct** (`STRUCT(...)`) → **expand into multiple columns** using `UNNEST`
4. **Repeat** until all columns are primitive types

For the cosign repository example:
- **Input**: 1 repository with nested releases and assets
- **Output**: 30 rows (one per release asset) × 14 columns
- **Iterations**: 8 unnesting steps to reach fully flat structure

This is **exactly** what `pandas.json_normalize()` does - complete recursive flattening.

##
- The DuckDB database (`.db` file)
- Individual Parquet files

## Table Structure

### Raw Table (`raw_GetRepoDataArtifacts`)

Preserves the exact GraphQL response structure:

```sql
┌─────────────┬──────────────────────────┐
│ column_name │      column_type         │
├─────────────┼──────────────────────────┤
│ repository  │ STRUCT(__typename, id,   │
│             │   name, releases, ...)   │
└─────────────┴──────────────────────────┘
```

### Flattened Table (`flat_GetRepoDataArtifacts`)

Top-level struct is unpacked into individual columns:

```sql
┌───────────────┬────────────────────────┐
│  column_name  │     column_type        │
├───────────────┼────────────────────────┤
│ __typename    │ VARCHAR                │
│ id            │ VARCHAR                │
│ name          │ VARCHAR                │
│ nameWithOwner │ VARCHAR                │
│ releases      │ STRUCT(nodes ...)      │
└───────────────┴────────────────────────┘
```

## Querying Examples

### Simple Queries (Flattened Table)

Most analytics queries are simpler with the flattened table:

```sql
-- Get repository names
SELECT name, nameWithOwner 
FROM flat_GetRepoDataArtifacts;

-- Filter repositories
SELECT * 
FROM flat_GetRepoDataArtifacts 
WHERE name LIKE '%cosign%';
```

### Nested Data Access

You can still access nested data using dot notation:

```sql
-- Access nested struct fields
SELECT 
    name,
    releases.nodes[1].tagName as latest_release
FROM flat_GetRepoDataArtifacts;
```

### Full Normalization with UNNEST

To fully flatten nested arrays (like releases):

```sql
-- Expand releases into rows
SELECT 
    name,
    UNNEST(releases.nodes) as release
FROM flat_GetRepoDataArtifacts;

-- Extract specific release fields
SELECT 
    name,
    UNNEST(releases.nodes).tagName as tag,
    UNNEST(releases.nodes).createdAt as created
FROM flat_GetRepoDataArtifacts;
```

### Creating Your Own Normalized Tables

You can create additional normalized tables from the flattened data:

```sql
-- Create a releases table
CREATE TABLE releases AS
SELECT 
    name as repository_name,
    id as repository_id,
    UNNEST(releases.nodes, recursive := false) as release_data
FROM flat_GetRepoDataArtifacts;

-- Then expand the release_data struct
CREATE OR REPLACE TABLE releases AS
SELECT 
    repository_name,
    repository_id,
    unnest(release_data)
FROM releases;
```

## Working with Parquet Files

Both raw and flat tables are exported as Parquet files:

```bash
output/GetRepoDataArtifacts-2025-10-11T23-54-55/parquet/
├── raw_GetRepoDataArtifacts.parquet    # Nested structure preserved
└── flat_GetRepoDataArtifacts.parquet   # Top-level unpacked
```

### Load in DuckDB CLI

```bash
# Query the flattened Parquet directly
duckdb -c "SELECT * FROM 'output/.../parquet/flat_GetRepoDataArtifacts.parquet' LIMIT 5"

# Query with filtering
duckdb -c "SELECT name FROM 'output/.../parquet/flat_GetRepoDataArtifacts.parquet' WHERE __typename = 'Repository'"
```

### Load in Python (Pandas/Polars)

```python
import duckdb
import pandas as pd

# Method 1: Via DuckDB
df = duckdb.query("""
    SELECT * FROM 'output/.../parquet/flat_GetRepoDataArtifacts.parquet'
""").df()

# Method 2: Direct with pandas
df = pd.read_parquet('output/.../parquet/flat_GetRepoDataArtifacts.parquet')

# Method 3: With polars
import polars as pl
df = pl.read_parquet('output/.../parquet/flat_GetRepoDataArtifacts.parquet')
```

## Comparison: Raw vs Flat

| Feature | Raw Table | Flat Table |
|---------|-----------|------------|
| **Structure** | Exact GraphQL response | Top-level structs unpacked |
| **Use Case** | Exact response preservation | Analytics, reporting |
| **Query Complexity** | More nesting required | Simpler for most queries |
| **Column Count** | Fewer (nested) | More (unpacked) |
| **Best For** | Archival, debugging | Analysis, dashboards |

## Tips

### When to Use Raw Table

- Need exact GraphQL response format
- Archiving/auditing responses
- Debugging data issues
- Working with tools that expect nested JSON

### When to Use Flat Table

- Analytics queries
- Dashboard building
- Simple filtering/aggregation
- Most SQL use cases

### Further Normalization

If you need fully normalized tables (e.g., separate tables for repositories, releases, assets), you can create them from the flat table using `UNNEST` and `CREATE TABLE AS` statements. This gives you full control over the normalization level.

## Examples

### Count Releases Per Repository

```sql
SELECT 
    name,
    len(releases.nodes) as release_count
FROM flat_GetRepoDataArtifacts
ORDER BY release_count DESC;
```

### Get Latest Release

```sql
SELECT 
    name,
    releases.nodes[1].tagName as latest_tag,
    releases.nodes[1].createdAt as release_date
FROM flat_GetRepoDataArtifacts;
```

### Fully Flatten Everything

```sql
-- Create a fully normalized view
CREATE VIEW releases_normalized AS
SELECT 
    r.name as repo_name,
    r.nameWithOwner as repo_full_name,
    rel.tagName,
    rel.createdAt,
    rel.url
FROM flat_GetRepoDataArtifacts r,
LATERAL (
    SELECT unnest(releases.nodes, recursive := false) as rel
) 
WHERE rel IS NOT NULL;
```

## Performance Tips

1. **Use the flat table** for most analytics - it's optimized for columnar access
2. **Filter early** - Use WHERE clauses before unnesting
3. **Project only needed columns** - Don't SELECT * if you only need a few fields
4. **Use DuckDB's columnar format** - Parquet files are already optimized for analytics
5. **Create indexes** in DuckDB if doing repeated queries on the same fields
