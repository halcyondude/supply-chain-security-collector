# GitHub Supply Chain Security Analysis Schema

## Overview

Normalized data schema for supply chain security analysis of GitHub repositories

**Generated from:** `sandbox.parquet.json`  
**Generated at:** 10/4/2025, 9:14:09 PM  
**Total fields:** 38

## Schema Fields

| Field | Type | Nullable | Category | Description |
|-------|------|----------|----------|-------------|
| `repository_id` | `string` |  | Repository Identity | Unique repository identifier (GitHub URL) |
| `repository_owner` | `string` |  | Repository Identity | GitHub organization or user name |
| `repository_name` | `string` |  | Repository Identity | Repository name without owner |
| `repository_name_with_owner` | `string` |  | Repository Identity | Full repository path (owner/name) |
| `repository_url` | `string` |  | Repository Identity | GitHub repository URL |
| `repository_description` | `string` |  | Repository Identity | Repository description text |
| `repo_has_sbom_artifact` | `boolean` |  | Security Artifacts & Tools | Repository contains SBOM (Software Bill of Materials) files |
| `repo_has_signature_artifact` | `boolean` |  | Security Artifacts & Tools | Repository contains cryptographic signature files |
| `repo_has_attestation_artifact` | `boolean` |  | Security Artifacts & Tools | Repository contains attestation files |
| `repo_security_tools_json` | `string` |  | Security Artifacts & Tools | JSON array of detected security tools across the repository |
| `repo_security_tools_count` | `number` |  | Security Artifacts & Tools | Total count of unique security tool types |
| `workflow_count` | `number` |  | CI/CD Workflows | Total number of CI/CD workflow files |
| `workflow_names_json` | `string` |  | CI/CD Workflows | JSON array of workflow file names |
| `workflow_security_tools_json` | `string` |  | CI/CD Workflows | JSON array of security tools found in each workflow |
| `release_index` | `number` |  | Release Information | Zero-based index of this release (0 = latest) |
| `release_tag_name` | `string` |  | Release Information | Git tag name for this release |
| `release_name` | `string` |  | Release Information | Display name of the release |
| `release_created_at` | `string` |  | Release Information | ISO timestamp of release creation |
| `release_artifact_count` | `number` |  | Release Information | Total number of artifacts in this release |
| `release_has_container_images` | `boolean` |  | Release Information | Release contains container images |
| `release_has_slsa_provenance` | `boolean` |  | Release Information | Release contains SLSA provenance documents |
| `release_has_in_toto_attestation` | `boolean` |  | Release Information | Release contains in-toto attestations |
| `release_sbom_formats_json` | `string` |  | Release Information | JSON array of SBOM formats found in release |
| `artifact_index` | `string | null` | ✓ | Artifact Details | Zero-based index of this artifact within the release |
| `artifact_name` | `string` |  | Artifact Details | Filename of the artifact |
| `artifact_download_url` | `string` |  | Artifact Details | Direct download URL for the artifact |
| `artifact_size_hint` | `string` |  | Artifact Details | Estimated size of the artifact |
| `artifact_file_extension` | `string` |  | Artifact Details | File extension extracted from artifact name |
| `artifact_is_sbom` | `boolean` |  | Artifact Details | This artifact is an SBOM file |
| `artifact_is_signature` | `boolean` |  | Artifact Details | This artifact is a cryptographic signature |
| `artifact_is_attestation` | `boolean` |  | Artifact Details | This artifact is an attestation document |
| `artifact_sbom_format` | `string` |  | Artifact Details | Specific SBOM format if this is an SBOM file |
| `artifact_is_vex` | `boolean` |  | Artifact Details | This artifact is a VEX (Vulnerability Exchange) document |
| `artifact_is_slsa_provenance` | `boolean` |  | Artifact Details | This artifact contains SLSA provenance information |
| `artifact_is_in_toto_link` | `boolean` |  | Artifact Details | This artifact is an in-toto link metadata file |
| `artifact_is_container_attestation` | `boolean` |  | Artifact Details | This artifact is a container attestation |
| `artifact_type` | `string` |  | Artifact Details | Classified type of artifact (signature, sbom, etc.) |
| `artifact_platform_hint` | `string` |  | Artifact Details | Detected platform/architecture hints |

## Field Categories


### Repository Identity

- **`repository_id`** (`string`): Unique repository identifier (GitHub URL)
- **`repository_owner`** (`string`): GitHub organization or user name
- **`repository_name`** (`string`): Repository name without owner
- **`repository_name_with_owner`** (`string`): Full repository path (owner/name)
- **`repository_url`** (`string`): GitHub repository URL
- **`repository_description`** (`string`): Repository description text

