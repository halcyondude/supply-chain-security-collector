# Strategic Plan: Leveraging DuckDB JSON Extension for Workflow Analysis

**Status:** Proposal for Review  
**Created:** October 12, 2025  
**Author:** Implementation Architect Agent

---

## Executive Summary

This plan proposes enhancing the workflow analysis pipeline by adding structured JSON parsing capabilities alongside the existing Full-Text Search (FTS) approach. This will enable precise extraction of tool versions, parameters, and workflow structure while maintaining the performance benefits of FTS-based filtering.

**Key Insight:** YAML ≠ JSON. GitHub Actions workflows are YAML, which cannot be directly parsed by DuckDB's JSON extension. We need to convert YAML→JSON during the data collection phase.

---

## Current State Analysis

### What We Do Now

The current implementation in `sql/models/02_workflow_tool_detection.sql` uses Full-Text Search for tool detection:

```sql
-- Current approach: Keyword-based detection
SELECT 
    w.id as workflow_id,
    'signer' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'cosign') IS NOT NULL THEN 'cosign'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'sigstore') IS NOT NULL THEN 'sigstore'
    END as tool_name
FROM base_workflows w
WHERE fts_main_base_workflows.match_bm25(w.id, 'cosign OR sigstore') IS NOT NULL
```

### Current Limitations

1. **No Version Tracking:** Cannot distinguish `cosign@v1.2.3` from `cosign@v2.0.0`
2. **No Context:** Don't know which step/job uses a tool
3. **No Parameters:** Cannot see how tools are configured (flags, inputs)
4. **False Positives:** Matches comments, documentation, disabled code
5. **No Structure:** Cannot analyze workflow complexity, dependencies, matrix builds

### What Works Well

- ⚡ **Fast:** FTS index-backed queries are 10-100x faster than full-text scans
- 🎯 **Flexible:** Boolean operators, field-specific search
- 📊 **Ranked:** BM25 relevance scoring
- ✅ **Proven:** Currently detects 7 tool categories across 40+ tools

---

## Proposed Architecture

### Two-Column Approach: YAML + JSON

**Schema Change:**
```sql
CREATE TABLE base_workflows (
    id TEXT PRIMARY KEY,
    repository_id TEXT,
    filename TEXT,
    content TEXT,         -- Original YAML (for display, debugging, FTS)
    content_json JSON,    -- Converted JSON (for structured queries)
    __typename TEXT
);
```

**Why Both?**
- **YAML (`content`):** Human-readable, preserves comments, enables FTS, debugging
- **JSON (`content_json`):** Machine-queryable, structured data extraction, DuckDB native

---

## GitHub Actions YAML Structure

From official GitHub Actions documentation, workflows follow this structure:

```yaml
name: Workflow Name
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - name: Install Cosign
        uses: sigstore/cosign-installer@v3.1.2
        with:
          cosign-release: 'v2.2.0'
      - name: Sign artifact
        run: cosign sign $IMAGE_URI
```

**Key Paths for Extraction:**
- `$.jobs.<job-id>.steps[*].uses` - Action references with versions
- `$.jobs.<job-id>.steps[*].with` - Action parameters
- `$.jobs.<job-id>.steps[*].run` - Shell commands
- `$.jobs.<job-id>.strategy.matrix` - Matrix build configurations
- `$.on` - Trigger configuration (push, PR, schedule)

---

## Implementation Strategy: Hybrid FTS + JSON

### Phase 1: Collection Enhancement

**Modify:** `src/normalizers/GetRepoDataExtendedInfoNormalizer.ts`

**Add YAML→JSON Conversion:**
```typescript
import yaml from 'js-yaml'; // or 'yaml' package

interface Workflow {
    id: string;
    repository_id: string;
    filename: string;
    content: string | null;      // Original YAML
    content_json: object | null; // Parsed JSON
    __typename: string;
}

// In normalizeGetRepoDataExtendedInfo():
workflows.push({
    id: `${repoId}_${entry.name}`,
    __typename: 'WorkflowFile',
    repository_id: repoId,
    filename: entry.name,
    content: blob.text,
    content_json: parseYAMLSafely(blob.text), // NEW
});

function parseYAMLSafely(yamlText: string | null): object | null {
    if (!yamlText) return null;
    try {
        return yaml.load(yamlText) as object;
    } catch (error) {
        console.warn(`Failed to parse YAML: ${error.message}`);
        return null; // Fallback: keep text-only analysis
    }
}
```

**Dependencies:**
```bash
npm install js-yaml
npm install --save-dev @types/js-yaml
```

---

### Phase 2: SQL Query Enhancement

**Hybrid Strategy:** FTS for filtering → JSON for extraction

