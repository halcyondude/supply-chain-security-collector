# Neo.ts - Clean GraphQL Data Collector

## What It Does

**Simple 4-step pipeline:**
1. **Fetch** - Get GraphQL data from API
2. **Log** - Write to audit trail (raw-responses.jsonl)
3. **Store** - Create DuckDB database with normalized tables
4. **Export** - Generate Parquet files and documentation

## Usage

```bash
# Standard query (releases & artifacts)
npx ts-node src/neo.ts --input repos.jsonl

# Extended query (+ workflows, security, branch protection)
npx ts-node src/neo.ts --input repos.jsonl --extended

# Parallel execution for faster batch processing
npx ts-node src/neo.ts --input repos.jsonl --parallel

# Verbose logging
npx ts-node src/neo.ts --input repos.jsonl --verbose
```

## Input Format

Create a JSONL file with one repository per line:

```jsonl
{"owner":"microsoft","name":"vscode"}
{"owner":"kubernetes","name":"kubernetes"}
{"owner":"hashicorp","name":"terraform"}
```

## Output Structure

```
output/
└── repos-2025-10-12T02-50-57/
    ├── raw-responses.jsonl          # Audit trail
    ├── database.db                  # DuckDB database
    ├── TABLES.md                    # Schema documentation
    └── parquet/
        ├── raw_GetRepoDataArtifacts.parquet
        ├── repositories.parquet
        ├── releases.parquet
        └── release_assets.parquet
```

## Database Schema

### Standard Query (GetRepoDataArtifacts)
Creates 4 tables:
- `raw_GetRepoDataArtifacts` - Complete nested JSON
- `repositories` - One row per repo
- `releases` - One row per release (FK: repository_id)
- `release_assets` - One row per asset (FK: release_id)

### Extended Query (GetRepoDataExtendedInfo)  
Creates 6 tables:
- `raw_GetRepoDataExtendedInfo` - Complete nested JSON
- `repositories` - With license info flattened
- `branch_protection_rules` - Default + additional branches
- `releases` - Release metadata
- `release_assets` - Asset files
- `workflows` - CI/CD workflow files from `.github/workflows/`

## Why This Design?

**Before:** TypeScript → Analysis → Reports → Data Storage
**After:** TypeScript → Data Storage → User does analysis with SQL

**Benefits:**
- ✅ Simple: 189 lines vs 1,305 lines
- ✅ Generic: Not tied to specific domain
- ✅ Flexible: Any analysis via SQL queries
- ✅ Fast: DuckDB optimized for analytics
- ✅ Maintainable: Clear separation of concerns

## Example Queries

```sql
-- Count releases per repository
SELECT r.nameWithOwner, COUNT(rel.id) as release_count
FROM repositories r
LEFT JOIN releases rel ON r.id = rel.repository_id
GROUP BY r.nameWithOwner;

-- Find assets by type
SELECT r.nameWithOwner, rel.tagName, a.name, a.size
FROM repositories r
JOIN releases rel ON r.id = rel.repository_id
JOIN release_assets a ON rel.id = a.release_id
WHERE a.name LIKE '%.tar.gz'
ORDER BY a.size DESC;

-- Check branch protection
SELECT r.nameWithOwner, bp.pattern, bp.isDefaultBranch
FROM repositories r
JOIN branch_protection_rules bp ON r.id = bp.repository_id
WHERE bp.isDefaultBranch = true;
```

## Code Structure

```typescript
neo.ts (189 lines)
├── CLI parsing (Commander)
├── Environment validation (GITHUB_TOKEN)
├── Output directory setup
├── Input file reading (JSONL)
├── GraphQL client creation
├── Data fetching loop
│   ├── Sequential or parallel execution
│   ├── Error handling per repo
│   └── Audit trail logging
├── DuckDB database creation
│   └── writeArtifacts() orchestration
└── Summary reporting
```

## Dependencies Used

**Core:**
- `graphql-request` - GraphQL client
- `@duckdb/node-api` - DuckDB database
- `apache-arrow` - Columnar data format
- `commander` - CLI argument parsing
- `chalk` - Console colors
- `dotenv` - Environment variables

**Generated:**
- `src/generated/graphql.ts` - TypeScript types from GraphQL schema

## No More Mocks

Removed complex mock system. For testing:
- Use small real repositories
- Use GitHub's public repos (no auth needed for public data)
- Create integration test with known good repos

## Environment Setup

```bash
# Required
export GITHUB_TOKEN=ghp_your_token_here

# Or create .env file
echo "GITHUB_TOKEN=ghp_your_token_here" > .env
```

## Comparison to Old Approach

| Aspect | Old (main.ts) | New (neo.ts) |
|--------|---------------|--------------|
| Lines of code | 405 + 900 (analysis/report) | 189 |
| Dependencies | 12 | 6 |
| Mock system | Yes (complex) | No (simple) |
| Analysis | TypeScript | SQL (DuckDB) |
| Reports | CSV + JSON + MD | DuckDB + Parquet |
| Domain-specific | Supply chain security | Generic GraphQL |
| Tables | cli-table3 | Console output |
| Flexibility | Fixed analysis | Any SQL query |

## Next Steps

1. ✅ Created clean neo.ts
2. ⏳ Test with real GITHUB_TOKEN
3. ⏳ Verify DuckDB tables created correctly
4. ⏳ Test parallel execution
5. ⏳ Replace main.ts with neo.ts
6. ⏳ Update README
7. ⏳ Clean up package.json scripts
