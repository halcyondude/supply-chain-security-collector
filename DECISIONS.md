# Architecture Decisions

## Table of Contents

- [2025-10-06: Initial Feedback](#2025-10-06-initial-feedback)
  - [Original State](#original-state)
  - [Changes Made](#changes-made)
- [GraphQL Architecture](#graphql-architecture)
- [Data Strategy](#data-strategy)
- [Type Safety and Code Generation](#type-safety-and-code-generation)
- [Development Standards](#development-standards)

## 2025-10-06: Initial Feedback

### Original State

The tool started as a single GraphQL query (`GetRepoData`) that fetched:

- Last 1 release with up to 50 artifacts
- All workflow files from `.github/workflows` (full YAML content)
- Basic repo metadata

Output was JSON and CSV only. The query mixed artifact detection with workflow analysis in one call.

### Changes Made

Based on feedback and active iteration, I'm making the following changes to the tool:

- The tool continues to collect data for a set of repos (coming soon, full org scan) as input, and provides Sandbox, Incubating, and Graduated input config files.
- For each repo, run queries (2 presently)
  - search for the existence of SBOM's and other security artifacts in the release assets.
  - search CI workflows for existence of tools / actions that generate security artifacts
- artifacts generated are:
  - the raw response data (JSON)
  - A report on findings (including .csv, and .jsonl)
  - parquet schema file containing the descriptions and type info from the GraphQL Schema for all returned types. Used to generate documentation, and to validate future data scrapes.
  - codegen created typed Typescript SDK.
  - (experimenting) a JSON "instrospection style" schema for returned types.
- removing wasm and parquet (data) output, I was experimenting, that was a good call-out

Also, as we discussed, working on a notebook to walk thru results.

I've also taken an action item to follow up with CNCF Infra to ensure we can run CI jobs for the tool itself, as well as a daily or weekly scrape.

Targeting community demo for TAG-SC on 10/22.

## GraphQL Architecture

### Query Splitting

**Decision**: Split into multiple specialized GraphQL queries instead of one mega-query.

**Rationale**:

- API rate limits matter. Don't fetch workflow YAML if you only need release artifacts.
- Each query returns a distinct type. No union types, no runtime type guards.
- Easy to extend - just add another query file and API function.

**Implementation**:

- `GetRepoDataArtifacts`: Release artifacts only (default)
- `GetRepoDataExtendedInfo`: Adds workflows, security policies, etc.

See `docs/QUERY-ARCHITECTURE.md` for details.

### No Union Types

**Decision**: Each API function returns its own specific query type.

**Rationale**: Union types require runtime checking and make code harder to reason about. TypeScript should handle everything at compile time.

**Example**:

```typescript
// Good
function fetchRepositoryArtifacts(): GetRepoDataArtifactsQuery | null
function fetchRepositoryExtendedInfo(): GetRepoDataExtendedInfoQuery | null

// Bad
type RepoData = ArtifactsQuery | ExtendedQuery  // Requires runtime type guards
```

### Presence Detection Only

**Decision**: Tool reports what security artifacts exist, not what's in them.

**Rationale**: Scope creep is real. Parsing SBOMs, validating signatures, etc. are separate concerns. This tool answers "does this repo ship SBOMs?" not "is the SBOM valid?".

**Detection targets**:

- Release artifacts: SBOMs, signatures, attestations
- CI workflows: Tool invocations (syft, cosign, etc.)

### Release Fetching

**Decision**: Fetch last 5 releases, up to 50 artifacts per release.

**Rationale**:

- Covers recent history without overloading the API.
- 50 artifacts handles most repos. Exceptions can be addressed later.
- Ordered by creation date (newest first).

### Workflow Analysis

**Decision**: Not implemented yet, but query is ready.

**Rationale**:

- Fetching workflow YAML is expensive (rate limits).
- Most use cases only need artifact presence.
- Query exists in `GetRepoDataExtendedInfo` for when we need it.

**Future**: Add `--extended` flag to main.ts to enable workflow analysis.

## Data Strategy

### Output Formats

**Decision**: Generate JSON, CSV, and Parquet schema. No binary Parquet files.

**Rationale**:

- JSON is the source of truth and easiest to work with.
- CSV for spreadsheet analysis without code.
- Parquet schema for documentation and future conversion via external tools.
- Writing Parquet in TypeScript was experimental. Removed it. Good call.

**Why not write Parquet directly**:
ES module/CommonJS hell with parquet-wasm. Not worth fighting it. Python/DuckDB handle JSON→Parquet conversion fine.

### Normalized CSV Structure

**Decision**: Flatten hierarchical JSON into wide CSV with one row per artifact.

**Rationale**:

- Easier to analyze in spreadsheets and SQL.
- Repository and release info duplicated across artifact rows.
- JSON arrays encoded as strings in CSV.

**Tradeoff**: Some data duplication, but worth it for analysis tools that expect flat tables.

### Schema Documentation

**Decision**: Generate schema docs from actual output files, not just TypeScript types.

**Rationale**:

- What actually gets written matters more than what the types say.
- Validates that output matches expectations.
- Self-documenting based on real data.

**Tools**: `scripts/generate-schema-docs.ts` reads JSON output and generates `docs/schema.md`.

### Mock Data Strategy

**Decision**: Mock files use the old `GetRepoData` naming but contain full extended data.

**Rationale**:

- TypeScript extracts only the fields defined in the query type.
- One set of mocks supports multiple queries.
- Extra fields in mocks are safely ignored.

## Type Safety and Code Generation

### GraphQL Code Generation

**Decision**: Use `@graphql-codegen/cli` with client preset.

**Rationale**:

- Full end-to-end type safety from query to response.
- Schema changes caught at compile time.
- Generated code goes in `src/generated/` and is excluded from linting.

**Process**: Edit `.graphql` files → run `npm run codegen` → get typed SDK.

### TypeScript Configuration

**Decision**: Use Node16 module resolution and ES2022 target.

**Rationale**:

- Modern package.json exports work correctly.
- Matches current Node.js LTS behavior.
- Avoids CommonJS/ESM issues.

## Development Standards

### Linting

**Decision**: ESLint on all hand-written code. Generated code excluded.

**Rationale**:

- Zero tolerance for warnings in code we write.
- Generated code gets `/* eslint-disable */` header.
- `src/generated/` in `.eslintignore`.

**Standard**: All commits must be ESLint clean.

### No Vendor Directory

**Decision**: Removed `vendor/` directory with graphql-to-parquet spec.

**Rationale**: Not using it. Keep the repo focused on what's actually implemented.