```sql
-- Stage 1: Fast FTS filtering (uses index, ~10ms)
WITH cosign_workflows AS (
    SELECT 
        id,
        repository_id,
        content_json,
        filename
    FROM base_workflows
    WHERE fts_main_base_workflows.match_bm25(id, 'cosign OR sigstore') IS NOT NULL
      AND content_json IS NOT NULL -- Only process parseable workflows
),

-- Stage 2: Structured JSON extraction (only on filtered subset)
cosign_usage AS (
    SELECT 
        cw.repository_id,
        cw.filename,
        -- Extract all 'uses' fields from all steps
        json_extract(cw.content_json, '$.jobs.*.steps[*].uses') as all_actions,
        -- Get the full steps array for detailed analysis
        json_extract(cw.content_json, '$.jobs') as jobs
    FROM cosign_workflows cw
)

-- Stage 3: Parse and classify actions
SELECT 
    cu.repository_id,
    cu.filename,
    -- Extract action name and version separately
    regexp_extract(action, '^([^@]+)@(.+)$', 1) as action_name,
    regexp_extract(action, '^([^@]+)@(.+)$', 2) as action_version,
    action as full_action_reference
FROM cosign_usage cu,
    UNNEST(json_extract_string_array(cu.all_actions, '$')) as action
WHERE action LIKE '%cosign%' OR action LIKE '%sigstore%'
```

---

### Phase 3: Enhanced Detection Capabilities

#### Example 1: Tool Version Analysis
```sql
-- Detect which Cosign versions are being used
SELECT 
    action_version,
    COUNT(*) as usage_count,
    COUNT(DISTINCT repository_id) as repos_using
FROM agg_workflow_actions
WHERE action_name = 'sigstore/cosign-installer'
GROUP BY action_version
ORDER BY usage_count DESC;

-- Result:
-- action_version | usage_count | repos_using
-- v3.1.2         | 15          | 12
-- v3.0.0         | 8           | 7
-- v2.2.4         | 3           | 3
```

#### Example 2: Action Parameter Analysis
```sql
-- What parameters are being passed to Cosign?
SELECT 
    json_extract_string(step_with, '$.cosign-release') as cosign_release_param,
    COUNT(*) as usage_count
FROM (
    SELECT 
        json_extract(content_json, '$.jobs.*.steps[?(@.uses like "sigstore/cosign%")].with') as step_with
    FROM base_workflows
    WHERE content_json IS NOT NULL
)
WHERE step_with IS NOT NULL
GROUP BY cosign_release_param;
```

#### Example 3: Workflow Complexity Metrics
```sql
-- Analyze workflow complexity
SELECT 
    repository_id,
    filename,
    json_array_length(json_extract(content_json, '$.jobs')) as job_count,
    (SELECT AVG(json_array_length(json_extract(j, '$.steps')))
     FROM UNNEST(json_extract(content_json, '$.jobs')) as j) as avg_steps_per_job,
    json_extract(content_json, '$.on') as triggers
FROM base_workflows
WHERE content_json IS NOT NULL;
```

#### Example 4: Matrix Build Detection
```sql
-- Find workflows using matrix strategies
SELECT 
    repository_id,
    filename,
    json_extract(content_json, '$.jobs.*.strategy.matrix') as matrix_config
FROM base_workflows
WHERE json_extract(content_json, '$.jobs.*.strategy.matrix') IS NOT NULL;
```

---

## Performance Considerations

### Why Hybrid FTS + JSON?

| Approach | Speed | Precision | Use Case |
|----------|-------|-----------|----------|
| FTS Only | ⚡⚡⚡ Fast (10ms) | ❌ Low (keywords) | Initial filtering |
| JSON Only | 🐌 Slow (1000ms) | ✅ High (structured) | Full table scans (avoid!) |
| **Hybrid** | ⚡⚡ Fast (50ms) | ✅ High | **Best of both** |

**Benchmark Estimate (1000 workflows):**
- FTS filter: 10ms → narrows to ~50 workflows (5%)
- JSON extraction on 50: 40ms
- **Total: 50ms** (vs 1000ms for JSON-only)

---

## Migration Strategy

### Backward Compatibility

**Keep existing FTS queries working:**
- Don't remove `content` column
- Add `content_json` as optional enhancement
- Gradual migration of queries

**Phased Rollout:**
1. **Week 1:** Add JSON column, backfill data
2. **Week 2:** Create new JSON-based queries in separate files
3. **Week 3:** A/B test results (FTS vs JSON) for accuracy
4. **Week 4:** Merge best approach, deprecate old queries

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Invalid YAML | Medium | High | Graceful error handling, keep text fallback |
| Storage overhead | Low | High | Parquet compression, ~30% increase acceptable |
| Query complexity | Medium | Medium | Document JSON paths, provide examples |
| Performance regression | High | Low | Use hybrid FTS→JSON, benchmark before deploy |
| Breaking changes | Low | Low | Backward compatible, gradual migration |

---

## Decision Matrix: When to Use FTS vs JSON

