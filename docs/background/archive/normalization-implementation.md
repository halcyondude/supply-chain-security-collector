# Schema-Driven Normalization Implementation Plan

## Goal
Replace the complex iterative JSON flattening with clean, typed, schema-driven relational normalization.

## Architecture Changes

### REMOVE (Complex, Wrong Tool)
- ❌ Iterative SQL flattening logic (lines 65-165 in ArtifactWriter.ts)
- ❌ Dynamic SQL generation for UNNEST operations
- ❌ `flat_<QueryName>` table (pandas-style single wide table)

### KEEP (Working Well)
- ✅ Raw table creation with `read_json_auto()`
- ✅ Parquet export
- ✅ DuckDB database file creation
- ✅ Metadata tracking

### ADD (Schema-Driven)
- ✅ Query-specific normalizer modules (TypeScript)
- ✅ Typed entity extraction from GraphQL responses
- ✅ Proper relational tables with foreign keys
- ✅ Documentation for querying raw data

## Implementation Steps

### Step 1: Create Normalizer Module ✅ DONE
File: `src/normalizers/GetRepoDataArtifactsNormalizer.ts`

```typescript
export function normalizeGetRepoDataArtifacts(
    responses: GetRepoDataArtifactsQuery[]
): GetRepoDataArtifactsNormalized {
    // Extract entities using TypeScript features
    const repositories = responses.map(r => ({...}));
    const releases = responses.flatMap(r => ...);
    const assets = responses.flatMap(r => ...);
    return { repositories, releases, assets };
}
```

### Step 2: Update ArtifactWriter.ts
Replace flattening logic with:

```typescript
// Import normalizer
import { normalizeGetRepoDataArtifacts } from './normalizers/GetRepoDataArtifactsNormalizer';

// In writeArtifacts():
// After creating raw table:
const normalized = normalizeGetRepoDataArtifacts(responses as GetRepoDataArtifactsQuery[]);

// Insert into DuckDB
await con.execute("CREATE TABLE repositories AS SELECT * FROM normalized.repositories");
await con.execute("CREATE TABLE releases AS SELECT * FROM normalized.releases");
await con.execute("CREATE TABLE release_assets AS SELECT * FROM normalized.assets");
```

### Step 3: Update exportTablesToParquet()
Export all tables including normalized ones:

```typescript
const tables = await con.query("SHOW TABLES");
for (const table of tables) {
    await con.execute(`COPY ${table.name} TO '${parquetDir}/${table.name}.parquet'`);
}
```

### Step 4: Add Documentation ✅ DONE
File: `docs/QUERYING-RAW-DATA.md`
- Examples of DuckDB JSON querying
- UNNEST patterns
- Common analysis queries

### Step 5: Add Optional Python Flattening Script
File: `scripts/flatten.py`

```python
import duckdb
import pandas as pd
import sys

# For users who want pandas-style flat tables
con = duckdb.connect(sys.argv[1])
df = con.execute(f"SELECT * FROM {sys.argv[2]}").df()
flat = pd.json_normalize(df.to_dict('records'), sep='_')
con.execute(f"CREATE TABLE flat_{sys.argv[2]} AS SELECT * FROM flat")
```

## Benefits

### TypeScript Strengths Leveraged
- ✅ Type-safe entity extraction
- ✅ Compile-time validation
- ✅ IDE autocomplete for nested fields
- ✅ Spread operator, flatMap, destructuring
- ✅ Working with objects, not JSON strings

### Simpler Codebase
- Remove ~100 lines of complex SQL generation
- Replace with ~50 lines of clean TypeScript
- Much easier to debug and maintain

### Better Output
- Proper relational tables (3NF)
- Foreign keys between entities
- Query-optimized structure
- Still have raw data for flexibility

### User Experience
- Raw table with full nested data
- Normalized tables for relational queries
- Optional Python script for flat exports
- Clear documentation for all approaches

## Migration Path

1. ✅ Create normalizer module
2. ✅ Add documentation
3. Update ArtifactWriter to use normalizer
4. Test with single repository
5. Test with multiple repositories
6. Add Python flattening script (optional)
7. Update README with new architecture

## Testing

```bash
# Test basic normalization
npx ts-node src/main.ts \
  --endpoint https://api.github.com/graphql \
  --query src/graphql/GetRepoDataArtifacts.graphql \
  --input input/test-single.jsonl

# Verify tables
duckdb output/.../database.db -c "SHOW TABLES"
# Should see: raw_GetRepoDataArtifacts, repositories, releases, release_assets

# Verify relationships
duckdb output/.../database.db -c "
  SELECT r.name, COUNT(rel.id) as release_count
  FROM repositories r
  LEFT JOIN releases rel ON r.id = rel.repository_id
  GROUP BY r.name
"
```

## Success Criteria

- ✅ Normalizer module compiles without errors
- ✅ Documentation created
- ⏳ ArtifactWriter updated
- ⏳ TypeScript compiles cleanly
- ⏳ Pipeline creates all expected tables
- ⏳ Foreign keys work correctly
- ⏳ Parquet export includes normalized tables
- ⏳ Test with 1 and 3 repositories