### Security Artifacts & Tools

- **`repo_has_sbom_artifact`** (`boolean`): Repository contains SBOM (Software Bill of Materials) files
- **`repo_has_signature_artifact`** (`boolean`): Repository contains cryptographic signature files
- **`repo_has_attestation_artifact`** (`boolean`): Repository contains attestation files
- **`repo_security_tools_json`** (`string`): JSON array of detected security tools across the repository
- **`repo_security_tools_count`** (`number`): Total count of unique security tool types

### CI/CD Workflows

- **`workflow_count`** (`number`): Total number of CI/CD workflow files
- **`workflow_names_json`** (`string`): JSON array of workflow file names
- **`workflow_security_tools_json`** (`string`): JSON array of security tools found in each workflow

### Release Information

- **`release_index`** (`number`): Zero-based index of this release (0 = latest)
- **`release_tag_name`** (`string`): Git tag name for this release
- **`release_name`** (`string`): Display name of the release
- **`release_created_at`** (`string`): ISO timestamp of release creation
- **`release_artifact_count`** (`number`): Total number of artifacts in this release
- **`release_has_container_images`** (`boolean`): Release contains container images
- **`release_has_slsa_provenance`** (`boolean`): Release contains SLSA provenance documents
- **`release_has_in_toto_attestation`** (`boolean`): Release contains in-toto attestations
- **`release_sbom_formats_json`** (`string`): JSON array of SBOM formats found in release

### Artifact Details

- **`artifact_index`** (`string | null`): Zero-based index of this artifact within the release
- **`artifact_name`** (`string`): Filename of the artifact
- **`artifact_download_url`** (`string`): Direct download URL for the artifact
- **`artifact_size_hint`** (`string`): Estimated size of the artifact
- **`artifact_file_extension`** (`string`): File extension extracted from artifact name
- **`artifact_is_sbom`** (`boolean`): This artifact is an SBOM file
- **`artifact_is_signature`** (`boolean`): This artifact is a cryptographic signature
- **`artifact_is_attestation`** (`boolean`): This artifact is an attestation document
- **`artifact_sbom_format`** (`string`): Specific SBOM format if this is an SBOM file
- **`artifact_is_vex`** (`boolean`): This artifact is a VEX (Vulnerability Exchange) document
- **`artifact_is_slsa_provenance`** (`boolean`): This artifact contains SLSA provenance information
- **`artifact_is_in_toto_link`** (`boolean`): This artifact is an in-toto link metadata file
- **`artifact_is_container_attestation`** (`boolean`): This artifact is a container attestation
- **`artifact_type`** (`string`): Classified type of artifact (signature, sbom, etc.)
- **`artifact_platform_hint`** (`string`): Detected platform/architecture hints


## Usage Examples

### Loading in Python (Pandas)

```python
import pandas as pd

# Load CSV data
df = pd.read_csv('output/analysis.csv')

# Load Parquet data (more efficient)
df = pd.read_parquet('output/analysis.parquet')

# Display schema info
print(df.info())
print(f"Total rows: {len(df)}")
print(f"Total repositories: {df['repository_name'].nunique()}")
```

### Loading in R

```r
library(arrow)
library(dplyr)

# Load Parquet data
df <- read_parquet("output/analysis.parquet")

# Display schema
glimpse(df)

# Summary statistics
df %>% 
  group_by(repository_name) %>% 
  summarise(
    total_artifacts = n(),
    has_sbom = any(artifact_is_sbom),
    has_signatures = any(artifact_is_signature)
  )
```

### Loading in JavaScript/Node.js

```javascript
// Load JSON data
const data = require('./output/analysis.json');

// Load using Apache Arrow (for Parquet)
const { tableFromIPC } = require('apache-arrow');
const fs = require('fs');

// Process data
const repositories = [...new Set(data.map(row => row.repository_name))];
console.log(`Found ${repositories.length} repositories`);
```

## Data Quality Notes

- All timestamps are in ISO 8601 format
- JSON array fields are stored as JSON-encoded strings in CSV format
- Boolean fields use `true`/`false` values
- Missing values are represented as `null`
- Platform hints are comma-separated values (e.g., "linux,amd64")

## Schema Evolution

This schema follows semantic versioning principles:
- **Major version**: Breaking changes to field names or types
- **Minor version**: New fields added
- **Patch version**: Documentation updates or bug fixes

Current version: 1.0.0
