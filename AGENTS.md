## Primary Agent: Implementation Architect Agent

**Role:** The Implementation Architect Agent is responsible for maintaining and evolving the **GraphQL Data Engineering Toolkit**. This agent acts as a lead developer and architect, ensuring the codebase remains clean, well-documented, and aligned with the current two-stage architecture. The toolkit fetches data from GraphQL APIs and transforms it into relational, analytics-ready artifacts (Parquet files and a DuckDB database).

**Directives:**

- Do not halt or pause to provide status updates or confirmations unless you are actually stuck or require the user to take an action you cannot perform. Only interrupt the workflow for "I am stuck" or "You must do something I can't do for me to proceed" situations.
- Always use context7 when generating code, using libraries, or needing up-to-date project documentation. This ensures the most accurate and current implementation.
- For complex, multi-step, or ambiguous tasks, always use the sequentialthinking tool to break down, track, and reason through the problem. This prevents losing track of progress or getting confused during extended or intricate workflows.

**Current Architecture:**

The project implements a sophisticated two-stage data pipeline:

1. **Collection & Normalization (`neo.ts`)**: A type-driven ETL process that fetches data from GraphQL and produces clean, relational `base_*` tables in DuckDB and Parquet. Uses query-specific TypeScript normalizers to transform nested GraphQL responses into flat, relational arrays.

2. **Domain-Specific Analysis (`analyze.ts`)**: A separate SQL-based analysis layer that builds on the `base_*` tables to create domain-specific insights, resulting in `agg_*` tables.

**Core Responsibilities:**

- **Documentation Alignment:** Ensure all documentation accurately reflects the current two-stage architecture. Remove or archive outdated documentation that describes previous architectural iterations.
- **Code Quality:** Maintain ESLint-clean code with zero warnings and zero errors (excluding generated files).
- **Type-Driven Engineering:** Maintain and extend the TypeScript-based normalizer pattern that transforms typed GraphQL response objects into relational arrays.
- **Separation of Concerns:** Keep the generic data engineering layer (collection/normalization) cleanly separated from domain-specific analysis logic.
- **Artifact Generation:** Ensure the pipeline generates high-quality Parquet files and DuckDB databases with appropriate metadata.

**Key Performance Indicators (KPIs):**

- Documentation accurately describes the current implementation without referencing deprecated patterns.
- All code (excluding generated files) is ESLint clean with zero warnings and zero errors.
- The two-stage pipeline (Collection/Normalization → Domain Analysis) is clearly separated and documented.
- Output artifacts (`.parquet`, `.db`) are generated correctly with rich metadata.
- New contributors can understand the architecture from the documentation alone.

**Maintenance Priorities:**

- **Immediate:** Remove artifacts of the old analysis pipeline (pre-SQL, pre-normalizer architecture).
- **Ongoing:** Keep documentation synchronized with code changes.
- **Future:** Schema-driven documentation generation (when data model stabilizes).

---

## DuckDB Query Optimization: When to Use JSON vs Full-Text Search

The toolkit leverages two powerful DuckDB extensions for analyzing workflow data. Understanding when to use each is critical for performance and correctness.

### **Full-Text Search (FTS) - Use for Unstructured Text**

**When to use:**

- Searching for **keywords or tool names** in YAML/text content
- **Fuzzy matching** where exact structure doesn't matter
- Finding mentions across **any part of the workflow**
- Relevance-ranked results (BM25 scoring)

**Examples:**

```sql
-- Find workflows mentioning security tools (anywhere in YAML)
WHERE fts_main_base_workflows.match_bm25(id, 'cosign OR sigstore OR slsa') IS NOT NULL

-- Search for specific CI patterns
WHERE fts_main_base_workflows.match_bm25(id, 'docker build push', fields := 'content') IS NOT NULL

-- Find workflows with SBOM in filename
WHERE fts_main_base_workflows.match_bm25(id, 'sbom OR spdx', fields := 'filename') IS NOT NULL
```

**Strengths:**

- ⚡ **Fast** - Index-backed, no full table scans
- 🎯 **Smart** - Handles stemming, case-folding, stopwords automatically
- 📊 **Ranked** - BM25 relevance scoring for result ordering
- 🔍 **Flexible** - Boolean operators (OR, AND), field-specific search

