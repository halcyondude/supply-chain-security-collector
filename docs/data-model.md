# Data Model: Relational Schema

## Overview

The data model consists of three table layers:

1. **Raw Tables** (`raw_*`) — Full GraphQL API responses loaded via `read_json()` for auditability
2. **Base Tables** (`base_*`) — Normalized relational data from GraphQL responses
3. **Aggregated Tables** (`agg_*`) — Business insights from SQL models in `sql/models/`

All tables reside in a single DuckDB database per query type. Tables are exported to Parquet files in a flat directory alongside the database.

## Data Loading

Normalized arrays are written to temporary JSON files, loaded into DuckDB via `read_json()`, then the temp files are deleted.

**Pattern (from `ArtifactWriter.ts`):**
```typescript
fs.writeFileSync(tempPath, JSON.stringify(data));
await con.run(`
    CREATE TABLE ${tableName} AS
    SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true, union_by_name=true)
`);
fs.unlinkSync(tempPath);
```

## Output Directory Structure

```text
output/<run-name>-<timestamp>/
  database.db
  raw-responses.jsonl
  raw_GetRepoDataExtendedInfo.parquet
  base_repositories.parquet
  base_releases.parquet
  base_release_assets.parquet
  base_workflows.parquet
  base_branch_protection_rules.parquet
  base_security_md.parquet
  base_si_documents.parquet
  base_si_sboms.parquet
  base_cncf_projects.parquet
  base_cncf_project_repos.parquet
  agg_artifact_patterns.parquet
  agg_workflow_tools.parquet
  agg_repo_summary.parquet
  agg_executive_summary.parquet
  agg_tool_summary.parquet
  agg_repo_summary_sorted.parquet
  agg_sbom_summary.parquet
  agg_advanced_artifacts.parquet
  agg_tool_category_summary.parquet
  agg_repo_detail.parquet
  agg_si_attestations.parquet
  agg_cncf_project_summary.parquet
```

## Raw Tables

### raw_GetRepoDataExtendedInfo

Full GraphQL API responses preserved as-is. Loaded from the temp JSON file via `read_json()` with `maximum_depth=-1` to keep nested structure intact.

**Source:** `ArtifactWriter.ts` — `createRawTable()`

## Base Tables (Collection Layer)

Produced by query-specific TypeScript normalizers in `src/normalizers/`.

### base_repositories

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `Repository` interface

| Column | Type |
|--------|------|
| id | TEXT (PK) |
| __typename | TEXT |
| name | TEXT |
| nameWithOwner | TEXT |
| url | TEXT |
| description | TEXT (nullable) |
| hasVulnerabilityAlertsEnabled | BOOLEAN |
| license_key | TEXT (nullable) |
| license_name | TEXT (nullable) |
| license_spdxId | TEXT (nullable) |
| defaultBranch_name | TEXT (nullable) |

### base_releases

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `Release` interface

| Column | Type |
|--------|------|
| id | TEXT (PK) |
| __typename | TEXT |
| repository_id | TEXT (FK -> base_repositories) |
| name | TEXT (nullable) |
| tagName | TEXT |
| url | TEXT |
| createdAt | TEXT |

### base_release_assets

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `ReleaseAsset` interface

| Column | Type |
|--------|------|
| id | TEXT (PK) |
| __typename | TEXT |
| release_id | TEXT (FK -> base_releases) |
| name | TEXT |
| downloadUrl | TEXT |

### base_workflows

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `Workflow` interface

| Column | Type |
|--------|------|
| id | TEXT (PK, generated: `{repository_id}_{filename}`) |
| __typename | TEXT |
| repository_id | TEXT (FK -> base_repositories) |
| filename | TEXT |
| content | TEXT (nullable) |

### base_branch_protection_rules

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `BranchProtectionRule` interface

| Column | Type |
|--------|------|
| id | TEXT (PK, generated: `{repository_id}_default` or `{repository_id}_rule_{idx}`) |
| __typename | TEXT |
| repository_id | TEXT (FK -> base_repositories) |
| allowsDeletions | BOOLEAN |
| allowsForcePushes | BOOLEAN |
| dismissesStaleReviews | BOOLEAN |
| isAdminEnforced | BOOLEAN |
| requiresStatusChecks | BOOLEAN |
| requiresStrictStatusChecks | BOOLEAN |
| requiresCodeOwnerReviews | BOOLEAN |
| requiredApprovingReviewCount | INTEGER (nullable) |
| pattern | TEXT |
| isDefaultBranch | BOOLEAN |

### base_security_md

