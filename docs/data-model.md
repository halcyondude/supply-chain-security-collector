# Data Model: Current Relational Schema# Data Model: Raw Responses vs Analyzed JSON



## Overview## Overview



The project implements a **relational data model** with two layers of tables:This project produces two distinct data representations from GitHub API queries: **raw responses** (unprocessed API output) and **analyzed JSON** (computed domain model). Understanding the difference is critical for working with the output data.



1. **Base Tables** (`base_*`) - Clean, normalized entities produced by the Collection & Normalization stage## Raw Responses (`raw-responses.jsonl`)

2. **Aggregated Tables** (`agg_*`) - Domain-specific insights produced by the Domain Analysis stage

### What It Is

All tables reside in a DuckDB database and are exported to Parquet files for portable analysis.

The unmodified GraphQL API response from GitHub, exactly as returned by the API, with metadata wrapper.

## Stage 1: Base Tables

### Structure

These tables are produced by the `neo.ts` → `ArtifactWriter.ts` → normalizer pipeline. They represent clean, relational data extracted from GraphQL responses.

```jsonl

### `raw_GetRepoDataExtendedInfo`{"metadata": {...}, "response": {"data": {"repository": {...}}}}

```

Stores the complete, unprocessed GraphQL response for audit and reproducibility.

Each line is a complete JSON object containing:

**Schema:**- `metadata` - Query context (queryType, timestamp, owner, repo, inputs)