**Limitations:**

- ❌ Cannot extract **structured data** (e.g., which step uses tool X)
- ❌ Cannot parse **relationships** (e.g., tool versions, dependencies)
- ❌ Limited to **presence detection**, not context analysis

---

### **JSON Extension - Use for Structured Data**

**When to use:**

- Extracting **specific fields** from structured data (GitHub Actions YAML → JSON)
- Querying **relationships** (e.g., which jobs use tool X in which steps)
- Parsing **configuration values** (versions, parameters, secrets)
- Building **dependency graphs** or analyzing CI/CD pipelines

**Examples:**

```sql
-- Extract specific GitHub Action versions
SELECT json_extract(content, '$.jobs.*.steps[*].uses') as actions_used
FROM base_workflows

-- Find workflows using specific action versions
SELECT * FROM base_workflows
WHERE json_extract_string(content, '$.jobs.build.steps[0].uses') LIKE 'actions/checkout@v4'

-- Parse matrix build configurations
SELECT json_extract(content, '$.jobs.*.strategy.matrix') as build_matrix
FROM base_workflows
```

**Strengths:**

- 🏗️ **Structured** - Extract nested fields, arrays, objects
- 🔗 **Relational** - Join on extracted values, build relationships
- 📐 **Precise** - Path-based queries for exact data location
- 🎨 **Transformative** - Reshape data, aggregate nested structures

**Limitations:**

- ❌ Requires **valid JSON/structured format** (GitHub Actions workflows are YAML, need conversion)
- ❌ **Path-dependent** - Must know exact structure
- ❌ No **fuzzy matching** or text search capabilities
- ❌ Slower for **full-text scanning** (no indexes on JSON content)

---

### **Decision Matrix**

| Use Case | Tool | Why |
|----------|------|-----|
| "Find workflows using Cosign" | **FTS** | Keyword search, don't care where it appears |
| "Extract Cosign version from step 3" | **JSON** | Need structured field from specific location |
| "Which repos mention SBOM in workflow names?" | **FTS** | Text search on filename field |
| "Parse matrix build configurations" | **JSON** | Extract structured nested data |
| "Find workflows with security scanning" | **FTS** | Broad keyword search (codeql, snyk, trivy, etc.) |
| "Get all GitHub Action versions used" | **JSON** | Extract structured `uses:` fields |
| "Search release notes for CVE mentions" | **FTS** | Unstructured text search |
| "Parse security_features JSON column" | **JSON** | Structured data already in JSON format |

---

### **Hybrid Approach (Best of Both Worlds)**

Combine FTS and JSON for powerful queries:

```sql
-- Find workflows using Cosign (FTS), then extract version info (JSON)
WITH cosign_workflows AS (
  SELECT id, content
  FROM base_workflows
  WHERE fts_main_base_workflows.match_bm25(id, 'cosign') IS NOT NULL
)
SELECT 
  nameWithOwner,
  json_extract_string(content, '$.jobs.*.steps[*].uses') as actions
FROM cosign_workflows
JOIN base_repositories ON repository_id = id
WHERE json_extract_string(content, '$.jobs.*.steps[*].uses') LIKE '%cosign%';
```

---

### **Current Implementation**

**FTS Indexes (Enabled):**

- `base_workflows.content` - Tool detection in workflow YAML
- `base_workflows.filename` - Workflow name search
- `base_repositories.description` - Project description search
- `base_repositories.nameWithOwner` - Repo/owner search
- `base_release_assets.name` - Artifact filename search
- `base_releases.name` - Release name search

**JSON Queries (Future):**

- Parse GitHub Actions workflow structure (when converted from YAML)
- Extract security feature flags from `security_features` columns
- Analyze tool configurations and parameters

**Performance Guidelines:**

1. **Always use FTS** for initial filtering (keyword presence)
2. **Use JSON** for detailed extraction after filtering
3. **Avoid** `LIKE '%pattern%'` on large text fields (use FTS instead)
4. **Index** FTS-searchable columns during schema creation
5. **Benchmark** - FTS is 10-100x faster than regex for text search

---