**Source:** `GetRepoDataExtendedInfoNormalizer.ts` — `SecurityMarkdown` interface

| Column | Type |
|--------|------|
| id | TEXT (PK, generated: `{repository_id}_{path}`) |
| __typename | TEXT |
| repository_id | TEXT (FK -> base_repositories) |
| content | TEXT (nullable) |
| path | TEXT |

### base_si_documents

**Source:** `ArtifactWriter.ts` — inline schema, populated from `security-insights.yml` files

| Column | Type |
|--------|------|
| repo_id | TEXT (PK composite) |
| source_url | TEXT (PK composite) |
| schema_version | TEXT |
| document | JSON |
| fetched_at | TIMESTAMP |

### base_si_sboms

**Source:** `sql/models/01a_security_insights_flattener.sql` — flattened from `base_si_documents`

| Column | Type |
|--------|------|
| repo_id | TEXT |
| source_url | TEXT |
| fetched_at | TIMESTAMP |
| schema_version | TEXT |
| last_updated | DATE |
| repository_url | TEXT |
| project_name | TEXT |
| sbom_format | TEXT |
| sbom_url | TEXT |
| sbom_file | TEXT |
| sbom_comment | TEXT |

### base_cncf_projects

**Source:** `ArtifactWriter.ts` — `createCNCFTables()`, only present with rich-format input

| Column | Type |
|--------|------|
| project_name | TEXT (PK) |
| display_name | TEXT |
| description | TEXT |
| maturity | TEXT |
| category | TEXT |
| subcategory | TEXT |
| date_accepted | TEXT |
| date_incubating | TEXT |
| date_graduated | TEXT |
| date_archived | TEXT |
| homepage_url | TEXT |
| repo_url | TEXT |
| package_manager_url | TEXT |
| docker_url | TEXT |
| documentation_url | TEXT |
| blog_url | TEXT |
| url_for_bestpractices | TEXT |
| clomonitor_name | TEXT |
| summary_business_use_case | TEXT |
| summary_integrations | TEXT |
| summary_personas | TEXT |
| summary_tags | TEXT |
| summary_use_case | TEXT |
| summary_release_rate | TEXT |
| dev_stats_url | TEXT |
| has_security_audits | BOOLEAN |
| security_audit_count | INTEGER |
| latest_audit_date | TEXT |
| latest_audit_vendor | TEXT |
| crunchbase | TEXT |
| twitter | TEXT |
| parent_project | TEXT |
| tag_associations | TEXT |
| annual_review_date | TEXT |
| annual_review_url | TEXT |
| license | TEXT |
| default_branch | TEXT |

### base_cncf_project_repos

**Source:** `ArtifactWriter.ts` — `createCNCFTables()`, junction table linking projects to repos

| Column | Type |
|--------|------|
| project_name | TEXT (FK -> base_cncf_projects) |
| owner | TEXT |
| name | TEXT |
| primary | BOOLEAN |
| branch | TEXT |

## Aggregated Tables (Analysis Layer)

Produced by SQL models in `sql/models/` executed in numbered order by `SecurityAnalyzer.ts`.

### agg_artifact_patterns

**Source:** `sql/models/01_artifact_analysis.sql`

Classifies release assets by supply chain artifact type using FTS and regex.

| Column | Type |
|--------|------|
| asset_id | TEXT |
| release_id | TEXT |
| repository_id | TEXT |
| owner | TEXT |
| repo | TEXT |
| nameWithOwner | TEXT |
| asset_name | TEXT |
| download_url | TEXT |
| is_sbom | BOOLEAN |
| sbom_format | TEXT (spdx, cyclonedx, unknown, NULL) |
| is_signature | BOOLEAN |
| is_attestation | BOOLEAN |
| is_vex | BOOLEAN |
| is_slsa_provenance | BOOLEAN |
| is_in_toto_link | BOOLEAN |
| is_in_toto_layout | BOOLEAN |
| is_sigstore_bundle | BOOLEAN |
| is_swid_tag | BOOLEAN |
| is_container_attestation | BOOLEAN |
| is_license_file | BOOLEAN |

### agg_workflow_tools

**Source:** `sql/models/02_workflow_tool_detection.sql`

Detects CI/CD security tools in GitHub Actions workflows using FTS (`match_bm25()`).

| Column | Type |
|--------|------|
| workflow_id | TEXT |
| repository_id | TEXT |
| owner | TEXT |
| repo | TEXT |
| nameWithOwner | TEXT |
| workflow_name | TEXT |
| tool_category | TEXT (sbom-generator, signer, goreleaser, vulnerability-scanner, dependency-scanner, code-scanner, container-scanner) |
| tool_name | TEXT |

