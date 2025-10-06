# System Design

## Overview

The GitHub Supply Chain Security Analyzer is a data collection and analysis tool that searches GitHub repositories for the **presence** of supply chain security artifacts. It does NOT validate or analyze the content of these artifacts - it simply reports what exists.

**Target Use Case**: Analyzing CNCF landscape projects to understand adoption of supply chain security practices (SBOMs, signatures, attestations, SLSA provenance, etc.).

**Core Philosophy**:

- Presence detection only - not content validation
- Raw data preservation for reproducibility
- Multiple output formats for different consumers
- API-efficient with targeted queries

## Query Architecture

The tool uses a **two-query design** to balance API efficiency with flexibility.

### GetRepoDataArtifacts (Default)

Lightweight query fetching:

- Repository metadata (name, owner, id)
- Last 5 releases with up to 50 artifacts each
- Basic release info (tag, name, created date)

**Use Case**: Default mode. Fast presence detection of security artifacts in releases.

### GetRepoDataExtendedInfo (--extended flag)

Comprehensive query adding:

- GitHub Actions workflows (YAML content)
- Security policies (SECURITY.md)
- Branch protection settings
- Dependabot configuration
- Repository metadata (URL, description, license)

**Use Case**: Deep analysis of CI/CD security tooling. Detects security tools in workflows (syft, trivy, cosign, goreleaser, etc.).

**Status**: ✅ Implemented. Use `--extended` flag to enable.

**Why Two Queries?**

- Rate limits matter - don't fetch workflow YAML if you only need artifacts
- Each query returns a distinct type (no union types, no runtime guards)
- Easy to extend - just add another query file and API function

See [QUERY-ARCHITECTURE.md](docs/QUERY-ARCHITECTURE.md) for implementation details.

## Data Pipeline

The tool processes data through three distinct stages:

```text
┌─────────────────────┐
│  GitHub GraphQL API │
└──────────┬──────────┘
           │
           │ Raw Response (nested GraphQL structure)
           │
           ▼
┌─────────────────────┐
│   analysis.ts       │  ← Pattern matching & classification
│   analyzeRepo()     │
└──────────┬──────────┘
           │
           │ Analyzed Domain Model (computed fields)
           │
           ▼
┌─────────────────────┐
│   report.ts         │  ← Format conversion & normalization
│   generateReports() │
└──────────┬──────────┘
           │
           │ Multiple output formats
           │
           ▼
     Output Artifacts
```

### Stage 1: Raw API Response

**Structure**: Nested GraphQL response with pagination nodes and type wrappers.

**Example**:

```json
{
  "data": {
    "repository": {
      "id": "MDEwOlJlcG9zaXRvcnk...",
      "name": "cosign",
      "nameWithOwner": "sigstore/cosign",
      "releases": {
        "nodes": [
          {
            "tagName": "v0.1.0",
            "name": "v0.1.0",
            "createdAt": "2021-03-20T00:22:31Z",
            "releaseAssets": {
              "nodes": [
                { "name": "cosign", "downloadUrl": "https://..." },
                { "name": "cosign.sig", "downloadUrl": "https://..." }
              ]
            }
          }
        ]
      }
    }
  }
}
```

**Current State**: ✅ Saved to `{dataset}-raw-responses.jsonl` with metadata (timestamp, queryType, owner, repo)

### Stage 2: Analyzed Domain Model

**Purpose**: Transform raw GraphQL into business domain objects with computed fields.

**Processing** (in `analysis.ts`):

- Extract owner from `nameWithOwner`
- Flatten GraphQL pagination nodes
- Classify artifacts by name patterns (regex matching):
  - `isSbom`, `isSignature`, `isAttestation`
  - `sbomFormat` (spdx, cyclonedx, unknown)
  - `isVex`, `isSlsaProvenance`, `isInTotoLink`, `isContainerAttestation`
- Compute summary flags (presence of each artifact type)
- Collect unique security tool types into `sbomCiTools` array

**Example**:

```json
{
  "repository": {
    "id": "MDEwOlJlcG9zaXRvcnk...",
    "owner": "sigstore",
    "name": "cosign",
    "url": "https://github.com/sigstore/cosign"
  },
  "releases": [
    {
      "tagName": "v0.1.0",
      "name": "v0.1.0",
      "createdAt": "2021-03-20T00:22:31Z",
      "artifacts": [
        {
          "name": "cosign",
          "isSbom": false,
          "isSignature": false,
          "isAttestation": false,
          "sbomFormat": "",
          "downloadUrl": "https://..."
        },
        {
          "name": "cosign.sig",
          "isSbom": false,
          "isSignature": true,
          "isAttestation": false,
          "sbomFormat": "",
          "downloadUrl": "https://..."
        }
      ]
    }
  ],
  "workflows": [],
  "summary": {
    "hasSbomArtifact": false,
    "hasSignatureArtifact": true,
    "hasAttestationArtifact": false,
    "sbomCiTools": ["signature"]
  }
}
```

**Current State**: ✅ Generated and saved to `{dataset}-analyzed.json`

### Stage 3: Normalized CSV

**Purpose**: Flatten hierarchical JSON into wide tabular format for spreadsheet/SQL analysis.

**Processing** (in `report.ts`):

- One row per artifact
- Repository and release info duplicated across artifact rows
- Nested arrays encoded as JSON strings
- Additional computed fields:
  - `artifact_type` classification
  - `platform_hint` extraction
  - `size_hint` extraction
  - `release_has_container_images`, `release_has_slsa_provenance`

**Current State**: ✅ Generated and saved to `{dataset}.csv`

## Output Artifacts

### Output Files

Each run produces **four files** per dataset:

