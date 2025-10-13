# System Design: Two-Stage Data Pipeline# System Design



## Overview## Overview



The GitHub Supply Chain Security Analyzer implements a **two-stage data pipeline** that separates generic data engineering from domain-specific analysis:The GitHub Supply Chain Security Analyzer is a data collection and analysis tool that searches GitHub repositories for the **presence** of supply chain security artifacts. It does NOT validate or analyze the content of these artifacts - it simply reports what exists.



1. **Collection & Normalization** (`neo.ts`) - Type-driven ETL that transforms GraphQL responses into clean, relational `base_*` tables**Target Use Case**: Analyzing CNCF landscape projects to understand adoption of supply chain security practices (SBOMs, signatures, attestations, SLSA provenance, etc.).

2. **Domain-Specific Analysis** (`analyze.ts`) - SQL-based analysis layer that builds domain insights into `agg_*` tables

**Core Philosophy**:

This separation of concerns allows the collection layer to remain generic and reusable while the analysis layer addresses specific business requirements.

- Presence detection only - not content validation

## Architecture- Raw data preservation for reproducibility

- Multiple output formats for different consumers

```text- API-efficient with targeted queries

┌─────────────────────────────────────────────────────────────────┐

│                    GitHub GraphQL API                            │## Query Architecture

└────────────────────────────┬────────────────────────────────────┘

                             │The tool uses a **two-query design** to balance API efficiency with flexibility.

                             │ GraphQL Query

                             ▼### GetRepoDataArtifacts (Default)

                 ┌───────────────────────┐

                 │     neo.ts            │  ← Main entry pointLightweight query fetching:

                 │  - Parallel/sequential│

                 │  - Rate limit handling│- Repository metadata (name, owner, id)

                 │  - Raw response log   │- Last 5 releases with up to 50 artifacts each

                 └───────────┬───────────┘- Basic release info (tag, name, created date)

                             │

                             │ Raw JSON Response**Use Case**: Default mode. Fast presence detection of security artifacts in releases.

                             ▼

                 ┌───────────────────────┐### GetRepoDataExtendedInfo (--extended flag)

                 │  ArtifactWriter.ts    │  ← Core ETL logic

                 │  1. Write raw_* table │Comprehensive query adding:

                 │  2. Call normalizer   │

                 │  3. Write base_* tables│- GitHub Actions workflows (YAML content)

                 │  4. Export Parquet    │- Security policies (SECURITY.md)

                 └───────────┬───────────┘- Branch protection settings

                             │- Dependabot configuration

                ┌────────────┼────────────┐- Repository metadata (URL, description, license)

                │            │            │

                ▼            ▼            ▼**Use Case**: Deep analysis of CI/CD security tooling. Detects security tools in workflows (syft, trivy, cosign, goreleaser, etc.).

        ┌─────────────────────────────────────┐

        │    Query-Specific Normalizers       │**Status**: ✅ Implemented. Use `--extended` flag to enable.

        │  - TypeScript transformation logic  │

        │  - Typed input/output               │**Why Two Queries?**

        │  - Nested → Flat arrays             │

        └───────────┬─────────────────────────┘- Rate limits matter - don't fetch workflow YAML if you only need artifacts

                    │- Each query returns a distinct type (no union types, no runtime guards)

                    │ Flat, Relational Arrays- Easy to extend - just add another query file and API function

                    ▼

        ┌─────────────────────────────┐See [QUERY-ARCHITECTURE.md](docs/QUERY-ARCHITECTURE.md) for implementation details.

        │   DuckDB + Parquet Files     │

        │   - raw_GetRepoData...       │## Data Pipeline

        │   - base_repositories        │

        │   - base_releases            │The tool processes data through three distinct stages:

        │   - base_release_assets      │

        │   - base_workflows           │```text

        └─────────────┬───────────────┘┌─────────────────────┐

                      ││  GitHub GraphQL API │

                      │ (Separate Stage)└──────────┬──────────┘

                      ▼           │

        ┌─────────────────────────────┐           │ Raw Response (nested GraphQL structure)

        │      analyze.ts              │  ← Analysis entry point           │

        │   SecurityAnalyzer.ts        │           ▼

        │   - Reads base_* tables      │┌─────────────────────┐

        │   - Executes SQL models      ││   analysis.ts       │  ← Pattern matching & classification

        │   - Creates agg_* tables     ││   analyzeRepo()     │

        └─────────────┬───────────────┘└──────────┬──────────┘

                      │           │

                      ▼           │ Analyzed Domain Model (computed fields)

        ┌─────────────────────────────┐           │

        │   SQL Models (sql/models/)   │           ▼

        │   01_artifact_analysis.sql   │┌─────────────────────┐

        │   02_workflow_tool_detection ││   report.ts         │  ← Format conversion & normalization

        │   03_repository_summary      ││   generateReports() │

        └─────────────┬───────────────┘└──────────┬──────────┘

                      │           │

                      ▼           │ Multiple output formats

        ┌─────────────────────────────┐           │

        │   Domain-Specific Tables     │           ▼

        │   - agg_artifact_analysis    │     Output Artifacts

        │   - agg_workflow_tools       │```

        │   - agg_repo_summary         │

        └─────────────────────────────┘### Stage 1: Raw API Response

```

