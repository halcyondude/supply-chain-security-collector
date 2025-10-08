# Data Model: Raw Responses vs Analyzed JSON

## Overview

This project produces two distinct data representations from GitHub API queries: **raw responses** (unprocessed API output) and **analyzed JSON** (computed domain model). Understanding the difference is critical for working with the output data.

## Raw Responses (`raw-responses.jsonl`)

### What It Is

The unmodified GraphQL API response from GitHub, exactly as returned by the API, with metadata wrapper.

### Structure

```jsonl
{"metadata": {...}, "response": {"data": {"repository": {...}}}}
```

Each line is a complete JSON object containing:
- `metadata` - Query context (queryType, timestamp, owner, repo, inputs)
- `response` - The full GitHub GraphQL response

### Characteristics

- **Direct API output** - No processing, computation, or transformation
- **GitHub's data model** - Nested structure with `nodes`, `edges`, pagination cursors
- **Complete information** - Everything GitHub returns (may include fields you don't use)
- **JSONL format** - One line per repository (newline-delimited JSON)
- **Includes metadata wrapper** - Tracks when and how data was fetched
- **Append behavior** - Historical record, adds to file on each run
- **Large files** - Lines can be 10KB-100KB+ (full response with 5 releases × N assets)
- **Not generated in mock mode** - Only created when fetching from real GitHub API

### Example Structure

```json
{
  "metadata": {
    "queryType": "GetRepoDataArtifacts",
    "timestamp": "2025-10-06T22:30:15.123Z",
    "owner": "sigstore",
    "repo": "cosign",
    "inputs": {"owner": "sigstore", "name": "cosign"}
  },
  "response": {
    "data": {
      "repository": {
        "name": "cosign",
        "nameWithOwner": "sigstore/cosign",
        "url": "https://github.com/sigstore/cosign",
        "description": "Code signing and transparency for containers and binaries",
        "owner": {
          "login": "sigstore"
        },
        "releases": {
          "nodes": [
            {
              "name": "v0.1.0",
              "tagName": "v0.1.0",
              "createdAt": "2021-03-20T00:22:31Z",
              "releaseAssets": {
                "nodes": [
                  {
                    "name": "cosign.sig",
                    "downloadUrl": "https://github.com/sigstore/cosign/releases/download/v0.1.0/cosign.sig"
                  }
                ]
              }
            }
          ]
        },
        "workflows": {
          "entries": [
            {
              "name": "build.yaml",
              "text": "... full YAML content ..."
            }
          ]
        }
      }
    }
  }
}
```

### Use Cases

- **Full data preservation** - Keep complete API responses for future reprocessing
- **Historical tracking** - Append behavior creates timeline of API responses
- **Debugging** - Inspect exact API responses when troubleshooting
- **Alternative analysis** - Reprocess data with different logic without requerying GitHub
- **API cost savings** - Avoid rate limits by reusing cached responses
- **Mock mode source** - Future enhancement to read from JSONL instead of individual files

## Analyzed JSON (`{dataset}-analyzed.json`)

### What It Is

Processed, domain-specific data model with computed classifications and security insights. This is the result of running raw API responses through `analyzeRepositoryData()` in `src/analysis.ts`.

### Structure

```json
[
  {
    "repository": {...},
    "releases": [...],
    "workflows": [...],
    "summary": {...}
  }
]
```

Top-level array of repository analysis objects.

### Characteristics

- **Transformed data** - Flattened, simplified, domain-specific structure
- **Computed fields** - Adds security classifications via regex pattern matching
- **Filtered information** - Only relevant supply chain security data
- **Array of repositories** - Clean JSON array, easy to query with jq/DuckDB
- **No metadata wrapper** - Pure domain objects
- **Overwrite behavior** - Current state only, not historical
- **Smaller files** - Flattened structure, only relevant data retained
- **Query-optimized** - Designed for analysis and reporting

### Example Structure

```json
[
  {
    "repository": {
      "id": "MDEwOlJlcG9zaXRvcnkzMzU5NTI0MTc=",
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
            "name": "cosign.sig",
            "isSbom": false,
            "isSignature": true,
            "isAttestation": false,
            "sbomFormat": "",
            "isVex": false,
            "isSlsaProvenance": false,
            "isInTotoLink": false,
            "isContainerAttestation": true,
            "downloadUrl": "https://github.com/sigstore/cosign/releases/download/v0.1.0/cosign.sig"
          }
        ]
      }
    ],
    "workflows": [
      {
        "name": "build.yaml",
        "detectedSbomTools": ["goreleaser", "signer"]
      }
    ],
    "summary": {
      "hasSbomArtifact": false,
      "hasSignatureArtifact": true,
      "hasAttestationArtifact": false,
      "sbomCiTools": ["goreleaser", "signer"]
    }
  }
]
```

### Use Cases

- **Security analysis** - Query for repos with specific security artifacts
- **Reporting** - Generate summaries and statistics
- **CSV generation** - Source data for flattened tabular format
- **Parquet conversion** - Input for DuckDB-based Parquet generation
- **Programmatic queries** - Easy to parse and filter with standard tools

## Key Transformations (Raw → Analyzed)

### 1. Structure Flattening

**Raw:**
```
repository.releases.nodes[].releaseAssets.nodes[]
```

**Analyzed:**
```
releases[].artifacts[]
```

Removes GraphQL connection wrappers (`nodes`, `edges`, `pageInfo`).

### 2. Security Classification

Applies regex patterns to detect artifact types:

**SBOM Detection:**
- Patterns: `/\b(sbom|spdx|cyclonedx)\b/i`
- Sets: `isSbom: true`, `sbomFormat: "spdx"|"cyclonedx"`

**Signature Detection:**
- Patterns: `/\.(sig|asc|pem|pub)$/i`
- Sets: `isSignature: true`

**Attestation Detection:**
- Patterns: `/attestation/i`, `/provenance/i`, `/\.intoto\.jsonl/i`
- Sets: `isAttestation: true`, `isSlsaProvenance: true`

**CI Tool Detection:**
- Scans workflow YAML for: `syft`, `trivy`, `cosign`, `goreleaser`, etc.
- Populates: `summary.sbomCiTools[]`

### 3. Field Simplification

**Removed:**
- GitHub API metadata (cursors, hasNextPage, totalCount)
- Deeply nested connection objects
- Unused fields

**Added:**
- Boolean classification flags
- Enum-like format identifiers
- Aggregated summary statistics

### 4. Summary Aggregation

Computes repository-level flags:

```typescript
summary: {
  hasSbomArtifact: boolean,        // Any artifact classified as SBOM
  hasSignatureArtifact: boolean,   // Any artifact classified as signature
  hasAttestationArtifact: boolean, // Any artifact classified as attestation
  sbomCiTools: string[]            // List of detected CI tools
}
```

## Processing Pipeline

```
1. Fetch from GitHub API
   ↓
2. Save to raw-responses.jsonl (append, with metadata)
   ↓
3. Pass response.data.repository to analyzeRepositoryData()
   ↓
4. Apply regex patterns for classification
   ↓
5. Flatten structure, remove GraphQL wrappers
   ↓
6. Generate summary statistics
   ↓
7. Save to {dataset}-analyzed.json (overwrite)
   ↓
8. Flatten to normalized rows
   ↓
9. Generate {dataset}.csv
   ↓
10. Convert analyzed JSON to Parquet with schema metadata
```

## File Comparison

| Aspect | Raw Responses | Analyzed JSON |
|--------|--------------|---------------|
| **Format** | JSONL (newline-delimited) | JSON array |
| **Source** | GitHub GraphQL API | analyzeRepositoryData() |
| **Structure** | Nested, with `nodes`/`edges` | Flattened arrays |
| **Size** | 10-100KB+ per line | Smaller, filtered |
| **Metadata** | Includes query metadata | No metadata wrapper |
| **Behavior** | Append (historical) | Overwrite (current state) |
| **Purpose** | Full preservation | Analysis-ready |
| **Computed fields** | None | Many (isSbom, etc.) |
| **Mock mode** | Not generated | Generated |

## Implementation Details

### Raw Response Writing

```typescript
// src/rawResponseWriter.ts
await appendRawResponse(rawResponsesPath, {
  queryType: 'GetRepoDataArtifacts',
  owner: repo.owner,
  repo: repo.name,
  response: repoData,
});
```

### Analysis

```typescript
// src/analysis.ts
export function analyzeRepositoryData(repo: unknown) {
  // Extract releases, apply patterns, compute flags
  const artifacts = releases.map(asset => ({
    name: asset.name,
    isSbom: ARTIFACT_KEYWORDS.SBOM.test(asset.name),
    isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(asset.name),
    // ... more classifications
  }));
  
  return {
    repository: { owner, name, url },
    releases: [...],
    workflows: [...],
    summary: {
      hasSbomArtifact: artifacts.some(a => a.isSbom),
      // ... more summaries
    }
  };
}
```

### Report Generation

```typescript
// src/report.ts
async function generateReports(results, outputDir, baseName, runMetadata) {
  // Write analyzed JSON
  const jsonPath = path.join(outputDir, `${baseName}-analyzed.json`);
  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
  
  // Generate CSV from analyzed data
  // Generate Parquet from analyzed data
}
```

## Querying Examples

### Raw Responses

```bash
# Extract metadata from all responses
jq -c '.metadata' output/graduated-*/raw-responses.jsonl

# Get all responses for a specific repo
jq -c 'select(.metadata.repo == "cosign")' output/graduated-*/raw-responses.jsonl

# Count lines (= number of API calls)
wc -l output/graduated-*/raw-responses.jsonl
```

### Analyzed JSON

```bash
# Count repos with SBOMs
jq '[.[] | select(.summary.hasSbomArtifact == true)] | length' output/graduated-*/graduated-analyzed.json

# List all detected CI tools
jq -r '.[] | .summary.sbomCiTools[]' output/graduated-*/graduated-analyzed.json | sort -u

# Find repos using goreleaser
jq -r '.[] | select(.summary.sbomCiTools | contains(["goreleaser"])) | .repository.name' \
  output/graduated-*/graduated-analyzed.json
```

## Future Enhancements

### Phase 2: JSONL Mock Mode

Read from `raw-responses.jsonl` instead of individual `src/mockdata/*.json` files:

```typescript
// src/rawResponseWriter.ts - TODO
export async function readRawResponse(
  filePath: string,
  owner: string,
  repo: string
): Promise<unknown | null> {
  // Read JSONL, filter by owner/repo, return most recent
}
```

### Phase 3: Raw Responses to Parquet

Convert `raw-responses.jsonl` → `raw-responses.parquet` for efficient querying:

```sql
COPY (
  SELECT 
    metadata.queryType,
    metadata.timestamp,
    metadata.owner,
    metadata.repo,
    response
  FROM read_json_auto('raw-responses.jsonl', format='newline_delimited')
) TO 'raw-responses.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
```

## Summary

Raw responses preserve complete API output for historical tracking and future reprocessing. Analyzed JSON provides a domain-specific, query-optimized model with computed security classifications. Both serve distinct purposes in the data pipeline and should be preserved for different use cases.