1. **`{dataset}-raw-responses.jsonl`** - Raw GraphQL API responses with metadata
   - One line per API fetch (appends on each run for historical tracking)
   - Each line: `{"metadata": {...}, "response": {...}}`
   - Metadata includes:
     - `timestamp`: When the data was fetched (ISO 8601)
     - `queryType`: Which GraphQL query was used (GetRepoDataArtifacts or GetRepoDataExtendedInfo)
     - `owner`: Repository owner
     - `repo`: Repository name
   - **Append behavior**: New runs add to existing file, preserving history

2. **`{dataset}-analyzed.json`** - Analyzed domain model (array of repository analysis objects)
   - Computed fields and classifications
   - **Overwrite behavior**: Current state only, not historical

3. **`{dataset}.csv`** - Normalized flat CSV (one row per artifact)
   - For spreadsheet analysis, SQL imports, etc.
   - **Overwrite behavior**: Current state only

4. **`{dataset}-schema.json`** - Parquet-style schema documentation
   - Field types, descriptions, examples, categories
   - Used for documentation generation
   - Enables future JSON → Parquet conversion via external tools
   - **Overwrite behavior**: Current state only

**Example JSONL line**:

```json
{"metadata": {"queryType": "GetRepoDataArtifacts", "timestamp": "2025-10-06T17:30:00Z", "owner": "sigstore", "repo": "cosign", "inputs": {"owner": "sigstore", "name": "cosign"}}, "response": {"data": {"repository": { ... }}}}
```

**Benefits**:

- **Historical tracking**: See how repos change over time
- **Reproducibility**: Re-analyze old data without re-fetching
- **Debugging**: See exactly what GitHub returned
- **Audit trail**: Know when data was collected
- **Data validation**: Verify analysis logic against raw responses
- **Mock data source**: Becomes input for mock mode (see below)

### File Naming Convention

```text
output/
  {dataset}-raw-responses.jsonl     # Raw API responses with metadata (APPEND)
  {dataset}-analyzed.json           # Analyzed domain model (OVERWRITE)
  {dataset}.csv                     # Normalized CSV (OVERWRITE)
  {dataset}-schema.json             # Schema documentation (OVERWRITE)
```

Examples:

- `sandbox-raw-responses.jsonl`
- `sandbox-analyzed.json`
- `sandbox.csv`
- `sandbox-schema.json`

## Mock Data Strategy

### Current Implementation

Mock mode (`--mock` flag) reads from `src/mockdata/` directory:

- Individual files: `GetRepoData_{owner}_{repo}.json`
- Contains full raw API responses
- 8 hand-picked repos for testing specific scenarios

**Limitations**:

- Separate from production output
- No connection to actual captured data
- Manual maintenance required

### Future: Two-Tier System (Not Yet Implemented)

#### Tier 1: JSONL Bulk Data (TODO)

- Mock mode would read from `output/{dataset}-raw-responses.jsonl` first
- Filter by owner/repo to find matching response
- Use most recent entry for that repo
- **Real captured data becomes mock data automatically**

#### Tier 2: Individual Files (Current)

- Currently: Only reads from `src/mockdata/GetRepoData_{owner}_{repo}.json`
- Useful for curated test cases committed to git
- Specific test scenarios (e.g., "repo with SLSA provenance")

### Current Mock Resolution Order

When running with `--mock`:

1. Read from `src/mockdata/GetRepoData_{owner}_{repo}.json`
2. Error if not found

**Future Enhancement**: Add JSONL reading as Tier 1 fallback.

### Export-Mocks Subcommand (Phase 2)

New subcommand to materialize JSONL → individual files:

```bash
npm start -- export-mocks \
  --source output/test-single-raw-responses.jsonl \
  --dest src/mockdata/
```

**Use Cases**:

- Commit curated test fixtures to git
- Share example responses in documentation
- CI/CD with specific test scenarios
- Smaller git diffs (individual files vs. large JSONL)

## Implementation Status

### Completed Features ✅

✅ **Query Architecture**

- Two queries defined (`GetRepoDataArtifacts`, `GetRepoDataExtendedInfo`)
- GraphQL codegen generates TypeScript types
- API client with error handling and rate limit detection
- Both queries fully implemented and functional

✅ **Extended Query Support**

- `--extended` flag enables GetRepoDataExtendedInfo
- Fetches workflows, security policies, branch protection
- Workflow analysis detects CI tools (syft, trivy, cosign, goreleaser, etc.)
- CI_TOOL_KEYWORDS patterns in analysis.ts

✅ **Type System**

- **No type unions**: Removed complex union types
- Uses `unknown` with runtime type guards
- Flexible: handles arbitrary GraphQL response structures
- Decoupled from specific query schemas

✅ **Data Collection**

- `fetchRepositoryArtifacts()` and `fetchRepositoryExtendedInfo()` in api.ts
- Sequential and parallel execution modes
- Batch processing to avoid rate limits
- Mock mode support (reads from src/mockdata/)

✅ **Analysis Pipeline**

- `analyzeRepositoryData()` accepts `unknown` and uses runtime checks
- Classifies artifacts by regex patterns
- Detects security tools in workflows
- Computes summary flags

✅ **Raw API Response Preservation**

- Saves to `{dataset}-raw-responses.jsonl` with metadata
- Includes timestamp, queryType, owner, repo
- Appends on each run for historical tracking
- Full reproducibility and audit trail

✅ **Report Generation**

- Analyzed JSON output (renamed to `-analyzed.json`)
- Normalized CSV with one row per artifact
- Schema documentation (Parquet-style)

✅ **Console Output**

- Dual-table view:
  1. **Repository Summary**: One row per repo with rollup stats
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
- SCHEMA.md - Regenerate after field changes
