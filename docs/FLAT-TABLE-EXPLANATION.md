# Fully Flattened Table Explanation

## What is the `flat_<QueryName>` Table?

The `flat_<QueryName>` table is the **direct DuckDB equivalent of `pandas.json_normalize()`**. It provides a **completely flat, spreadsheet-ready view** of your GraphQL data with:

- **All arrays exploded into rows** (e.g., releases → multiple rows per repository)
- **All nested structures expanded into columns** (e.g., `release.tagName` → `tagName` column)
- **Only primitive types** (VARCHAR, INT, TIMESTAMP, BOOLEAN, etc.)
- **No STRUCT or ARRAY columns** - everything is queryable with simple SQL

## How It Works

### Input: Nested GraphQL Response

```json
{
  "repository": {
    "name": "cosign",
    "releases": {
      "nodes": [
        {
          "tagName": "v0.1.0",
          "releaseAssets": {
            "nodes": [
              {"name": "cosign.sig", "downloadUrl": "https://..."},
              {"name": "cosign-linux-amd64", "downloadUrl": "https://..."}
            ]
          }
        },
        {
          "tagName": "v0.2.0",
          "releaseAssets": {"nodes": [...]}
        }
      ]
    }
  }
}
```

### Output: Fully Flat Table

```
| name   | tagName | name_2             | downloadUrl        |
|--------|---------|--------------------|--------------------|
| cosign | v0.1.0  | cosign.sig         | https://...        |
| cosign | v0.1.0  | cosign-linux-amd64 | https://...        |
| cosign | v0.2.0  | asset1.zip         | https://...        |
```

**1 repository** → **30+ rows** (one per release asset)

## The Flattening Algorithm

The pipeline uses **iterative unnesting** to achieve complete flattening:

```typescript
while (hasNestedColumns) {
  for each column:
    if (column.type ends with '[]'):
      // It's an array - explode into multiple rows
      LATERAL UNNEST(array_column)
    
    else if (column.type starts with 'STRUCT'):
      // It's a nested object - expand into columns  
      UNNEST(struct_column)
}
```

### Example Iteration Sequence

For the GitHub GraphQL response:

1. **Iteration 1**: Unnest `repository` STRUCT → expand to `name`, `id`, `releases`, etc.
2. **Iteration 2**: Unnest `releases` STRUCT → expand to `nodes` array
3. **Iteration 3**: Unnest `nodes[]` ARRAY → **explode releases into rows**
4. **Iteration 4**: Unnest `nodes` STRUCT → expand to `tagName`, `url`, `releaseAssets`, etc.
5. **Iteration 5**: Unnest `releaseAssets` STRUCT → expand to `nodes` array
6. **Iteration 6**: Unnest `nodes[]` ARRAY → **explode assets into rows**
7. **Iteration 7**: Unnest `nodes` STRUCT → expand to `name`, `downloadUrl`, etc.
8. **Iteration 8**: **All primitive types** - DONE! ✅

Total: **8 unnesting iterations** → **fully flat table**

## Why This Matters

### Immediate Spreadsheet Analysis

```bash
# Export to CSV
duckdb database.db -c "COPY flat_GetRepoDataArtifacts TO 'flat.csv'"

# Open in Excel, Google Sheets, etc.
open flat.csv
```

### Simple SQL Queries

No complex `UNNEST` or `LATERAL` needed - everything is already flat:

```sql
-- Count assets per repository
SELECT name, COUNT(*) as asset_count
FROM flat_GetRepoDataArtifacts
GROUP BY name;

-- Filter by tag pattern
SELECT name, tagName, downloadUrl
FROM flat_GetRepoDataArtifacts
WHERE tagName LIKE 'v1.%';

-- Latest assets only
SELECT name, tagName, name_2 as asset_name, downloadUrl
FROM flat_GetRepoDataArtifacts
WHERE tagName = (SELECT MAX(tagName) FROM flat_GetRepoDataArtifacts);
```

### Python Integration (pandas/polars)

```python
import duckdb

# Load as DataFrame
df = duckdb.query("""
    SELECT * FROM 'output/.../parquet/flat_GetRepoDataArtifacts.parquet'
""").df()

# Or directly with pandas
import pandas as pd
df = pd.read_parquet('output/.../parquet/flat_GetRepoDataArtifacts.parquet')
```

This is **identical** to:

```python
import pandas as pd
import json

# The "old way" - requires pandas.json_normalize()
with open('responses.json') as f:
    data = json.load(f)

df = pd.json_normalize(
    data,
    record_path=['repository', 'releases', 'nodes', 'releaseAssets', 'nodes'],
    meta=[
        ['repository', 'name'],
        ['repository', 'releases', 'nodes', 'tagName'],
        # ... manually specify every nested path ...
    ],
    sep='_'
)
```

**The pipeline does this automatically** - no manual path specification needed!

## Column Naming

When structs are unnested, column names may get numeric suffixes to avoid conflicts:

- `__typename` - Repository type
- `id` - Repository ID
- `name` - Repository name
- `__typename_1` - Release type
- `id_1` - Release ID
- `name_1` - Release name (same field name as repo)
- `tagName` - Release tag
- `__typename_2` - Asset type
- `id_2` - Asset ID
- `name_2` - Asset name (same field name as repo and release)
- `downloadUrl` - Asset download URL

The numeric suffixes (`_1`, `_2`) distinguish between identically-named fields at different nesting levels.

## Use Cases

### 1. Quick Data Exploration

```sql
-- See all columns and types
DESCRIBE flat_GetRepoDataArtifacts;

-- Sample data
SELECT * FROM flat_GetRepoDataArtifacts LIMIT 10;
```

### 2. Reporting & Dashboards

Connect BI tools (Tableau, Power BI, Metabase) directly to the flat table - no ETL needed.

### 3. Ad-Hoc Analysis

```sql
-- Which repositories have the most releases?
SELECT name, COUNT(DISTINCT tagName) as release_count
FROM flat_GetRepoDataArtifacts
GROUP BY name
ORDER BY release_count DESC;

-- Average assets per release
SELECT AVG(asset_count) as avg_assets
FROM (
    SELECT name, tagName, COUNT(*) as asset_count
    FROM flat_GetRepoDataArtifacts
    GROUP BY name, tagName
);
```

### 4. Data Export

```bash
# Export to CSV
duckdb database.db -c "COPY flat_GetRepoDataArtifacts TO 'analysis.csv'"

# Export to Parquet (already done by pipeline)
ls output/*/parquet/flat_GetRepoDataArtifacts.parquet
```

## Raw vs Flat Table Comparison

| Feature | `raw_<QueryName>` | `flat_<QueryName>` |
|---------|-------------------|-------------------|
| **Structure** | Nested (exact GraphQL) | Completely flat |
| **Column Types** | STRUCTs, arrays | Primitives only |
| **Rows** | 1 per query input | Many (arrays exploded) |
| **Use Case** | Preserve exact response | Immediate analysis |
| **Query Complexity** | Requires UNNEST | Simple SELECT |
| **Spreadsheet Ready** | ❌ No | ✅ Yes |
| **pandas.json_normalize()** | ❌ No | ✅ Equivalent |

## Performance Notes

- **Iteration count**: Depends on nesting depth (typically 5-10 iterations)
- **Row explosion**: 1 input → N rows (where N = product of all array lengths)
- **Column count**: All leaf fields become columns
- **Memory**: Flat table uses more memory than raw (data is duplicated across rows)
- **Query speed**: Flat table is **faster** for most queries (no unnesting at query time)

## Limitations & Trade-offs

### Array Explosion

If a repository has 10 releases, each with 5 assets, the flat table will have **50 rows** for that repository. Repository-level fields (`name`, `id`) are duplicated across all rows.

### Column Name Conflicts

Identically-named fields at different levels get numeric suffixes (`name`, `name_1`, `name_2`). This can make queries verbose but ensures no data loss.

### Loss of Hierarchy

The flat table doesn't preserve the tree structure. If you need to reconstruct relationships, use the `raw_` table or create separate normalized tables.

## When to Use Each Table

### Use `flat_<QueryName>` when:
- ✅ You need immediate spreadsheet export
- ✅ You're doing ad-hoc analysis in SQL
- ✅ You're connecting a BI tool
- ✅ You want pandas DataFrame-like behavior
- ✅ Query simplicity is more important than storage

### Use `raw_<QueryName>` when:
- ✅ You need to preserve the exact GraphQL structure
- ✅ You're building normalized relational tables
- ✅ Storage efficiency matters
- ✅ You want to control unnesting behavior
- ✅ You need the hierarchical relationships

## Example: Complete Workflow

```bash
# 1. Run the pipeline
npx ts-node src/main.ts \
  --endpoint https://api.github.com/graphql \
  --query src/graphql/GetRepoDataArtifacts.graphql \
  --input input/repos.jsonl

# 2. Verify the flat table
duckdb output/.../database.db -c "DESCRIBE flat_GetRepoDataArtifacts"

# 3. Export to CSV for Excel
duckdb output/.../database.db -c "COPY flat_GetRepoDataArtifacts TO 'flat.csv'"

# 4. Or load into Python
python -c "
import duckdb
df = duckdb.query('SELECT * FROM \"output/.../database.db\".flat_GetRepoDataArtifacts').df()
print(df.head())
"
```

No complex unnesting SQL required - the data is ready to analyze!

## Summary

The `flat_<QueryName>` table is the **pandas.json_normalize() equivalent** for DuckDB:

- 🚀 **No Python required** - pure SQL flattening
- 🎯 **Automatic** - no manual path specification
- 📊 **Spreadsheet ready** - CSV export in one command
- 🔍 **Simple queries** - no UNNEST/LATERAL needed
- ⚡ **Fast** - flattening happens once at write time, not every query

**Bottom line**: If you want to analyze GraphQL data in a spreadsheet or with simple SQL, use the `flat_` table. It's a one-liner data export away from Excel, pandas, or your BI tool.
