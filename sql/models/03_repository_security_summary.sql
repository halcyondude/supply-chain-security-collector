-- ============================================================================
-- Repository Security Summary Model
-- ============================================================================
-- Aggregates security signals at the repository level for high-level analysis:
-- - SBOM adoption and formats
-- - Signing and attestation practices
-- - CI/CD tool usage
-- - Security maturity metrics
-- 
-- Depends on: base_repositories, base_releases, agg_artifact_patterns, agg_workflow_tools
-- Creates: agg_repo_summary table
-- ============================================================================

CREATE OR REPLACE TABLE agg_repo_summary AS
WITH artifact_stats AS (
    SELECT 
        repository_id,
        COUNT(*) as total_assets,
        
        -- SBOM Formats
        BOOL_OR(sbom_format = 'spdx') as has_spdx_sbom,
        BOOL_OR(sbom_format = 'cyclonedx') as has_cyclonedx_sbom,
        BOOL_OR(sbom_format = 'unknown') as has_unknown_sbom_format,
        
        -- Artifact Types
        BOOL_OR(is_sbom) as has_sbom_artifact,
        BOOL_OR(is_signature) as has_signature_artifact,
        BOOL_OR(is_attestation) as has_attestation_artifact,
        BOOL_OR(is_vex) as has_vex_document,
        BOOL_OR(is_slsa_provenance) as has_slsa_provenance,
        BOOL_OR(is_in_toto_link) as has_in_toto_attestation,
        BOOL_OR(is_container_attestation) as has_container_attestation,
        BOOL_OR(is_license_file) as has_license_file,
        
        -- Counts by type
        SUM(CASE WHEN is_sbom THEN 1 ELSE 0 END) as sbom_artifact_count,
        SUM(CASE WHEN is_signature THEN 1 ELSE 0 END) as signature_artifact_count
    FROM agg_artifact_patterns
    GROUP BY repository_id
),
workflow_stats AS (
    SELECT
        repository_id,
        
        -- CI Tool Categories
        BOOL_OR(tool_category = 'sbom-generator') as uses_sbom_generator,
        BOOL_OR(tool_category = 'signer') as uses_signer,
        BOOL_OR(tool_category = 'goreleaser') as uses_goreleaser,
        BOOL_OR(tool_category = 'vulnerability-scanner') as uses_vulnerability_scanner,
        BOOL_OR(tool_category = 'dependency-scanner') as uses_dependency_scanner,
        BOOL_OR(tool_category = 'code-scanner') as uses_code_scanner,
        BOOL_OR(tool_category = 'container-scanner') as uses_container_scanner,
        
        -- Specific Tools
        BOOL_OR(tool_name = 'syft') as uses_syft,
        BOOL_OR(tool_name = 'trivy') as uses_trivy,
        BOOL_OR(tool_name = 'cdxgen') as uses_cdxgen,
        BOOL_OR(tool_name = 'cosign') as uses_cosign,
        BOOL_OR(tool_name = 'sigstore') as uses_sigstore,
        BOOL_OR(tool_name = 'slsa-github-generator') as uses_slsa_github_generator,
        BOOL_OR(tool_name = 'snyk') as uses_snyk,
        BOOL_OR(tool_name = 'dependabot') as uses_dependabot,
        BOOL_OR(tool_name = 'renovate') as uses_renovate,
        BOOL_OR(tool_name = 'codeql') as uses_codeql,
        BOOL_OR(tool_name = 'grype') as uses_grype,
        
        -- Counts
        COUNT(DISTINCT workflow_id) FILTER (WHERE tool_category = 'sbom-generator') as sbom_generator_count,
        COUNT(DISTINCT workflow_id) FILTER (WHERE tool_category = 'signer') as signer_count,
        COUNT(DISTINCT workflow_id) FILTER (WHERE tool_category IN ('vulnerability-scanner', 'dependency-scanner', 'code-scanner', 'container-scanner')) as scanner_count
    FROM agg_workflow_tools
    GROUP BY repository_id
),
release_stats AS (
    SELECT
        rel.repository_id,
        COUNT(DISTINCT rel.id) as total_releases,
        COUNT(DISTINCT CASE WHEN aa.is_sbom THEN rel.id END) as releases_with_sbom_count,
        COUNT(DISTINCT CASE WHEN aa.is_signature THEN rel.id END) as releases_with_signatures_count,
        MIN(CASE WHEN aa.is_sbom THEN rel.tagName END) as first_release_with_sbom,
        MIN(CASE WHEN aa.is_sbom THEN rel.createdAt END) as first_sbom_date
    FROM base_releases rel
    LEFT JOIN base_release_assets ra ON rel.id = ra.release_id
    LEFT JOIN agg_artifact_patterns aa ON ra.id = aa.asset_id
    GROUP BY rel.repository_id
)
SELECT 
    r.id as repository_id,
    -- Repository identification
    SPLIT_PART(r.nameWithOwner, '/', 1) as owner,
    r.name as repo,
    r.nameWithOwner as nameWithOwner,
    r.description,
    r.url,
    
    -- ========================================
    -- Counts
    -- ========================================
    COALESCE(rs.total_releases, 0) as total_releases,
    COALESCE(ast.total_assets, 0) as total_assets,
    (SELECT COUNT(*) FROM base_workflows WHERE repository_id = r.id) as total_workflows,
    
    -- ========================================
    -- SBOM Detection
    -- ========================================
    COALESCE(ast.has_spdx_sbom, false) as has_spdx_sbom,
    COALESCE(ast.has_cyclonedx_sbom, false) as has_cyclonedx_sbom,
    COALESCE(ast.has_unknown_sbom_format, false) as has_unknown_sbom_format,
    COALESCE(ast.has_sbom_artifact, false) as has_sbom_artifact,
    COALESCE(ast.sbom_artifact_count, 0) as sbom_artifact_count,
    
    -- ========================================
    -- Artifact Types
    -- ========================================
    COALESCE(ast.has_signature_artifact, false) as has_signature_artifact,
    COALESCE(ast.has_attestation_artifact, false) as has_attestation_artifact,
    COALESCE(ast.has_vex_document, false) as has_vex_document,
    COALESCE(ast.has_slsa_provenance, false) as has_slsa_provenance,
    COALESCE(ast.has_in_toto_attestation, false) as has_in_toto_attestation,
    COALESCE(ast.has_container_attestation, false) as has_container_attestation,
    COALESCE(ast.has_license_file, false) as has_license_file,
    COALESCE(ast.signature_artifact_count, 0) as signature_artifact_count,
    
    -- ========================================
    -- CI Tool Categories
    -- ========================================
    COALESCE(ws.uses_sbom_generator, false) as uses_sbom_generator,
    COALESCE(ws.uses_signer, false) as uses_signer,
    COALESCE(ws.uses_goreleaser, false) as uses_goreleaser,
    COALESCE(ws.uses_vulnerability_scanner, false) as uses_vulnerability_scanner,
    COALESCE(ws.uses_dependency_scanner, false) as uses_dependency_scanner,
    COALESCE(ws.uses_code_scanner, false) as uses_code_scanner,
    COALESCE(ws.uses_container_scanner, false) as uses_container_scanner,
    
    -- ========================================
    -- Specific Tools
    -- ========================================
    COALESCE(ws.uses_syft, false) as uses_syft,
    COALESCE(ws.uses_trivy, false) as uses_trivy,
    COALESCE(ws.uses_cdxgen, false) as uses_cdxgen,
    COALESCE(ws.uses_cosign, false) as uses_cosign,
    COALESCE(ws.uses_sigstore, false) as uses_sigstore,
    COALESCE(ws.uses_slsa_github_generator, false) as uses_slsa_github_generator,
    COALESCE(ws.uses_snyk, false) as uses_snyk,
    COALESCE(ws.uses_dependabot, false) as uses_dependabot,
    COALESCE(ws.uses_renovate, false) as uses_renovate,
    COALESCE(ws.uses_codeql, false) as uses_codeql,
    COALESCE(ws.uses_grype, false) as uses_grype,
    
    -- ========================================
    -- Tool Counts
    -- ========================================
    COALESCE(ws.sbom_generator_count, 0) as sbom_generator_count,
    COALESCE(ws.signer_count, 0) as signer_count,
    COALESCE(ws.scanner_count, 0) as scanner_count,
    
    -- ========================================
    -- Adoption Metrics
    -- ========================================
    COALESCE(rs.releases_with_sbom_count, 0) as releases_with_sbom_count,
    COALESCE(rs.releases_with_signatures_count, 0) as releases_with_signatures_count,
    CASE 
        WHEN COALESCE(rs.total_releases, 0) > 0 
        THEN CAST(COALESCE(rs.releases_with_sbom_count, 0) AS DECIMAL) / rs.total_releases 
        ELSE 0 
    END as sbom_adoption_rate,
    rs.first_release_with_sbom,
    rs.first_sbom_date,
    
    -- ========================================
    -- Security Maturity Score (0-10)
    -- ========================================
    (
        (CASE WHEN COALESCE(ast.has_sbom_artifact, false) THEN 2 ELSE 0 END) +
        (CASE WHEN COALESCE(ast.has_signature_artifact, false) THEN 2 ELSE 0 END) +
        (CASE WHEN COALESCE(ast.has_attestation_artifact, false) THEN 2 ELSE 0 END) +
        (CASE WHEN COALESCE(ast.has_slsa_provenance, false) THEN 2 ELSE 0 END) +
        (CASE WHEN COALESCE(ws.uses_vulnerability_scanner, false) THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(ws.uses_code_scanner, false) THEN 1 ELSE 0 END)
    ) as security_maturity_score

FROM base_repositories r
LEFT JOIN artifact_stats ast ON r.id = ast.repository_id
LEFT JOIN workflow_stats ws ON r.id = ws.repository_id
LEFT JOIN release_stats rs ON r.id = rs.repository_id;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_summary_repository ON agg_repo_summary(repository_id);
CREATE INDEX IF NOT EXISTS idx_summary_owner ON agg_repo_summary(owner);
CREATE INDEX IF NOT EXISTS idx_summary_has_sbom ON agg_repo_summary(has_sbom_artifact);
CREATE INDEX IF NOT EXISTS idx_summary_uses_cosign ON agg_repo_summary(uses_cosign);
CREATE INDEX IF NOT EXISTS idx_summary_maturity_score ON agg_repo_summary(security_maturity_score);

-- Validation: Show summary stats
SELECT 
    '✓ Created agg_repo_summary' as status,
    COUNT(*) as total_repositories,
    SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
    SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) as repos_using_cosign,
    SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) as repos_using_syft,
    ROUND(AVG(security_maturity_score), 2) as avg_maturity_score
FROM agg_repo_summary;
