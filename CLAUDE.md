# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A GraphQL data engineering toolkit that analyzes GitHub repository supply chain security practices. It fetches repo metadata via GitHub's GraphQL API, normalizes it into relational tables, stores in DuckDB with Parquet exports, and runs SQL-based security analysis (SBOMs, signatures, CI/CD tools, maturity scoring). Supports both simple repo lists and rich CNCF project metadata.

## Commands

```bash
# Install
npm install                    # also runs codegen via postinstall

# Run
npm test                       # 3 CNCF projects (kubernetes, harbor, atlantis)
npm run test:single            # 1 project (kubernetes)
npm run test:simple            # simple format (2 repos, no project metadata)
npm start                      # full CNCF landscape (~230 projects)
npm run analyze                # run SQL analysis on existing database

# Code quality
npm run lint                   # ESLint check
npm run lint:fix               # auto-fix
npm run typecheck              # TypeScript type checking
npm run codegen                # regenerate TypeScript types from GraphQL schema

# Utilities
npm run fetch:landscape        # download latest CNCF landscape data
npm run clean                  # remove output/, cache, dist
```

**Environment:** Requires `GITHUB_PAT` env var (see `.env.template`). Node 18+, Python 3.12 (for notebooks only).

## Architecture

Two-stage pipeline with clean separation:

**Stage 1 — Collection & Normalization (`src/neo.ts`):**
Input JSON → GitHub GraphQL API → query-specific TypeScript normalizers → DuckDB `base_*` tables + Parquet files + JSONL audit trail.

**Stage 2 — Domain Analysis (`src/analyze.ts`):**
`base_*` tables → ordered SQL models in `sql/models/` → `agg_*` analysis tables (artifact patterns, workflow tools, repo summaries, CNCF project summaries).

### Key source files

- `src/neo.ts` — CLI entry point, input normalization, fetch orchestration
- `src/api.ts` — GitHub GraphQL client with rate limiting
- `src/ArtifactWriter.ts` — DuckDB database + Parquet writer
- `src/SecurityAnalyzer.ts` — SQL model execution engine
- `src/normalizers/` — transform nested GraphQL responses → flat relational arrays (one per query)
- `src/graphql/` — GraphQL query definitions
- `src/generated/` — codegen output (do not edit)
- `sql/models/` — numbered SQL files run in order (00–05)

### Adding a new GraphQL query

1. Create `.graphql` file in `src/graphql/`
2. Run `npm run codegen` to generate TypeScript types
3. Write a normalizer in `src/normalizers/` following the existing pattern
4. Register in `ArtifactWriter.ts`
5. See `docs/adding-new-queries.md` for full guide

### Input formats

- **Simple:** `[{owner, name}]` — just repos
- **Rich:** `[{project_name, repos: [{owner, name, primary}], maturity, ...}]` — CNCF metadata
- Auto-detected by `normalizeInput()` in `neo.ts`

### CLI flags

`--input <file>`, `--maturity <graduated|incubating|sandbox>`, `--repo-scope <primary|all>`, `--queries <queryName>`

## Conventions

- **DuckDB only** — no SQLite or other databases
- **Table naming:** `base_*` for normalized data, `agg_*` for analysis output, `raw_*` for full API responses
- **Graceful degradation:** missing tables (e.g., `base_workflows` when repos lack Actions) are expected; SQL models skip with warnings
- **No arrays in analysis output** — use discrete boolean columns for queryability
- **FTS for text search** on workflows/assets (BM25 via `fts_main_base_*.match_bm25()`); avoid `LIKE '%pattern%'` on large text fields
- **JSON extension** for structured field extraction from workflow content
- **Type-driven:** GraphQL codegen → typed normalizers → compile-time safety
- ESLint-clean code with zero warnings (excluding `src/generated/`)
- Output goes to timestamped directories under `output/`

## AGENTS.md

The `AGENTS.md` file contains additional architectural context including DuckDB query optimization guidance (FTS vs JSON extension decision matrix) and agent directives. Consult it for detailed DuckDB patterns.
