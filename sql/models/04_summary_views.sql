-- ============================================================================
-- Summary Tables Model
-- ============================================================================
-- Creates summary tables for reporting:
-- - Executive summary with overall statistics
-- - Tool adoption summary with per-tool metrics
-- - Repository summary (sorted for reports)
-- - SBOM analysis summary
-- - Advanced artifacts summary
-- - Tool category summary
-- 
-- These tables eliminate the need for complex SQL in application code.
-- Reports can simply SELECT * from these tables.
--
-- Depends on: agg_repo_summary, agg_workflow_tools, agg_artifact_patterns
-- Creates: agg_executive_summary, agg_tool_summary, agg_repo_summary_sorted,
--          agg_sbom_summary, agg_advanced_artifacts, agg_tool_category_summary
-- ============================================================================

-- ============================================================================
-- Executive Summary Table
-- ============================================================================
-- Single-row table with overall repository security statistics
-- ============================================================================
CREATE OR REPLACE TABLE agg_executive_summary AS
SELECT 
    COUNT(*) as total_repos,
    
    -- Artifact adoption
    SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
    SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) as repos_with_signatures,
    SUM(CASE WHEN has_attestation_artifact THEN 1 ELSE 0 END) as repos_with_attestations,
    
    -- Adoption percentages
    ROUND(100.0 * SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) / COUNT(*), 1) as sbom_percentage,
    ROUND(100.0 * SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) / COUNT(*), 1) as signature_percentage,
    ROUND(100.0 * SUM(CASE WHEN has_attestation_artifact THEN 1 ELSE 0 END) / COUNT(*), 1) as attestation_percentage,
    
    -- Release statistics
    SUM(total_releases) as total_releases,
    SUM(total_assets) as total_assets,
    SUM(total_workflows) as total_workflows,
    
    -- Tool category adoption (any tool in category)
    SUM(CASE WHEN uses_sbom_generator THEN 1 ELSE 0 END) as repos_using_sbom_generators,
    SUM(CASE WHEN uses_signer THEN 1 ELSE 0 END) as repos_using_signers,
    SUM(CASE WHEN uses_vulnerability_scanner THEN 1 ELSE 0 END) as repos_using_vuln_scanners,
    SUM(CASE WHEN uses_dependency_scanner THEN 1 ELSE 0 END) as repos_using_dep_scanners,
    SUM(CASE WHEN uses_code_scanner THEN 1 ELSE 0 END) as repos_using_code_scanners,
    SUM(CASE WHEN uses_container_scanner THEN 1 ELSE 0 END) as repos_using_container_scanners

FROM agg_repo_summary;


-- ============================================================================
-- Tool Adoption Summary Table
-- ============================================================================
-- One row per detected tool with adoption statistics
-- Derived from actual workflow detections, not aggregated boolean columns
-- ============================================================================
CREATE OR REPLACE TABLE agg_tool_summary AS
WITH tool_stats AS (
    SELECT 
        tool_name,
        tool_category,
        COUNT(DISTINCT repository_id) as repo_count,
        COUNT(DISTINCT workflow_id) as workflow_count
    FROM agg_workflow_tools
    GROUP BY tool_name, tool_category
),
total AS (
    SELECT COUNT(*) as total_repos FROM agg_repo_summary
)
SELECT 
    ts.tool_name,
    ts.tool_category,
    ts.repo_count,
    ts.workflow_count,
    ROUND(100.0 * ts.repo_count / t.total_repos, 1) as adoption_percentage
FROM tool_stats ts
CROSS JOIN total t
ORDER BY ts.repo_count DESC, ts.tool_name;


-- ============================================================================
-- Repository Summary Table (Sorted for Reports)
-- ============================================================================
-- Pre-sorted repository list with key security metrics
-- ============================================================================
CREATE OR REPLACE TABLE agg_repo_summary_sorted AS
SELECT 
    nameWithOwner, 
    total_releases,
    has_sbom_artifact, 
    has_signature_artifact,
    has_attestation_artifact,
    uses_sbom_generator,
    uses_signer,
    uses_code_scanner
FROM agg_repo_summary
ORDER BY 
    (CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END + 
     CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) DESC,
    nameWithOwner;


-- ============================================================================
-- SBOM Analysis Summary Table
-- ============================================================================
-- SBOM format and adoption statistics
-- ============================================================================
CREATE OR REPLACE TABLE agg_sbom_summary AS
SELECT 
    COUNT(*) as total_repos,
    SUM(CASE WHEN has_spdx_sbom THEN 1 ELSE 0 END) as spdx_count,
    SUM(CASE WHEN has_cyclonedx_sbom THEN 1 ELSE 0 END) as cyclonedx_count,
    SUM(CASE WHEN has_unknown_sbom_format THEN 1 ELSE 0 END) as unknown_count,
    SUM(CASE WHEN sbom_adoption_rate > 0 THEN 1 ELSE 0 END) as partial_adoption,
    SUM(CASE WHEN sbom_adoption_rate = 1.0 THEN 1 ELSE 0 END) as full_adoption