### agg_repo_summary

**Source:** `sql/models/03_repository_security_summary.sql`

Repository-level rollup of all security signals.

| Column | Type |
|--------|------|
| repository_id | TEXT |
| owner | TEXT |
| repo | TEXT |
| nameWithOwner | TEXT |
| description | TEXT |
| url | TEXT |
| total_releases | INTEGER |
| total_assets | INTEGER |
| total_workflows | INTEGER |
| has_spdx_sbom | BOOLEAN |
| has_cyclonedx_sbom | BOOLEAN |
| has_unknown_sbom_format | BOOLEAN |
| has_sbom_artifact | BOOLEAN |
| sbom_artifact_count | INTEGER |
| has_signature_artifact | BOOLEAN |
| has_attestation_artifact | BOOLEAN |
| has_vex_document | BOOLEAN |
| has_slsa_provenance | BOOLEAN |
| has_in_toto_attestation | BOOLEAN |
| has_container_attestation | BOOLEAN |
| has_license_file | BOOLEAN |
| signature_artifact_count | INTEGER |
| uses_sbom_generator | BOOLEAN |
| uses_signer | BOOLEAN |
| uses_goreleaser | BOOLEAN |
| uses_vulnerability_scanner | BOOLEAN |
| uses_dependency_scanner | BOOLEAN |
| uses_code_scanner | BOOLEAN |
| uses_container_scanner | BOOLEAN |
| uses_syft | BOOLEAN |
| uses_trivy | BOOLEAN |
| uses_cdxgen | BOOLEAN |
| uses_cosign | BOOLEAN |
| uses_sigstore | BOOLEAN |
| uses_slsa_github_generator | BOOLEAN |
| uses_snyk | BOOLEAN |
| uses_dependabot | BOOLEAN |
| uses_renovate | BOOLEAN |
| uses_codeql | BOOLEAN |
| uses_grype | BOOLEAN |
| sbom_generator_count | INTEGER |
| signer_count | INTEGER |
| scanner_count | INTEGER |
| releases_with_sbom_count | INTEGER |
| releases_with_signatures_count | INTEGER |
| sbom_adoption_rate | DECIMAL |
| first_release_with_sbom | TEXT |
| first_sbom_date | TEXT |

### agg_executive_summary

**Source:** `sql/models/04_summary_views.sql`

Single-row table with overall statistics.

| Column | Type |
|--------|------|
| total_repos | INTEGER |
| repos_with_sbom | INTEGER |
| repos_with_signatures | INTEGER |
| repos_with_attestations | INTEGER |
| sbom_percentage | DECIMAL |
| signature_percentage | DECIMAL |
| attestation_percentage | DECIMAL |
| total_releases | INTEGER |
| total_assets | INTEGER |
| total_workflows | INTEGER |
| repos_using_sbom_generators | INTEGER |
| repos_using_signers | INTEGER |
| repos_using_vuln_scanners | INTEGER |
| repos_using_dep_scanners | INTEGER |
| repos_using_code_scanners | INTEGER |
| repos_using_container_scanners | INTEGER |

### agg_tool_summary

**Source:** `sql/models/04_summary_views.sql`

One row per detected tool with adoption statistics.

| Column | Type |
|--------|------|
| tool_name | TEXT |
| tool_category | TEXT |
| repo_count | INTEGER |
| workflow_count | INTEGER |
| adoption_percentage | DECIMAL |

### agg_repo_summary_sorted

**Source:** `sql/models/04_summary_views.sql`

Pre-sorted repository list for reports.

| Column | Type |
|--------|------|
| nameWithOwner | TEXT |
| total_releases | INTEGER |
| has_sbom_artifact | BOOLEAN |
| has_signature_artifact | BOOLEAN |
| has_attestation_artifact | BOOLEAN |
| uses_sbom_generator | BOOLEAN |
| uses_signer | BOOLEAN |
| uses_code_scanner | BOOLEAN |

### agg_sbom_summary

**Source:** `sql/models/04_summary_views.sql`

SBOM format and adoption statistics (repos with SBOMs only).

| Column | Type |
|--------|------|
| total_repos | INTEGER |
| spdx_count | INTEGER |
| cyclonedx_count | INTEGER |
| unknown_count | INTEGER |
| partial_adoption | INTEGER |
| full_adoption | INTEGER |

### agg_advanced_artifacts

**Source:** `sql/models/04_summary_views.sql`

Advanced supply chain artifact detection counts.

