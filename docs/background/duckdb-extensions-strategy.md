# DuckDB Extensions Strategy

## Overview

This document outlines our strategy for leveraging DuckDB extensions to enhance the GitHub Repository Supply Chain Security Analysis toolkit. Extensions provide additional functionality for text search, JSON processing, HTTP access, and more.

## Extension Evaluation

### 🔥 MUST INSTALL (Immediate Value)

#### 1. `fts` (Full-Text Search) ✅ ENABLED
**Why it's critical:**
- Workflow files contain YAML with tool names, commands, and configurations
- Repository descriptions and README content need to be searchable
- Release notes and artifact names are text-heavy
- Current tool detection uses pattern matching—FTS enables sophisticated searches

**Use cases:**
```sql
-- Find all workflows mentioning specific tools
CREATE INDEX idx_workflow_fts ON base_workflows USING FTS(content);
SELECT * FROM base_workflows WHERE content MATCH 'cosign OR sigstore';

-- Search repository descriptions for supply chain keywords
SELECT * FROM base_repositories 
WHERE description MATCH 'supply chain OR sbom OR provenance';
```

**Impact:** 🚀 Dramatically improves tool detection and exploration capabilities

#### 2. `json` (JSON Processing) ✅ ENABLED
**Why we need it:**
- Already handling JSON (GraphQL responses, workflow artifacts)
- GitHub API returns deeply nested JSON structures
- `security_features` column stores JSON
- Future: Parse workflow JSON configs, GitHub Actions metadata

**Use cases:**
```sql
-- Extract specific fields from security_features JSON
SELECT nameWithOwner, 
       json_extract(security_features, '$.dependabot_enabled') as has_dependabot
FROM base_repositories;

-- Parse complex workflow definitions
SELECT workflow_id, json_extract(workflow_data, '$.jobs.*.steps[*].uses') 
FROM base_workflows;
```

**Impact:** ⚡ Cleaner queries, less TypeScript preprocessing, better JSON handling

#### 3. `httpfs` (HTTP File System) 🔜 FUTURE
**Why it's a game-changer:**
- Query external data sources without downloading
- Integrate with public security datasets
- Future-proof for federated queries

**Use cases:**
```sql
-- Query CNCF landscape data directly from GitHub
SELECT * FROM read_json('https://landscape.cncf.io/data.json');

-- Integrate with OSSF Scorecards
SELECT * FROM read_csv('https://api.securityscorecards.dev/projects/...csv');

-- Compare analysis with public vulnerability databases
SELECT r.nameWithOwner, v.* 
FROM base_repositories r
JOIN read_json('https://nvd.nist.gov/feeds/...') v 
  ON r.nameWithOwner LIKE '%' || v.project || '%';
```

**Impact:** 🌐 Enables federated queries across local + remote datasets

### 🎯 HIGHLY RECOMMENDED (Near-Term Value)

#### 4. `http` (HTTP Requests from SQL) 🔜 FUTURE
**Why it's powerful:**
- Make HTTP requests directly from SQL queries
- Verify artifact URLs are still valid
- Enrich data with external API calls
- Active monitoring/alerting

**Use cases:**
```sql
-- Verify release artifact URLs are still accessible
SELECT name, tag_name, 
       http_get(browser_download_url).status as url_status
FROM base_release_assets
WHERE name LIKE '%.sbom.json';

-- Check if tools are latest versions
SELECT tool_name, 
       http_get('https://api.github.com/repos/' || tool_name || '/releases/latest')
FROM agg_workflow_tools;
```

**Impact:** 🔗 Active queries that verify/enrich data in real-time

### 📊 USEFUL FOR DEVELOPMENT (Install When Needed)

#### 5. `visualizer` (Query Plan Visualization)
**When to use:**
- SQL models are getting complex (already 4 stages)
- Need to optimize slow aggregation queries
- Debugging performance issues

#### 6. `duckdb_ast` (Abstract Syntax Tree Inspection)
**When to use:**
- Building meta-tools (SQL generators, linters)
- Validating generated SQL
- Educational/debugging

### ❌ NOT RECOMMENDED (For Now)

| Extension | Why Skip |
|-----------|----------|
| `excel` | No Excel data sources in pipeline |
| `sqlite` | No SQLite integration needed |
| `spatial` | No geospatial analysis required |
| `postgres`/`mysql` | No external DB connections currently |
| `iceberg` | Not using Apache Iceberg table format |
| `jemalloc` | Premature optimization |
| `autocomplete` | For CLI users, we use programmatic API |
| `arrow` | Already using Parquet |
| `parquet` | Built-in to DuckDB core |

## Implementation Strategy

### Phase 1: Foundation (Current)
- ✅ `fts` - Full-text search for workflows and descriptions
- ✅ `json` - Enhanced JSON processing

### Phase 2: Expansion (Next Sprint)
- 🔜 `httpfs` - Federated queries to remote datasets
- 🔜 `http` - Active URL validation and API enrichment

### Phase 3: Optimization (As-Needed)
- `visualizer` - Query performance tuning
- `duckdb_ast` - SQL metaprogramming

## Architecture Integration

### Extension Loading
Extensions are loaded during database initialization in a dedicated function:

```typescript
async initializeExtensions(): Promise<void> {
    await this.con!.run("INSTALL fts; LOAD fts;");
    await this.con!.run("INSTALL json; LOAD json;");
}
```

### FTS Indexes
Full-text search indexes are created on text-heavy columns:

```sql
-- Workflow content search
CREATE INDEX IF NOT EXISTS idx_workflows_content_fts 
ON base_workflows USING FTS(content);

-- Repository description search
CREATE INDEX IF NOT EXISTS idx_repositories_description_fts 
ON base_repositories USING FTS(description);
```

### Tool Detection Enhancement
Leveraging FTS for better tool detection:

```sql
-- Before: Pattern matching with LIKE
WHERE workflow_content LIKE '%cosign%'

-- After: Full-text search
WHERE workflow_content MATCH 'cosign OR sigstore OR fulcio'
```

### JSON Processing
Using JSON functions for cleaner queries:

```sql
-- Before: Parse JSON in TypeScript
-- After: Query JSON directly in SQL
SELECT nameWithOwner,
       json_extract(security_features, '$.dependabot_enabled') as has_dependabot
FROM base_repositories;
```

## Future Enhancements

### Federated Security Analysis
Once `httpfs` is enabled:
```sql
-- Compare against OSSF Scorecards
SELECT r.nameWithOwner, r.stargazerCount,
       s.score, s.checks
FROM base_repositories r
LEFT JOIN read_json('https://api.securityscorecards.dev/projects/...') s
  ON r.nameWithOwner = s.repo;
```

### Active Verification
Once `http` is enabled:
```sql
-- Find broken SBOM artifact URLs
SELECT r.nameWithOwner, a.name, a.browser_download_url
FROM base_release_assets a
JOIN base_repositories r ON a.repository_id = r.id
WHERE a.name LIKE '%.sbom%'
  AND http_head(a.browser_download_url).status != 200;
```

## Benefits

1. **Performance**: FTS indexes dramatically speed up text searches
2. **Clarity**: SQL-native JSON processing reduces TypeScript complexity
3. **Extensibility**: Foundation for federated queries and external enrichment
4. **Maintainability**: Database capabilities match data processing needs
5. **Future-Proof**: Ready for advanced analytics and integrations

## References

- [DuckDB Extensions Documentation](https://duckdb.org/docs/extensions/overview)
- [Full-Text Search Extension](https://duckdb.org/docs/extensions/full_text_search)
- [JSON Extension](https://duckdb.org/docs/extensions/json)
