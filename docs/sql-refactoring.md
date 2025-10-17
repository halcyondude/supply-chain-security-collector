# SQL Refactoring - Moving Business Logic from TypeScript to SQL

## Summary

Refactored the reporting system to eliminate hard-coded SQL queries in TypeScript by creating SQL views that encapsulate all business logic. TypeScript now simply queries these views and formats output.

## Architecture Improvement

**Before:** Business logic scattered across TypeScript with hard-coded tool names and complex SQL
**After:** Business logic centralized in SQL views; TypeScript does simple SELECT * queries

## Changes Made

### 1. New SQL Model: `04_summary_views.sql`

Created two new views:

#### `agg_executive_summary`
Single-row view with overall statistics:
- Total repositories
- SBOM/signature/attestation adoption counts and percentages
- Release, asset, and workflow totals
- Tool category adoption counts

#### `agg_tool_summary`
One row per detected tool with:
- Tool name and category
- Repository count
- Workflow count  
- Adoption percentage

**Key Benefits:**
- Automatically includes ALL detected tools (no hard-coding)
- Easy to query: `SELECT * FROM agg_tool_summary`
- Business logic stays in SQL where it belongs

### 2. Updated SecurityAnalyzer.ts

Added `04_summary_views.sql` to the analysis pipeline:
```typescript
await this.runModel('01_artifact_analysis.sql');
await this.runModel('02_workflow_tool_detection.sql');
await this.runModel('03_repository_security_summary.sql');
await this.runModel('04_summary_views.sql');  // New!
```

### 3. Updated report.ts

Eliminated hard-coded queries:

**Before (Executive Summary):**
```typescript
const result = await this.con!.run(`
    SELECT 
        COUNT(*) as total_repos,
        SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
        SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) as repos_using_cosign,
        SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) as repos_using_syft,
        SUM(CASE WHEN uses_codeql THEN 1 ELSE 0 END) as repos_using_codeql
        // ... more hard-coded tools
    FROM agg_repo_summary
`);
```

**After:**
```typescript
const result = await this.con!.run('SELECT * FROM agg_executive_summary');
```

**Before (Tool Adoption):**
```typescript
const result = await this.con!.run(`
    WITH tool_counts AS (
        SELECT 'Cosign' as tool, SUM(...) FROM agg_repo_summary
        UNION ALL SELECT 'Syft', SUM(...) FROM agg_repo_summary
        UNION ALL SELECT 'Trivy', SUM(...) FROM agg_repo_summary
        // ... hard-coded for 7 specific tools
    )
    // ... complex query
`);
```

**After:**
```typescript
const result = await this.con!.run('SELECT * FROM agg_tool_summary');
```

### 4. Enhanced Tool Detection in Reports

**Advanced Artifacts Section** now dynamically groups ALL detected tools by category:

```typescript
// Query ALL tools, no hard-coding
const toolResult = await this.con!.run(`
    SELECT tool_category, tool_name, 
           COUNT(DISTINCT repository_id) as repo_count,
           COUNT(DISTINCT workflow_id) as workflow_count
    FROM agg_workflow_tools
    GROUP BY tool_category, tool_name
    ORDER BY repo_count DESC, tool_name
`);

// Group by category and display
const toolsByCategory = new Map<string, Array<...>>();
// ... dynamic grouping and display
```

This automatically shows ALL 13+ tools across 7 categories without any hard-coding.

## Benefits

1. **Maintainability:** Business logic in one place (SQL), not scattered across TypeScript
2. **Extensibility:** Add new tool detection = automatically appears in reports
3. **Testability:** Can test SQL views independently
4. **Performance:** Views can be indexed/optimized
5. **Future-proof:** No TypeScript changes needed when adding new tools or metrics

## Example Output

### Tool Adoption Analysis (Now Complete)

| Tool | Category | Repositories | Workflows | Adoption Rate |
|------|----------|-------------:|----------:|--------------:|
| codeql | code-scanner | 22 | 47 | 68.8% |
| cosign | signer | 9 | 18 | 28.1% |
| dependabot | dependency-scanner | 7 | 12 | 21.9% |
| fossa | dependency-scanner | 6 | 8 | 18.8% |
| trivy | sbom-generator | 4 | 6 | 12.5% |
| trivy | container-scanner | 4 | 6 | 12.5% |
| renovate | dependency-scanner | 3 | 34 | 9.4% |
| slsa-github-generator | signer | 3 | 4 | 9.4% |
| snyk | vulnerability-scanner | 3 | 4 | 9.4% |
| anchore | vulnerability-scanner | 2 | 2 | 6.3% |
| goreleaser | goreleaser | 2 | 2 | 6.3% |
| semgrep | code-scanner | 2 | 2 | 6.3% |
| spdx-sbom-generator | sbom-generator | 1 | 1 | 3.1% |
| syft | sbom-generator | 1 | 1 | 3.1% |

**All 14 tools** now appear automatically, organized by category!

### Advanced Supply Chain Artifacts (Grouped by Category)

*Code Scanner:*
- codeql: 22 repositories, 47 workflows
- semgrep: 2 repositories, 2 workflows

*Signer:*
- cosign: 9 repositories, 18 workflows
- slsa-github-generator: 3 repositories, 4 workflows

*Dependency Scanner:*
- dependabot: 7 repositories, 12 workflows
- fossa: 6 repositories, 8 workflows
- renovate: 3 repositories, 34 workflows

... and so on for all categories

## Code Quality

- ✅ ESLint: Zero warnings, zero errors
- ✅ All type-safe
- ✅ Backward compatible with existing databases
- ✅ No breaking changes to report formats

## Files Modified

- `sql/models/04_summary_views.sql` (new)
- `src/SecurityAnalyzer.ts` (added new model to pipeline)
- `src/report.ts` (simplified queries, removed hard-coding)
- `package.json` (added cli-table3 dependency for future enhancements)

## Next Steps

Future improvements could include:
- Console table output using cli-table3 for better formatting
- Interactive HTML reports with sortable tables
- CSV export of all summary views
- Time-series analysis if historical data is collected