| Column | Type |
|--------|------|
| repos_with_advanced_artifacts | INTEGER |
| vex_count | INTEGER |
| slsa_count | INTEGER |
| intoto_link_count | INTEGER |
| intoto_layout_count | INTEGER |
| sigstore_bundle_count | INTEGER |
| swid_tag_count | INTEGER |
| container_attestation_count | INTEGER |
| license_file_count | INTEGER |
| generic_attestation_count | INTEGER |

### agg_tool_category_summary

**Source:** `sql/models/04_summary_views.sql`

Tools grouped by category with repo and workflow counts.

| Column | Type |
|--------|------|
| tool_category | TEXT |
| tool_name | TEXT |
| repo_count | INTEGER |
| workflow_count | INTEGER |

### agg_repo_detail

**Source:** `sql/models/04_summary_views.sql`

Pre-sorted repository details with all metrics.

| Column | Type |
|--------|------|
| nameWithOwner | TEXT |
| total_releases | INTEGER |
| total_assets | INTEGER |
| sbom_artifact_count | INTEGER |
| signature_artifact_count | INTEGER |
| uses_sbom_generator | BOOLEAN |
| uses_signer | BOOLEAN |
| uses_vulnerability_scanner | BOOLEAN |
| uses_code_scanner | BOOLEAN |

### agg_si_attestations

**Source:** `sql/models/01a_security_insights_flattener.sql`

Flattened attestations from Security Insights YAML documents. Extracts from multiple paths: `repository.release.attestations[]`, `repository.security.tools[].results.*`, top-level `attestations[]`, and `security-artifacts.attestations[]`.

| Column | Type |
|--------|------|
| repo_id | TEXT |
| source_url | TEXT |
| fetched_at | TIMESTAMP |
| schema_version | TEXT |
| last_updated | DATE |
| repository_url | TEXT |
| project_name | TEXT |
| attestation_source | TEXT (release, tool_adhoc, tool_ci, tool_release, top_level, security_artifacts) |
| attestation_name | TEXT |
| attestation_location | TEXT |
| attestation_predicate_uri | TEXT |
| attestation_comment | TEXT |

### agg_cncf_project_summary

**Source:** `sql/models/05_cncf_project_analysis.sql` — only present with rich-format input

| Column | Type |
|--------|------|
| project_name | TEXT |
| display_name | TEXT |
| description | TEXT |
| maturity | TEXT |
| category | TEXT |
| subcategory | TEXT |
| total_repos | INTEGER |
| primary_repos | INTEGER |
| total_releases | INTEGER |
| total_release_assets | INTEGER |
| total_workflows | INTEGER |
| repos_with_sbom | INTEGER |
| total_sbom_artifacts | INTEGER |
| repos_with_spdx | INTEGER |
| repos_with_cyclonedx | INTEGER |
| sbom_adoption_rate | DECIMAL |
| earliest_sbom_date | TEXT |
| earliest_release_with_sbom | TEXT |
| repos_with_signatures | INTEGER |
| repos_with_attestations | INTEGER |
| repos_with_slsa_provenance | INTEGER |
| repos_with_in_toto | INTEGER |
| repos_using_syft | INTEGER |
| repos_using_trivy | INTEGER |
| repos_using_cosign | INTEGER |
| repos_using_sigstore | INTEGER |
| repos_using_slsa_generator | INTEGER |
| repos_using_cdxgen | INTEGER |
| repos_using_grype | INTEGER |
| repos_using_goreleaser | INTEGER |
| repos_using_codeql | INTEGER |
| repos_using_snyk | INTEGER |
| repos_using_vuln_scanner | INTEGER |
| repos_using_container_scanner | INTEGER |
| repos_using_dependabot | INTEGER |
| repos_using_renovate | INTEGER |
| date_accepted | TEXT |
| date_incubating | TEXT |
| date_graduated | TEXT |
| has_security_audits | BOOLEAN |
| security_audit_count | INTEGER |
| latest_audit_date | TEXT |
| latest_audit_vendor | TEXT |
| homepage_url | TEXT |
| repo_url | TEXT |
| clomonitor_name | TEXT |
| dev_stats_url | TEXT |
| blog_url | TEXT |
| crunchbase | TEXT |
| twitter | TEXT |

## Schema Evolution

1. **Normalizers change**: Update the TypeScript normalizer to add/remove fields
2. **Base tables change**: DuckDB automatically infers schema from the JSON arrays
3. **SQL models change**: Update `sql/models/*.sql` to use new fields
4. **Parquet regenerated**: Next run produces new Parquet files with updated schema