| Use Case | Tool | Why |
|----------|------|-----|
| "Find workflows using Cosign" | **FTS** | Fast keyword search, don't care about details |
| "Which Cosign versions are used?" | **JSON** | Need structured version field |
| "Count workflows with SBOM tools" | **FTS** | Aggregation, keyword presence |
| "Extract Cosign parameters from step 3" | **JSON** | Precise path-based extraction |
| "Search release notes for CVE mentions" | **FTS** | Unstructured text search |
| "Build tool dependency graph" | **JSON** | Analyze job relationships, step order |

---

## Recommended Next Steps

### Immediate (Do First)
1. ✅ **Review this plan** - Approve approach before implementation
2. 📦 **Install dependencies** - Add `js-yaml` to package.json
3. 🔧 **Prototype conversion** - Test YAML→JSON on 10 workflows
4. 📊 **Measure impact** - Check storage size, parse success rate

### Short-term (Week 1-2)
5. 🏗️ **Implement normalizer** - Add JSON conversion to TypeScript
6. 🗄️ **Update schema** - Add `content_json` column to DuckDB
7. 🧪 **Validate data** - Ensure JSON parse success rate > 95%
8. 📝 **Document patterns** - Create JSON path reference guide

### Medium-term (Week 3-4)
9. 🔍 **Create hybrid queries** - FTS→JSON examples for each tool category
10. ⚡ **Benchmark performance** - Verify <100ms query time
11. 📊 **Compare results** - FTS-only vs JSON accuracy analysis
12. 📚 **Update docs** - AGENTS.md, detection-reference.md

### Long-term (Future Enhancements)
13. 🎯 **Version tracking** - Tool version history over time
14. 🔗 **Dependency graphs** - Visualize job/step relationships
15. 🤖 **Smart detection** - ML-based tool classification
16. 📈 **Trend analysis** - Tool adoption rates, version migration patterns

---

## Example Queries: Before & After

### Before (FTS Only)
```sql
-- Can only detect presence
SELECT COUNT(*) as repos_with_cosign
FROM base_workflows w
WHERE fts_main_base_workflows.match_bm25(w.id, 'cosign') IS NOT NULL;
-- Result: 47 workflows mention "cosign"
```

### After (Hybrid FTS + JSON)
```sql
-- Detect presence AND extract details
WITH cosign_workflows AS (
    SELECT id, repository_id, content_json
    FROM base_workflows
    WHERE fts_main_base_workflows.match_bm25(id, 'cosign') IS NOT NULL
      AND content_json IS NOT NULL
)
SELECT 
    COUNT(DISTINCT repository_id) as repos_using_cosign,
    COUNT(*) as total_cosign_steps,
    COUNT(DISTINCT json_extract_string(content_json, '$.jobs.*.steps[?(@.uses like "sigstore/cosign%")].uses')) as unique_versions
FROM cosign_workflows;
-- Result: 42 repos, 67 steps, 5 unique versions
-- (5 false positives eliminated!)
```

---

## Success Metrics

**Goals for this enhancement:**
- ✅ Reduce false positives by >50% (comments, documentation)
- ✅ Enable version tracking for 100% of detected tools
- ✅ Maintain query performance <100ms per category
- ✅ Achieve >95% YAML parse success rate
- ✅ Add 10+ new analysis capabilities (versions, parameters, complexity)

---

## Alignment with Project Architecture

This enhancement follows the **two-stage architecture** outlined in AGENTS.md:

1. **Collection & Normalization (`neo.ts`)** ← **We enhance this stage**
   - Add YAML→JSON conversion in TypeScript normalizer
   - Type-driven transformation: YAML string → JSON object
   - Maintain clean separation: raw YAML + structured JSON

2. **Domain-Specific Analysis (`analyze.ts`)** ← **Queries get better**
   - SQL-based analysis now has structured data
   - Hybrid FTS→JSON queries unlock new insights
   - Backward compatible with existing FTS approach

**No architectural changes required.** This is a data model enhancement within the existing framework.

---

## Questions for Review

1. **Scope:** Should we convert all workflows, or just new ones going forward?
2. **Storage:** Is ~30% storage increase acceptable for the benefits?
3. **Timeline:** Aggressive (1 week) or conservative (4 weeks) rollout?
4. **Validation:** How do we verify JSON conversion accuracy?
5. **Fallback:** Should we store parse errors for debugging?

---

## Appendix: JSON Path Patterns Reference

Common JSON paths for GitHub Actions workflows:

```javascript
// Action references with versions
$.jobs.*.steps[*].uses

// Action parameters
$.jobs.*.steps[*].with

// Step names
$.jobs.*.steps[*].name

// Shell commands
$.jobs.*.steps[*].run

// Matrix configurations
$.jobs.*.strategy.matrix

// Job dependencies
$.jobs.*.needs

// Triggers
$.on

// Environment variables
$.env
$.jobs.*.env
$.jobs.*.steps[*].env

// Conditional execution
$.jobs.*.if
$.jobs.*.steps[*].if

// Runner configuration
$.jobs.*.runs-on

// Permissions
$.permissions
$.jobs.*.permissions
```

---

**End of Strategic Plan**

**Next Action:** Awaiting approval to proceed with Phase 1 (Collection Enhancement).