FROM agg_repo_summary 
WHERE has_sbom_artifact = true;


-- ============================================================================
-- Advanced Artifacts Summary Table
-- ============================================================================
-- Advanced artifact type detection summary
-- ============================================================================
CREATE OR REPLACE TABLE agg_advanced_artifacts AS
SELECT 
    COUNT(DISTINCT ap.repository_id) as repos_with_advanced_artifacts,
    SUM(CASE WHEN ap.is_vex THEN 1 ELSE 0 END) as vex_count,
    SUM(CASE WHEN ap.is_slsa_provenance THEN 1 ELSE 0 END) as slsa_count,
    SUM(CASE WHEN ap.is_in_toto_link THEN 1 ELSE 0 END) as intoto_link_count,
    SUM(CASE WHEN ap.is_in_toto_layout THEN 1 ELSE 0 END) as intoto_layout_count,
    SUM(CASE WHEN ap.is_sigstore_bundle THEN 1 ELSE 0 END) as sigstore_bundle_count,
    SUM(CASE WHEN ap.is_swid_tag THEN 1 ELSE 0 END) as swid_tag_count,
    SUM(CASE WHEN ap.is_container_attestation THEN 1 ELSE 0 END) as container_attestation_count,
    SUM(CASE WHEN ap.is_license_file THEN 1 ELSE 0 END) as license_file_count,
    SUM(CASE WHEN ap.is_attestation THEN 1 ELSE 0 END) as generic_attestation_count
FROM agg_artifact_patterns ap
WHERE ap.is_vex OR ap.is_slsa_provenance OR ap.is_in_toto_link OR ap.is_in_toto_layout 
   OR ap.is_sigstore_bundle OR ap.is_swid_tag OR ap.is_container_attestation 
   OR ap.is_license_file OR ap.is_attestation;


-- ============================================================================
-- Tool Category Summary Table
-- ============================================================================
-- Tools grouped by category for detailed reporting
-- ============================================================================
CREATE OR REPLACE TABLE agg_tool_category_summary AS
SELECT 
    tool_category,
    tool_name,
    COUNT(DISTINCT repository_id) as repo_count,
    COUNT(DISTINCT workflow_id) as workflow_count
FROM agg_workflow_tools
GROUP BY tool_category, tool_name
ORDER BY repo_count DESC, tool_name;


-- ============================================================================
-- Repository Detail Table (for detailed findings)
-- ============================================================================
-- Pre-sorted repository details with all metrics
-- ============================================================================
CREATE OR REPLACE TABLE agg_repo_detail AS
SELECT 
    nameWithOwner, 
    total_releases, 
    total_assets,
    sbom_artifact_count, 
    signature_artifact_count,
    uses_sbom_generator, 
    uses_signer, 
    uses_vulnerability_scanner, 
    uses_code_scanner
FROM agg_repo_summary 
ORDER BY 
    (CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END + 
     CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) DESC,
    nameWithOwner;


-- Validation: Show summary stats
SELECT 
    '✓ Created agg_executive_summary' as status,
    total_repos,
    repos_with_sbom,
    repos_with_signatures
FROM agg_executive_summary;

SELECT 
    '✓ Created agg_tool_summary' as status,
    COUNT(*) as unique_tools,
    SUM(repo_count) as total_tool_detections
FROM agg_tool_summary;

SELECT 
    '✓ Created agg_repo_summary_sorted' as status,
    COUNT(*) as total_repos
FROM agg_repo_summary_sorted;

SELECT 
    '✓ Created agg_sbom_summary' as status,
    COALESCE(total_repos, 0) as repos_with_sboms
FROM agg_sbom_summary
UNION ALL
SELECT 
    '✓ Created agg_sbom_summary (no SBOMs)' as status,
    0 as repos_with_sboms
WHERE NOT EXISTS (SELECT 1 FROM agg_sbom_summary);

SELECT 
    '✓ Created agg_advanced_artifacts' as status,
    COALESCE(repos_with_advanced_artifacts, 0) as repos
FROM agg_advanced_artifacts
UNION ALL
SELECT 
    '✓ Created agg_advanced_artifacts (none detected)' as status,
    0 as repos
WHERE NOT EXISTS (SELECT 1 FROM agg_advanced_artifacts);

SELECT 
    '✓ Created agg_tool_category_summary' as status,
    COUNT(*) as tool_detections
FROM agg_tool_category_summary;

SELECT 
    '✓ Created agg_repo_detail' as status,
    COUNT(*) as total_repos
FROM agg_repo_detail;