**Structure**: Nested GraphQL response with pagination nodes and type wrappers.

## Stage 1: Collection & Normalization

**Example**:

### Core Components

```json

**Entry Point: `neo.ts`**{

- Reads input file (JSONL with owner/repo)  "data": {

- Determines which GraphQL queries to run    "repository": {

- Orchestrates parallel or sequential execution      "id": "MDEwOlJlcG9zaXRvcnk...",

- Writes `raw-responses.jsonl` audit log      "name": "cosign",

- Calls `ArtifactWriter.writeArtifacts()` for each query      "nameWithOwner": "sigstore/cosign",

      "releases": {

**ETL Engine: `ArtifactWriter.ts`**        "nodes": [

- Creates DuckDB database for the run          {

- Writes raw GraphQL responses to `raw_<QueryName>` table            "tagName": "v0.1.0",

- Calls query-specific normalizer function            "name": "v0.1.0",

- Writes normalized arrays to `base_*` tables (repositories, releases, artifacts, workflows)            "createdAt": "2021-03-20T00:22:31Z",

- Exports all tables to Parquet with metadata            "releaseAssets": {

              "nodes": [

**Type-Driven Normalizers: `src/normalizers/*.ts`**                { "name": "cosign", "downloadUrl": "https://..." },

- One normalizer per GraphQL query                { "name": "cosign.sig", "downloadUrl": "https://..." }

- Accepts typed GraphQL response object              ]

- Returns typed relational arrays (e.g., `RepositoryRow[]`, `ReleaseRow[]`)            }

- Pure transformation logic - no I/O, no side effects          }

        ]

### The Type-Driven Normalization Pattern      }

    }

This is the key innovation. Each GraphQL query has a corresponding normalizer that transforms the nested response into flat, relational arrays:  }

}

```typescript```

// Input: Typed GraphQL response

export function normalizeGetRepoDataExtendedInfo(**Current State**: ✅ Saved to `{dataset}-raw-responses.jsonl` with metadata (timestamp, queryType, owner, repo)

  response: GetRepoDataExtendedInfoQuery

): NormalizedData {### Stage 2: Analyzed Domain Model

  const repo = response.repository;

  **Purpose**: Transform raw GraphQL into business domain objects with computed fields.

  // Output: Clean relational arrays

  return {**Processing** (in `analysis.ts`):

    repositories: [{ id: repo.id, name: repo.name, owner: ... }],

    releases: releases.map(r => ({ id: r.id, repository_id: repo.id, ... })),- Extract owner from `nameWithOwner`

    releaseAssets: assets.map(a => ({ id: ..., release_id: ..., ... })),- Flatten GraphQL pagination nodes

    workflows: workflows.map(w => ({ id: ..., repository_id: repo.id, ... }))- Classify artifacts by name patterns (regex matching):

  };  - `isSbom`, `isSignature`, `isAttestation`

}  - `sbomFormat` (spdx, cyclonedx, unknown)

```  - `isVex`, `isSlsaProvenance`, `isInTotoLink`, `isContainerAttestation`

- Compute summary flags (presence of each artifact type)

### Database Schema- Collect unique security tool types into `sbomCiTools` array



**Raw Tables** (`raw_*`)**Example**:

- One table per GraphQL query type

- Stores the complete JSON response```json

- Columns: `owner`, `repo`, `response` (JSON){

  "repository": {

**Base Tables** (`base_*`)    "id": "MDEwOlJlcG9zaXRvcnk...",

- One table per entity type    "owner": "sigstore",

- Clean, relational schema with proper foreign keys    "name": "cosign",

- Examples:    "url": "https://github.com/sigstore/cosign"

  - `base_repositories`: Core repository metadata  },

  - `base_releases`: Release information  "releases": [

  - `base_release_assets`: Individual release artifacts    {

  - `base_workflows`: GitHub Actions workflows      "tagName": "v0.1.0",

      "name": "v0.1.0",

### Artifacts Generated      "createdAt": "2021-03-20T00:22:31Z",

      "artifacts": [

For each run, a timestamped directory is created:        {

          "name": "cosign",

```          "isSbom": false,

output/test-three-repos-2025-10-12T19-20-16/          "isSignature": false,

├── raw-responses.jsonl           # Audit log (append-only)          "isAttestation": false,

├── GetRepoDataExtendedInfo/      # Query-specific directory          "sbomFormat": "",

│   ├── database.db               # DuckDB with all tables          "downloadUrl": "https://..."

│   └── parquet/        },

│       ├── raw_GetRepoDataExtendedInfo.parquet        {

│       ├── base_repositories.parquet          "name": "cosign.sig",

│       ├── base_releases.parquet          "isSbom": false,

│       ├── base_release_assets.parquet          "isSignature": true,

│       └── base_workflows.parquet          "isAttestation": false,

```          "sbomFormat": "",

          "downloadUrl": "https://..."

### Key Benefits        }

      ]

- **Type Safety**: GraphQL codegen + TypeScript ensures correctness    }

- **Separation of Concerns**: Generic ETL vs. domain logic  ],

- **Debuggability**: Raw responses preserved, intermediate tables visible  "workflows": [],

- **Reusability**: Same pattern for any GraphQL API  "summary": {

- **Performance**: DuckDB's columnar engine for transformations    "hasSbomArtifact": false,

    "hasSignatureArtifact": true,

## Stage 2: Domain-Specific Analysis    "hasAttestationArtifact": false,

    "sbomCiTools": ["signature"]

### Core Components  }

}

**Entry Point: `analyze.ts`**```

- Reads configuration for which database to analyze

- Instantiates `SecurityAnalyzer`**Current State**: ✅ Generated and saved to `{dataset}-analyzed.json`

- Executes SQL models in sequence

- Generates HTML and Markdown reports### Stage 3: Normalized CSV



**Analysis Engine: `SecurityAnalyzer.ts`****Purpose**: Flatten hierarchical JSON into wide tabular format for spreadsheet/SQL analysis.

- Reads SQL model files from `sql/models/`

- Executes them against the DuckDB database**Processing** (in `report.ts`):

- Each model reads from `base_*` tables and creates `agg_*` tables

- Validates that expected tables were created- One row per artifact

- Repository and release info duplicated across artifact rows

**SQL Models: `sql/models/*.sql`**- Nested arrays encoded as JSON strings

- Pure SQL transformation logic- Additional computed fields:

- Read from `base_*` tables  - `artifact_type` classification

- Apply business rules (e.g., regex patterns for SBOM detection)  - `platform_hint` extraction

- Create `agg_*` tables with domain insights  - `size_hint` extraction

  - `release_has_container_images`, `release_has_slsa_provenance`

### Example SQL Model

**Current State**: ✅ Generated and saved to `{dataset}.csv`

```sql

-- sql/models/01_artifact_analysis.sql## Output Artifacts

CREATE TABLE agg_artifact_analysis AS

SELECT ### Output Files

  ra.repository_id,

  ra.release_id,Each run produces **four files** per dataset:

  ra.name AS artifact_name,

  REGEXP_MATCHES(ra.name, '\.(sbom|spdx|cyclonedx)\.(json|xml)$', 'i') AS is_sbom,1. **`{dataset}-raw-responses.jsonl`** - Raw GraphQL API responses with metadata

  REGEXP_MATCHES(ra.name, '\.(sig|asc|signature)$', 'i') AS is_signature,   - One line per API fetch (appends on each run for historical tracking)

  REGEXP_MATCHES(ra.name, 'attestation', 'i') AS is_attestation,   - Each line: `{"metadata": {...}, "response": {...}}`

  ra.download_url   - Metadata includes:

FROM base_release_assets ra     - `timestamp`: When the data was fetched (ISO 8601)

JOIN base_releases r ON ra.release_id = r.id     - `queryType`: Which GraphQL query was used (GetRepoDataArtifacts or GetRepoDataExtendedInfo)

WHERE ra.name IS NOT NULL;     - `owner`: Repository owner

```     - `repo`: Repository name

   - **Append behavior**: New runs add to existing file, preserving history

### Aggregated Tables

2. **`{dataset}-analyzed.json`** - Analyzed domain model (array of repository analysis objects)

**Analysis Tables** (`agg_*`)   - Computed fields and classifications

- Domain-specific insights   - **Overwrite behavior**: Current state only, not historical

- Examples:

  - `agg_artifact_analysis`: Classified artifacts (SBOM, signature, etc.)3. **`{dataset}.csv`** - Normalized flat CSV (one row per artifact)

  - `agg_workflow_tools`: Detected CI/CD tools   - For spreadsheet analysis, SQL imports, etc.

  - `agg_repo_summary`: Repository-level rollups   - **Overwrite behavior**: Current state only



### Reporting4. **`{dataset}-schema.json`** - Parquet-style schema documentation

   - Field types, descriptions, examples, categories

After analysis, two reports are generated:   - Used for documentation generation

   - Enables future JSON → Parquet conversion via external tools

1. **HTML Report** (`report.html`): Rich, interactive visualization   - **Overwrite behavior**: Current state only

2. **Markdown Report** (`report.md`): Text-based summary for documentation

**Example JSONL line**:

## Configuration & Input

```json

### Input Format{"metadata": {"queryType": "GetRepoDataArtifacts", "timestamp": "2025-10-06T17:30:00Z", "owner": "sigstore", "repo": "cosign", "inputs": {"owner": "sigstore", "name": "cosign"}}, "response": {"data": {"repository": { ... }}}}

```

JSONL file with one repository per line:

**Benefits**:

```json

{"owner": "sigstore", "name": "cosign"}- **Historical tracking**: See how repos change over time

{"owner": "fluxcd", "name": "flux2"}- **Reproducibility**: Re-analyze old data without re-fetching

```- **Debugging**: See exactly what GitHub returned

- **Audit trail**: Know when data was collected

### Pre-configured Datasets- **Data validation**: Verify analysis logic against raw responses

- **Mock data source**: Becomes input for mock mode (see below)

- `input/test-single.jsonl` - Single repo for testing

- `input/test-three-repos.jsonl` - Three repos for development### File Naming Convention

- `input/sandbox.jsonl` - CNCF sandbox projects

- `input/incubation.jsonl` - CNCF incubating projects```text

- `input/graduated.jsonl` - CNCF graduated projectsoutput/

  {dataset}-raw-responses.jsonl     # Raw API responses with metadata (APPEND)

### Environment Variables  {dataset}-analyzed.json           # Analyzed domain model (OVERWRITE)

  {dataset}.csv                     # Normalized CSV (OVERWRITE)

- `GITHUB_PAT` - GitHub Personal Access Token (required unless `--mock`)  {dataset}-schema.json             # Schema documentation (OVERWRITE)

```

### CLI Usage

Examples:

**Collection (Stage 1):**

```bash- `sandbox-raw-responses.jsonl`

npm run neo -- --input input/test-three-repos.jsonl- `sandbox-analyzed.json`

```- `sandbox.csv`

- `sandbox-schema.json`

**Analysis (Stage 2):**

```bash## Mock Data Strategy

npm run analyze -- --database output/test-three-repos-2025-10-12T19-20-16/GetRepoDataExtendedInfo/database.db

```### Current Implementation



## Query ArchitectureMock mode (`--mock` flag) reads from `src/mockdata/` directory:



The tool supports multiple GraphQL queries, each with its own normalizer:- Individual files: `GetRepoData_{owner}_{repo}.json`

- Contains full raw API responses

### GetRepoDataArtifacts- 8 hand-picked repos for testing specific scenarios

- Lightweight query

- Repository + Releases + Release Assets**Limitations**:

- Fast presence detection

- Separate from production output

### GetRepoDataExtendedInfo- No connection to actual captured data

- Comprehensive query- Manual maintenance required

- Adds: Workflows, Security policies, Branch protection

- Deeper CI/CD analysis### Future: Two-Tier System (Not Yet Implemented)



To add a new query:#### Tier 1: JSONL Bulk Data (TODO)

1. Create `src/graphql/MyNewQuery.graphql`

2. Run `npm run codegen` to generate types- Mock mode would read from `output/{dataset}-raw-responses.jsonl` first

3. Create `src/normalizers/MyNewQueryNormalizer.ts`- Filter by owner/repo to find matching response

4. Register in `neo.ts`- Use most recent entry for that repo

- **Real captured data becomes mock data automatically**

## Data Flow Example

#### Tier 2: Individual Files (Current)

### Input

```json- Currently: Only reads from `src/mockdata/GetRepoData_{owner}_{repo}.json`

{"owner": "sigstore", "name": "cosign"}- Useful for curated test cases committed to git

```- Specific test scenarios (e.g., "repo with SLSA provenance")



### Stage 1 Output (DuckDB `base_repositories`)### Current Mock Resolution Order

```

id      | name   | owner    | urlWhen running with `--mock`:

--------|--------|----------|---------------------------

R_abc123| cosign | sigstore | https://github.com/...1. Read from `src/mockdata/GetRepoData_{owner}_{repo}.json`

```2. Error if not found



### Stage 1 Output (DuckDB `base_release_assets`)**Future Enhancement**: Add JSONL reading as Tier 1 fallback.

```

id      | release_id | name         | download_url### Export-Mocks Subcommand (Phase 2)

--------|------------|--------------|------------------

RA_001  | REL_001    | cosign.sig   | https://...New subcommand to materialize JSONL → individual files:

RA_002  | REL_001    | cosign-sbom  | https://...

``````bash

npm start -- export-mocks \

### Stage 2 Output (DuckDB `agg_artifact_analysis`)  --source output/test-single-raw-responses.jsonl \

```  --dest src/mockdata/

repository_id | artifact_name  | is_sbom | is_signature```

--------------|----------------|---------|-------------

R_abc123      | cosign.sig     | false   | true**Use Cases**:

R_abc123      | cosign-sbom    | true    | false

```- Commit curated test fixtures to git

- Share example responses in documentation

## Mock Mode- CI/CD with specific test scenarios

- Smaller git diffs (individual files vs. large JSONL)

For testing without GitHub API calls:

## Implementation Status

```bash

npm run neo -- --mock --input input/test-single.jsonl### Completed Features ✅

```

✅ **Query Architecture**

Mock data is stored in `src/mockdata/` as individual JSON files.

- Two queries defined (`GetRepoDataArtifacts`, `GetRepoDataExtendedInfo`)

## Extension Points- GraphQL codegen generates TypeScript types

- API client with error handling and rate limit detection

### Adding New Base Tables- Both queries fully implemented and functional



1. Extend the normalizer to return new entity arrays✅ **Extended Query Support**

2. Update `ArtifactWriter.ts` to create the new table

3. Export to Parquet- `--extended` flag enables GetRepoDataExtendedInfo

- Fetches workflows, security policies, branch protection

### Adding New Analysis Logic- Workflow analysis detects CI tools (syft, trivy, cosign, goreleaser, etc.)

- CI_TOOL_KEYWORDS patterns in analysis.ts

1. Create new SQL model in `sql/models/`

2. `SecurityAnalyzer` will automatically execute it✅ **Type System**



### Supporting New GraphQL APIs- **No type unions**: Removed complex union types

- Uses `unknown` with runtime type guards

The architecture is designed to be generic:- Flexible: handles arbitrary GraphQL response structures

1. Point to a different GraphQL endpoint- Decoupled from specific query schemas

2. Create query files

3. Run codegen✅ **Data Collection**

4. Write normalizers

5. Done - the rest is the same- `fetchRepositoryArtifacts()` and `fetchRepositoryExtendedInfo()` in api.ts

- Sequential and parallel execution modes

## Current Status- Batch processing to avoid rate limits

- Mock mode support (reads from src/mockdata/)

### ✅ Implemented

✅ **Analysis Pipeline**

- Two-stage pipeline architecture

- Type-driven normalization pattern- `analyzeRepositoryData()` accepts `unknown` and uses runtime checks

- DuckDB + Parquet artifact generation- Classifies artifacts by regex patterns

- SQL-based analysis layer- Detects security tools in workflows

- Raw response audit logging- Computes summary flags

- Mock mode for testing

- HTML/Markdown reporting✅ **Raw API Response Preservation**



### 🚧 Future Enhancements- Saves to `{dataset}-raw-responses.jsonl` with metadata

- Includes timestamp, queryType, owner, repo

- Schema-driven documentation generation (when data model stabilizes)- Appends on each run for historical tracking

- Generic CLI for any GraphQL API (currently GitHub-specific)- Full reproducibility and audit trail

- Arrow-based in-memory pipeline (currently uses DuckDB for transformations)

- Incremental update detection✅ **Report Generation**



## Design Principles- Analyzed JSON output (renamed to `-analyzed.json`)

- Normalized CSV with one row per artifact

1. **Separation of Concerns**: Generic ETL vs. domain logic- Schema documentation (Parquet-style)

2. **Type Safety**: Leverage TypeScript and GraphQL codegen

3. **Reproducibility**: Preserve raw responses, intermediate tables✅ **Console Output**

4. **Debuggability**: Every transformation step is visible

5. **Flexibility**: Easy to add queries, normalizers, and analysis models- Dual-table view:

6. **Performance**: Columnar storage, batch processing, parallel execution  1. **Repository Summary**: One row per repo with rollup stats

  2. **Detailed Release View**: One row per release with artifact counts
- Shows SBOM, signature, attestation presence
- Shows CI tool detection results

✅ **Mock Data**

- 8 example repos in src/mockdata/
- `--mock` flag reads from individual files

### Remaining Work (Future)

❌ **Mock Data Integration**

- Mock mode doesn't yet read from JSONL files
- Still uses only src/mockdata/ individual files
- **TODO**: Add JSONL reading as Tier 1 fallback

❌ **Export-Mocks Subcommand**

- No way to materialize JSONL → individual files
- Useful for git commits, CI/CD, documentation
- **TODO**: Add `npm start -- export-mocks` command

❌ **Data Lineage Tracking**

- No way to know which raw responses produced which analyzed data
- Could add `raw_response_id` field linking to JSONL line number
- **TODO**: Add lineage metadata

❌ **Incremental Updates**

- No detection of changed repos to avoid re-fetching
- Could use timestamps in JSONL to skip recent fetches
- **TODO**: Add smart re-fetch logic

## Data Flow Diagram

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         GitHub GraphQL API                                │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 │ HTTP Request
                                 │
                    ┌────────────▼────────────┐
                    │      api.ts             │
                    │  fetchRepositoryXxx()   │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                │ Raw Response   │                │ (Phase 1: Save to JSONL)
                │                │                │
                ▼                ▼                ▼
         ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐
         │ analysis.ts │  │   main.ts   │  │ {dataset}-raw-       │
         │ analyzeRepo │  │             │  │   responses.jsonl    │
         └──────┬──────┘  └──────┬──────┘  │  (with metadata)     │
                │                │          └──────────────────────┘
                │ Analyzed       │
                │ Domain Model   │
                │                │
                ▼                ▼
         ┌──────────────────────────┐
         │      report.ts           │
         │  generateReports()       │
         └──────┬───────────────────┘
                │
    ┌───────────┼───────────┬───────────┐
    │           │           │           │
    ▼           ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────────┐
│ .json   │ │ .csv    │ │ -schema │ │ (Mock Mode)│
│ analyzed│ │ flat    │ │ .json   │ │ reads JSONL│
└─────────┘ └─────────┘ └─────────┘ └────────────┘
```

## Configuration & Input

**Input**: JSONL file with one repository per line

```json
{"owner": "sigstore", "name": "cosign"}
{"owner": "fluxcd", "name": "flux2"}
```

**Datasets**: Pre-configured input files

- `input/sandbox.jsonl` - CNCF sandbox projects
- `input/incubation.jsonl` - CNCF incubating projects  
- `input/graduated.jsonl` - CNCF graduated projects
- `input/test-*.jsonl` - Test fixtures

**Environment Variables**:

- `GITHUB_PAT` - GitHub Personal Access Token (required unless `--mock`)
- `MOCK_GITHUB=1` - Alternative to `--mock` flag

**CLI Flags**:

- `--input <file>` - Input JSONL file (default: input/sandbox.jsonl)
- `--output <dir>` - Output directory (default: output/)
- `--mock` - Use mock data instead of API calls
- `--parallel [batchSize]` - Parallel execution with batch size (default: 10)
- `--verbose` - Detailed logging

## Type System Architecture

**Design Philosophy**: Accept arbitrary JSON structures, check at runtime.

### No Type Unions

Previously tried:

```typescript
// ❌ Don't do this
type Repository = RepositoryArtifacts | RepositoryExtended;
```

Problems:

- Couples analysis to specific GraphQL schemas
- Breaks when GraphQL types change
- Requires complex type guards
- Not truly flexible

### Runtime Checks with Unknown

Current approach:

```typescript
// ✅ Do this
export function analyzeRepositoryData(repo: unknown) {
  if (!repo || typeof repo !== 'object') return null;
  const repoObj = repo as Record<string, unknown>;
  
  // Safe extraction with runtime checks
  const releases = repoObj.releases as Record<string, unknown> | undefined;
  const nodes = releases?.nodes;
  if (Array.isArray(nodes)) {
    // Work with what we find
  }
}
```

Benefits:

- Works with any GraphQL response structure
- Decoupled from auto-generated types
- Natural duck typing: "if it has the fields, use them"
- Easy to extend with new queries
- Honest about dynamic data

### Workflow Detection Example

```typescript
// Extract workflows if present (extended query only)
if ('workflows' in repoObj && repoObj.workflows && typeof repoObj.workflows === 'object') {
  const workflows = repoObj.workflows as Record<string, unknown>;
  if ('entries' in workflows && Array.isArray(workflows.entries)) {
    // Analyze workflow YAML for security tools
  }
}
```

## Console Output

The tool displays results in two tables:

### 1. Repository Summary

One row per repository with aggregate statistics:

```text
┌─────────────────┬──────────┬──────────┬──────────┬────────────────┐
│ Repository      │ Releases │ SBOM     │ Sig      │ Total Artifacts│
├─────────────────┼──────────┼──────────┼──────────┼────────────────┤
│ sigstore/cosign │ 5        │          │ ✔        │ 30             │
│ anchore/syft    │ 5        │          │ ✔        │ 30             │
│ github/docs     │ 1        │          │          │                │
└─────────────────┴──────────┴──────────┴──────────┴────────────────┘
```

Shows:

- Repository name (owner/repo)
- Number of releases analyzed
- Presence of SBOM, signatures, attestations (✔ if any release has them)
- Total artifact count across all releases
- CI tool detection (SBOM CI, Sign CI, GoRel CI)

### 2. Detailed Release View

One row per release with per-release artifact counts:

```text
┌─────────────┬────────────┬──────────┬──────────┬────────────┐
│ Repo        │ Release    │ SBOM     │ Sig      │ Artifacts  │
├─────────────┼────────────┼──────────┼──────────┼────────────┤
│ cosign      │ v0.4.0     │          │ ✔        │ 9          │
│             │ v0.3.1     │          │ ✔        │ 6          │
│             │ v0.3.0     │          │ ✔        │ 6          │
└─────────────┴────────────┴──────────┴──────────┴────────────┘
```

Shows:

- Repository name (only on first release)
- Release tag
- Per-release presence indicators
- Artifact count for this specific release

## Next Steps

### Immediate

1. ✅ ~~Add raw response JSONL output with metadata~~ DONE
2. ✅ ~~Rename analyzed output file~~ DONE  
3. ✅ ~~Implement extended query support~~ DONE
4. ✅ ~~Add workflow analysis~~ DONE
5. ✅ ~~Add dual-table console output~~ DONE
6. Update mock mode to read JSONL
7. Run on all graduated projects

### Future Enhancements

1. Create export-mocks subcommand
2. Add data lineage tracking
3. Implement incremental update detection
4. Add filtering/search in detailed view
5. Export tables to markdown/HTML

### Documentation Updates

- ✅ DESIGN.md - Updated to reflect current state
- README.md - Update output artifacts section
- HACKING.md - Update with type system approach
- schema.md - Regenerate after field changes
