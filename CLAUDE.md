# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitHub Supply Chain Security Data Collector — a TypeScript toolkit that fetches data from GitHub's GraphQL API, normalizes it into relational tables (DuckDB + Parquet), and runs SQL-based supply chain security analysis. Currently configured for CNCF project metadata enrichment.

## Commands

```bash
# Install dependencies (also runs codegen via postinstall)
npm install

# Environment setup
cp .env.template .env   # then set GITHUB_PAT

# Quick test runs (require GITHUB_PAT)
npm test                 # 3 projects (kubernetes, harbor, atlantis)
npm run test:single      # 1 project (kubernetes)
npm run test:simple      # simple format (2 repos, no metadata)

# Full CNCF landscape (~230 projects)
npm run fetch:landscape  # download/update CNCF landscape metadata
npm start                # run full collection + analysis

# Custom collection
npm run collect -- --input your-repos.json --queries GetRepoDataExtendedInfo --parallel --analyze

# Analysis on existing database
npm run analyze -- --database output/TIMESTAMP/GetRepoDataExtendedInfo/database.db
npm run analyze -- --database path/to/database.db --recreate  # drop+rebuild agg_* tables

# Code quality
npm run lint             # ESLint check
npm run lint:fix         # auto-fix
npm run typecheck        # TypeScript type checking
npm run codegen          # regenerate types from GraphQL schema

# Jupyter notebooks (requires uv + Python deps)
npm run lab
```

## Architecture

**Two-stage pipeline:**

1. **Collection & Normalization** (`src/neo.ts` → `src/api.ts` → `src/normalizers/` → `src/ArtifactWriter.ts`): Fetches from GitHub GraphQL API, transforms nested responses into flat relational `base_*` tables using typed normalizers, writes to DuckDB + Parquet via Apache Arrow IPC.

2. **Analysis** (`src/analyze.ts` → `src/SecurityAnalyzer.ts` → `sql/models/`): Runs sequentially-numbered SQL models against `base_*` tables to produce `agg_*` aggregation tables. Gracefully handles missing tables (e.g., `base_workflows` when repos have no Actions).

**Type-driven data flow:**
`.graphql` files → `npm run codegen` → generated TypeScript types (`src/generated/`, git-ignored) → typed normalizers → DuckDB tables

**Table naming convention:**
- `base_*` — normalized entities from GraphQL (repositories, releases, release_assets, workflows, branch_protection_rules, cncf_projects, cncf_project_repos)
- `agg_*` — analysis/aggregation tables built by SQL models (artifact_patterns, workflow_tools, repo_summary, cncf_project_summary)

**Input formats:** Simple (`[{owner, name}]`) and Rich (with CNCF project metadata including maturity, category, security audits). Both are JSON arrays, not JSONL.

## Key Source Files

| File | Role |
|------|------|
| `src/neo.ts` | Main CLI entry point, orchestrates collection |
| `src/api.ts` | GraphQL client, fetch functions |
| `src/ArtifactWriter.ts` | DuckDB/Parquet writing, normalizer dispatch |
| `src/SecurityAnalyzer.ts` | SQL model execution engine |
| `src/analyze.ts` | Analysis CLI entry point |
| `src/config.ts` | Type definitions (RepositoryTarget, ProjectMetadata) |
| `src/NormalizerTools.ts` | YAML/Markdown/Dockerfile parsing utilities |
| `src/normalizers/` | Query-specific normalizers (hand-written, not generated) |
| `sql/models/` | SQL analysis models, run in numeric order (00-05) |
| `codegen.ts` | GraphQL Code Generator configuration |
| `schema/github-v15.26.0.graphql` | GitHub API schema |

## Adding New Queries

1. Create `.graphql` file in `src/graphql/` (naming: `GetRepoData[Feature].graphql`)
2. Run `npm run codegen` to generate TypeScript types
3. Add fetch function in `src/api.ts`
4. Create normalizer in `src/normalizers/` (not auto-generated — each query needs a hand-written normalizer)
5. Register in `neo.ts` query map and `ArtifactWriter.ts` dispatch

Query names are **case-sensitive** and must match across: GraphQL filename, generated types, neo.ts registry, and CLI `--queries` argument.

## Adding New Analysis

Create a numbered SQL file in `sql/models/` following existing conventions:
```sql
CREATE OR REPLACE TABLE agg_my_analysis AS
SELECT ... FROM base_repositories r JOIN ...;
```
Then register it in `SecurityAnalyzer.ts`.

## Code Quality Rules

- ESLint 9+ flat config with TypeScript strict mode
- `no-unused-vars`: error, `no-explicit-any`: warn
- Generated files (`src/generated/`) are excluded from linting
- Target: zero warnings, zero errors on `npm run lint`

## DuckDB Query Patterns

- **Full-Text Search (FTS)**: Use for keyword/tool detection in unstructured text (workflow YAML, descriptions). Index-backed, fast. See `AGENTS.md` for decision matrix.
- **JSON extraction**: Use for structured data parsing (workflow step configs, security features).
- **Avoid** `LIKE '%pattern%'` on large text fields — use FTS instead.
- Data loading uses Apache Arrow IPC format (`tableFromJSON` → `insertArrowFromIPCStream`), not temp JSON files.

## Output Structure

Each run creates: `output/<name>-<timestamp>/raw-responses.jsonl` + `<QueryName>/database.db` + `<QueryName>/parquet/*.parquet`

## Agent Directives (from AGENTS.md)

- Do not halt for status updates unless actually stuck or need user action.
- Use context7 MCP tool when generating code with libraries or needing up-to-date docs.