```sql- `response` - The full GitHub GraphQL response

CREATE TABLE raw_GetRepoDataExtendedInfo (

  owner TEXT,### Characteristics

  repo TEXT,

  response JSON- **Direct API output** - No processing, computation, or transformation

);- **GitHub's data model** - Nested structure with `nodes`, `edges`, pagination cursors

```- **Complete information** - Everything GitHub returns (may include fields you don't use)

- **JSONL format** - One line per repository (newline-delimited JSON)

**Purpose:**- **Includes metadata wrapper** - Tracks when and how data was fetched

- Full data preservation- **Append behavior** - Historical record, adds to file on each run

- Debugging and validation- **Large files** - Lines can be 10KB-100KB+ (full response with 5 releases × N assets)

- Future reprocessing without re-querying GitHub- **Not generated in mock mode** - Only created when fetching from real GitHub API



### `base_repositories`### Example Structure



Core repository metadata.```json

{

**Schema:**  "metadata": {

```sql    "queryType": "GetRepoDataArtifacts",

CREATE TABLE base_repositories (    "timestamp": "2025-10-06T22:30:15.123Z",

  id TEXT PRIMARY KEY,    "owner": "sigstore",

  name TEXT NOT NULL,    "repo": "cosign",

  owner TEXT NOT NULL,    "inputs": {"owner": "sigstore", "name": "cosign"}

  name_with_owner TEXT NOT NULL,  },

  url TEXT,  "response": {

  description TEXT,    "data": {

  created_at TIMESTAMP,      "repository": {

  updated_at TIMESTAMP        "name": "cosign",

);        "nameWithOwner": "sigstore/cosign",

```        "url": "https://github.com/sigstore/cosign",

        "description": "Code signing and transparency for containers and binaries",

**Source:** Extracted from `repository` object in GraphQL response        "owner": {

          "login": "sigstore"

**Example Row:**        },

```        "releases": {

id: R_kgDOHJ8xYw          "nodes": [

name: cosign            {

owner: sigstore              "name": "v0.1.0",

name_with_owner: sigstore/cosign              "tagName": "v0.1.0",

url: https://github.com/sigstore/cosign              "createdAt": "2021-03-20T00:22:31Z",

description: Code signing and transparency for containers              "releaseAssets": {

```                "nodes": [

                  {

### `base_releases`                    "name": "cosign.sig",

                    "downloadUrl": "https://github.com/sigstore/cosign/releases/download/v0.1.0/cosign.sig"

Release information with foreign key to repository.                  }

                ]

**Schema:**              }

```sql            }

CREATE TABLE base_releases (          ]

  id TEXT PRIMARY KEY,        },

  repository_id TEXT NOT NULL,        "workflows": {

  tag_name TEXT NOT NULL,          "entries": [

  name TEXT,            {

  created_at TIMESTAMP,              "name": "build.yaml",

  published_at TIMESTAMP,              "text": "... full YAML content ..."

  is_prerelease BOOLEAN,            }

  is_draft BOOLEAN,          ]

  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)        }

);      }

```    }

  }

**Source:** Extracted from `repository.releases.nodes[]` in GraphQL response}

```

**Example Row:**

```### Use Cases

id: RE_kwDOHJ8xY84Fe7i7

repository_id: R_kgDOHJ8xYw- **Full data preservation** - Keep complete API responses for future reprocessing

tag_name: v2.2.0- **Historical tracking** - Append behavior creates timeline of API responses

name: v2.2.0- **Debugging** - Inspect exact API responses when troubleshooting

created_at: 2023-10-15T10:30:00Z- **Alternative analysis** - Reprocess data with different logic without requerying GitHub

is_prerelease: false- **API cost savings** - Avoid rate limits by reusing cached responses

```- **Mock mode source** - Future enhancement to read from JSONL instead of individual files



### `base_release_assets`## Analyzed JSON (`{dataset}-analyzed.json`)



Individual release artifacts with foreign keys to release and repository.### What It Is



**Schema:**Processed, domain-specific data model with computed classifications and security insights. This is the result of running raw API responses through `analyzeRepositoryData()` in `src/analysis.ts`.

```sql

CREATE TABLE base_release_assets (### Structure

  id TEXT PRIMARY KEY,

  repository_id TEXT NOT NULL,```json

  release_id TEXT NOT NULL,[

  name TEXT NOT NULL,  {

  download_url TEXT,    "repository": {...},

  size BIGINT,    "releases": [...],

  content_type TEXT,    "workflows": [...],

  created_at TIMESTAMP,    "summary": {...}

  FOREIGN KEY (repository_id) REFERENCES base_repositories(id),  }

  FOREIGN KEY (release_id) REFERENCES base_releases(id)]

);```

```

Top-level array of repository analysis objects.

**Source:** Extracted from `repository.releases.nodes[].releaseAssets.nodes[]` in GraphQL response

### Characteristics

**Example Rows:**

```- **Transformed data** - Flattened, simplified, domain-specific structure

id: RA_001- **Computed fields** - Adds security classifications via regex pattern matching

release_id: RE_kwDOHJ8xY84Fe7i7- **Filtered information** - Only relevant supply chain security data

name: cosign-linux-amd64- **Array of repositories** - Clean JSON array, easy to query with jq/DuckDB

download_url: https://github.com/sigstore/cosign/releases/download/v2.2.0/cosign-linux-amd64- **No metadata wrapper** - Pure domain objects

- **Overwrite behavior** - Current state only, not historical

id: RA_002- **Smaller files** - Flattened structure, only relevant data retained

release_id: RE_kwDOHJ8xY84Fe7i7- **Query-optimized** - Designed for analysis and reporting

name: cosign-linux-amd64.sig

download_url: https://github.com/sigstore/cosign/releases/download/v2.2.0/cosign-linux-amd64.sig### Example Structure

```

```json

### `base_workflows`[

  {

GitHub Actions workflows with foreign key to repository.    "repository": {

      "id": "MDEwOlJlcG9zaXRvcnkzMzU5NTI0MTc=",

**Schema:**      "owner": "sigstore",

```sql      "name": "cosign",

CREATE TABLE base_workflows (      "url": "https://github.com/sigstore/cosign"

  id TEXT PRIMARY KEY,    },

  repository_id TEXT NOT NULL,    "releases": [

  name TEXT NOT NULL,      {

  path TEXT NOT NULL,        "tagName": "v0.1.0",

  content TEXT,        "name": "v0.1.0",

  FOREIGN KEY (repository_id) REFERENCES base_repositories(id)        "createdAt": "2021-03-20T00:22:31Z",

);        "artifacts": [

```          {

            "name": "cosign.sig",

**Source:** Extracted from `repository.object.entries[]` (tree traversal for `.github/workflows/*.yml`)            "isSbom": false,

            "isSignature": true,

**Example Row:**            "isAttestation": false,

```            "sbomFormat": "",

id: WF_001            "isVex": false,

repository_id: R_kgDOHJ8xYw            "isSlsaProvenance": false,

name: release.yaml            "isInTotoLink": false,

path: .github/workflows/release.yaml            "isContainerAttestation": true,

content: |            "downloadUrl": "https://github.com/sigstore/cosign/releases/download/v0.1.0/cosign.sig"

  name: Release          }

  on:        ]

    push:      }

      tags: ['v*']    ],

  jobs:    "workflows": [

    goreleaser:      {

      runs-on: ubuntu-latest        "name": "build.yaml",

      steps:        "detectedSbomTools": ["goreleaser", "signer"]

        - uses: actions/checkout@v3      }

        - uses: goreleaser/goreleaser-action@v4    ],

```    "summary": {

      "hasSbomArtifact": false,

## Stage 2: Aggregated Tables      "hasSignatureArtifact": true,

      "hasAttestationArtifact": false,

These tables are produced by the `analyze.ts` → `SecurityAnalyzer.ts` → SQL models pipeline. They apply business logic and create domain-specific insights.      "sbomCiTools": ["goreleaser", "signer"]

    }

### `agg_artifact_analysis`  }

]

Classifies release artifacts by security artifact type.```



**Schema:**### Use Cases

```sql

CREATE TABLE agg_artifact_analysis AS- **Security analysis** - Query for repos with specific security artifacts

SELECT - **Reporting** - Generate summaries and statistics

  ra.repository_id,- **CSV generation** - Source data for flattened tabular format

  ra.release_id,- **Parquet conversion** - Input for DuckDB-based Parquet generation

  ra.name AS artifact_name,- **Programmatic queries** - Easy to parse and filter with standard tools

  REGEXP_MATCHES(ra.name, '\.(sbom|spdx|cyclonedx)\.(json|xml)$', 'i') AS is_sbom,

  REGEXP_MATCHES(ra.name, '\.(sig|asc|signature)$', 'i') AS is_signature,## Key Transformations (Raw → Analyzed)

  REGEXP_MATCHES(ra.name, 'attestation', 'i') AS is_attestation,

  REGEXP_MATCHES(ra.name, 'provenance', 'i') AS is_provenance,### 1. Structure Flattening

  ra.download_url

FROM base_release_assets ra**Raw:**

JOIN base_releases r ON ra.release_id = r.id```

WHERE ra.name IS NOT NULL;repository.releases.nodes[].releaseAssets.nodes[]

``````



**Purpose:** Detect presence of SBOMs, signatures, attestations, and provenance files**Analyzed:**

```

**Example Rows:**releases[].artifacts[]

``````

repository_id: R_kgDOHJ8xYw

artifact_name: cosign-linux-amd64.sigRemoves GraphQL connection wrappers (`nodes`, `edges`, `pageInfo`).

is_sbom: false

is_signature: true### 2. Security Classification

is_attestation: false

Applies regex patterns to detect artifact types:

repository_id: R_kgDOHJ8xYw

artifact_name: cosign-sbom.spdx.json**SBOM Detection:**

is_sbom: true- Patterns: `/\b(sbom|spdx|cyclonedx)\b/i`

is_signature: false- Sets: `isSbom: true`, `sbomFormat: "spdx"|"cyclonedx"`

is_attestation: false

```**Signature Detection:**

- Patterns: `/\.(sig|asc|pem|pub)$/i`

### `agg_workflow_tools`- Sets: `isSignature: true`



Detects CI/CD security tools used in GitHub Actions workflows.**Attestation Detection:**

- Patterns: `/attestation/i`, `/provenance/i`, `/\.intoto\.jsonl/i`

**Schema:**- Sets: `isAttestation: true`, `isSlsaProvenance: true`

```sql

CREATE TABLE agg_workflow_tools AS**CI Tool Detection:**

SELECT - Scans workflow YAML for: `syft`, `trivy`, `cosign`, `goreleaser`, etc.

  w.repository_id,- Populates: `summary.sbomCiTools[]`

  w.name AS workflow_name,

  w.path AS workflow_path,### 3. Field Simplification

  REGEXP_MATCHES(w.content, 'syft', 'i') AS uses_syft,

  REGEXP_MATCHES(w.content, 'cosign', 'i') AS uses_cosign,**Removed:**

  REGEXP_MATCHES(w.content, 'goreleaser', 'i') AS uses_goreleaser,- GitHub API metadata (cursors, hasNextPage, totalCount)

  REGEXP_MATCHES(w.content, 'trivy', 'i') AS uses_trivy,- Deeply nested connection objects

  REGEXP_MATCHES(w.content, 'slsa-framework/slsa-github-generator', 'i') AS uses_slsa- Unused fields

FROM base_workflows w

WHERE w.content IS NOT NULL;**Added:**

```- Boolean classification flags

- Enum-like format identifiers

**Purpose:** Identify which security tools are integrated into CI/CD pipelines- Aggregated summary statistics



**Example Row:**### 4. Summary Aggregation

```

repository_id: R_kgDOHJ8xYwComputes repository-level flags:

workflow_name: release.yaml

uses_syft: false```typescript

uses_cosign: truesummary: {

uses_goreleaser: true  hasSbomArtifact: boolean,        // Any artifact classified as SBOM

uses_trivy: false  hasSignatureArtifact: boolean,   // Any artifact classified as signature

uses_slsa: false  hasAttestationArtifact: boolean, // Any artifact classified as attestation

```  sbomCiTools: string[]            // List of detected CI tools

}

### `agg_repo_summary````



Repository-level rollup statistics.## Processing Pipeline



**Schema:**```

```sql1. Fetch from GitHub API

CREATE TABLE agg_repo_summary AS   ↓

SELECT 2. Save to raw-responses.jsonl (append, with metadata)

  r.id AS repository_id,   ↓

  r.name,3. Pass response.data.repository to analyzeRepositoryData()

  r.owner,   ↓

  COUNT(DISTINCT rel.id) AS total_releases,4. Apply regex patterns for classification

  COUNT(DISTINCT ra.id) AS total_artifacts,   ↓

  BOOL_OR(aa.is_sbom) AS has_sbom_artifact,5. Flatten structure, remove GraphQL wrappers

  BOOL_OR(aa.is_signature) AS has_signature_artifact,   ↓

  BOOL_OR(aa.is_attestation) AS has_attestation_artifact,6. Generate summary statistics

  BOOL_OR(wt.uses_syft OR wt.uses_trivy) AS has_sbom_ci_tool,   ↓

  BOOL_OR(wt.uses_cosign) AS has_signature_ci_tool,7. Save to {dataset}-analyzed.json (overwrite)

  BOOL_OR(wt.uses_goreleaser) AS has_goreleaser   ↓

FROM base_repositories r8. Flatten to normalized rows

LEFT JOIN base_releases rel ON r.id = rel.repository_id   ↓

LEFT JOIN base_release_assets ra ON rel.id = ra.release_id9. Generate {dataset}.csv

LEFT JOIN agg_artifact_analysis aa ON ra.id = aa.release_id   ↓

LEFT JOIN agg_workflow_tools wt ON r.id = wt.repository_id10. Convert analyzed JSON to Parquet with schema metadata

GROUP BY r.id, r.name, r.owner;```

```

## File Comparison

**Purpose:** High-level security posture summary for each repository

| Aspect | Raw Responses | Analyzed JSON |

**Example Row:**|--------|--------------|---------------|

```| **Format** | JSONL (newline-delimited) | JSON array |

repository_id: R_kgDOHJ8xYw| **Source** | GitHub GraphQL API | analyzeRepositoryData() |

name: cosign| **Structure** | Nested, with `nodes`/`edges` | Flattened arrays |

owner: sigstore| **Size** | 10-100KB+ per line | Smaller, filtered |

total_releases: 42| **Metadata** | Includes query metadata | No metadata wrapper |

total_artifacts: 420| **Behavior** | Append (historical) | Overwrite (current state) |

has_sbom_artifact: true| **Purpose** | Full preservation | Analysis-ready |

has_signature_artifact: true| **Computed fields** | None | Many (isSbom, etc.) |

has_attestation_artifact: true| **Mock mode** | Not generated | Generated |

has_sbom_ci_tool: true

has_signature_ci_tool: true## Implementation Details

has_goreleaser: true

```### Raw Response Writing



## Normalization Process```typescript

// src/rawResponseWriter.ts

### How GraphQL Responses Become Base Tablesawait appendRawResponse(rawResponsesPath, {

  queryType: 'GetRepoDataArtifacts',

The normalizers in `src/normalizers/` perform these transformations:  owner: repo.owner,

  repo: repo.name,

**Input (GraphQL Response):**  response: repoData,

```json});

{```

  "repository": {

    "id": "R_abc",### Analysis

    "name": "cosign",

    "owner": { "login": "sigstore" },```typescript

    "releases": {// src/analysis.ts

      "nodes": [export function analyzeRepositoryData(repo: unknown) {

        {  // Extract releases, apply patterns, compute flags

          "id": "REL_001",  const artifacts = releases.map(asset => ({

          "tagName": "v2.2.0",    name: asset.name,

          "releaseAssets": {    isSbom: ARTIFACT_KEYWORDS.SBOM.test(asset.name),

            "nodes": [    isSignature: ARTIFACT_KEYWORDS.SIGNATURE.test(asset.name),

              { "id": "RA_001", "name": "cosign.sig" }    // ... more classifications

            ]  }));

          }  

        }  return {

      ]    repository: { owner, name, url },

    }    releases: [...],

  }    workflows: [...],

}    summary: {

```      hasSbomArtifact: artifacts.some(a => a.isSbom),

      // ... more summaries

**Output (Relational Arrays):**    }

```typescript  };

{}

  repositories: [```

    { id: "R_abc", name: "cosign", owner: "sigstore", ... }

  ],### Report Generation

  releases: [

    { id: "REL_001", repository_id: "R_abc", tag_name: "v2.2.0", ... }```typescript

  ],// src/report.ts

  releaseAssets: [async function generateReports(results, outputDir, baseName, runMetadata) {

    { id: "RA_001", repository_id: "R_abc", release_id: "REL_001", name: "cosign.sig", ... }  // Write analyzed JSON

  ]  const jsonPath = path.join(outputDir, `${baseName}-analyzed.json`);

}  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));

```  

  // Generate CSV from analyzed data

These arrays are then inserted into DuckDB as the `base_*` tables.  // Generate Parquet from analyzed data

}

## Querying the Data```



### Example Queries## Querying Examples



**Find all repositories with SBOM artifacts:**### Raw Responses

```sql

SELECT r.owner, r.name, COUNT(*) AS sbom_count```bash

FROM base_repositories r# Extract metadata from all responses

JOIN agg_artifact_analysis aa ON r.id = aa.repository_idjq -c '.metadata' output/graduated-*/raw-responses.jsonl

WHERE aa.is_sbom = true

GROUP BY r.owner, r.name# Get all responses for a specific repo

ORDER BY sbom_count DESC;jq -c 'select(.metadata.repo == "cosign")' output/graduated-*/raw-responses.jsonl

```

# Count lines (= number of API calls)

**Find repositories using both Syft and Cosign in CI:**wc -l output/graduated-*/raw-responses.jsonl

```sql```

SELECT r.owner, r.name

FROM base_repositories r### Analyzed JSON

JOIN agg_workflow_tools wt ON r.id = wt.repository_id

WHERE wt.uses_syft = true AND wt.uses_cosign = true;```bash

```# Count repos with SBOMs

jq '[.[] | select(.summary.hasSbomArtifact == true)] | length' output/graduated-*/graduated-analyzed.json

**Get detailed artifact breakdown for a specific repository:**

```sql# List all detected CI tools

SELECT jq -r '.[] | .summary.sbomCiTools[]' output/graduated-*/graduated-analyzed.json | sort -u

  rel.tag_name,

  ra.name,# Find repos using goreleaser

  aa.is_sbom,jq -r '.[] | select(.summary.sbomCiTools | contains(["goreleaser"])) | .repository.name' \

  aa.is_signature,  output/graduated-*/graduated-analyzed.json

  aa.is_attestation```

FROM base_repositories r

JOIN base_releases rel ON r.id = rel.repository_id## Future Enhancements

JOIN base_release_assets ra ON rel.id = ra.release_id

JOIN agg_artifact_analysis aa ON ra.id = aa.release_id### Phase 2: JSONL Mock Mode

WHERE r.name = 'cosign' AND r.owner = 'sigstore'

ORDER BY rel.created_at DESC, ra.name;Read from `raw-responses.jsonl` instead of individual `src/mockdata/*.json` files:

```

```typescript

## Parquet Export// src/rawResponseWriter.ts - TODO

export async function readRawResponse(

All tables are exported to Parquet files with metadata:  filePath: string,

  owner: string,

```  repo: string

output/test-run-2025-10-12T19-20-16/): Promise<unknown | null> {

└── GetRepoDataExtendedInfo/  // Read JSONL, filter by owner/repo, return most recent

    └── parquet/}

        ├── base_repositories.parquet```

        ├── base_releases.parquet

        ├── base_release_assets.parquet### Phase 3: Raw Responses to Parquet

        ├── base_workflows.parquet

        ├── agg_artifact_analysis.parquetConvert `raw-responses.jsonl` → `raw-responses.parquet` for efficient querying:

        ├── agg_workflow_tools.parquet

        └── agg_repo_summary.parquet```sql

```COPY (

  SELECT 

These can be queried directly with DuckDB, Python (PyArrow/Pandas), or any Parquet-compatible tool:    metadata.queryType,

    metadata.timestamp,

```python    metadata.owner,

import duckdb    metadata.repo,

    response

conn = duckdb.connect()  FROM read_json_auto('raw-responses.jsonl', format='newline_delimited')

result = conn.execute(""") TO 'raw-responses.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

  SELECT owner, name, has_sbom_artifact```

  FROM 'output/*/GetRepoDataExtendedInfo/parquet/agg_repo_summary.parquet'

  WHERE has_sbom_artifact = true## Summary

""").fetchall()

```Raw responses preserve complete API output for historical tracking and future reprocessing. Analyzed JSON provides a domain-specific, query-optimized model with computed security classifications. Both serve distinct purposes in the data pipeline and should be preserved for different use cases.


## Schema Evolution

As the data model evolves:

1. **Normalizers change**: Update the TypeScript normalizer to add/remove fields
2. **Base tables change**: DuckDB automatically infers schema from the arrays
3. **SQL models change**: Update `sql/models/*.sql` to use new fields
4. **Parquet regenerated**: Next run produces new Parquet files with updated schema

The beauty of this architecture is that schema changes are localized to the normalizer and SQL model files - no manual schema management required.

## Future Enhancements

### Phase 1: Schema Documentation Generation

When the data model stabilizes, auto-generate documentation:
- Extract column metadata from DuckDB
- Generate markdown tables with column types and descriptions
- Include example queries

### Phase 2: Schema Versioning

Add version tracking to detect breaking changes:
- Include schema version in Parquet metadata
- Validate compatibility across runs
- Support migrations between versions

### Phase 3: GraphQL → Relational Mapping

Document the explicit mapping from GraphQL schema to relational schema:
- `repository` → `base_repositories`
- `repository.releases.nodes[]` → `base_releases`
- `repository.releases.nodes[].releaseAssets.nodes[]` → `base_release_assets`

This will make it easy to add new GraphQL queries and predict what tables they'll produce.
