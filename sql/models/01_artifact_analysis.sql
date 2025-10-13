-- ============================================================================
-- Artifact Analysis Model
-- ============================================================================
-- Analyzes release assets to detect supply chain security artifact patterns:
-- - SBOM formats (SPDX, CycloneDX)
-- - Signatures (.sig, .asc, .pem)
-- - Attestations, VEX documents, SLSA provenance
-- - In-toto links, container attestations
-- 
-- Depends on: base_release_assets, base_releases tables
-- Creates: agg_artifact_patterns table
-- ============================================================================

CREATE OR REPLACE TABLE agg_artifact_patterns AS
SELECT 
    ra.id as asset_id,
    ra.release_id,
    rel.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    ra.name as asset_name,
    ra.downloadUrl as download_url,
    
    -- ========================================
    -- SBOM Detection (FTS-based)
    -- ========================================
    (fts_main_base_release_assets.match_bm25(ra.id, 'sbom OR spdx OR cyclonedx') IS NOT NULL) as is_sbom,
    
    CASE 
        WHEN fts_main_base_release_assets.match_bm25(ra.id, 'spdx') IS NOT NULL THEN 'spdx'
        WHEN fts_main_base_release_assets.match_bm25(ra.id, 'cyclonedx OR cdx') IS NOT NULL THEN 'cyclonedx'
        WHEN fts_main_base_release_assets.match_bm25(ra.id, 'sbom') IS NOT NULL THEN 'unknown'
        ELSE NULL
    END as sbom_format,
    
    -- ========================================
    -- Signature & Attestation Detection (FTS + Regex for extensions)
    -- ========================================
    REGEXP_MATCHES(ra.name, '(?i)\.(sig|asc|pem|pub)$') as is_signature,
    (fts_main_base_release_assets.match_bm25(ra.id, 'attestation') IS NOT NULL) as is_attestation,
    
    -- ========================================
    -- Advanced Supply Chain Artifacts (FTS-based)
    -- ========================================
    (fts_main_base_release_assets.match_bm25(ra.id, 'vex') IS NOT NULL) as is_vex,
    (fts_main_base_release_assets.match_bm25(ra.id, 'provenance OR slsa OR intoto') IS NOT NULL) as is_slsa_provenance,
    (fts_main_base_release_assets.match_bm25(ra.id, 'link') IS NOT NULL) as is_in_toto_link,
    (fts_main_base_release_assets.match_bm25(ra.id, 'layout') IS NOT NULL) as is_in_toto_layout,
    REGEXP_MATCHES(ra.name, '(?i)\.bundle$') as is_sigstore_bundle,
    (fts_main_base_release_assets.match_bm25(ra.id, 'swid OR swidtag') IS NOT NULL) as is_swid_tag,
    (fts_main_base_release_assets.match_bm25(ra.id, 'cosign OR rekor OR fulcio') IS NOT NULL) as is_container_attestation,
    (fts_main_base_release_assets.match_bm25(ra.id, 'license OR copying OR notice') IS NOT NULL) as is_license_file

FROM base_release_assets ra
JOIN base_releases rel ON ra.release_id = rel.id
JOIN base_repositories repo ON rel.repository_id = repo.id;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_artifact_repository ON agg_artifact_patterns(repository_id);
CREATE INDEX IF NOT EXISTS idx_artifact_is_sbom ON agg_artifact_patterns(is_sbom);
CREATE INDEX IF NOT EXISTS idx_artifact_is_signature ON agg_artifact_patterns(is_signature);

-- Validation: Show summary stats
SELECT 
    '✓ Created agg_artifact_patterns' as status,
    COUNT(*) as total_assets,
    SUM(CASE WHEN is_sbom THEN 1 ELSE 0 END) as sbom_count,
    SUM(CASE WHEN is_signature THEN 1 ELSE 0 END) as signature_count,
    SUM(CASE WHEN is_attestation THEN 1 ELSE 0 END) as attestation_count,
    SUM(CASE WHEN is_vex THEN 1 ELSE 0 END) as vex_count,
    SUM(CASE WHEN is_slsa_provenance THEN 1 ELSE 0 END) as slsa_count,
    SUM(CASE WHEN is_in_toto_link THEN 1 ELSE 0 END) as intoto_link_count,
    SUM(CASE WHEN is_in_toto_layout THEN 1 ELSE 0 END) as intoto_layout_count,
    SUM(CASE WHEN is_sigstore_bundle THEN 1 ELSE 0 END) as sigstore_bundle_count,
    SUM(CASE WHEN is_swid_tag THEN 1 ELSE 0 END) as swid_tag_count,
    SUM(CASE WHEN is_container_attestation THEN 1 ELSE 0 END) as container_attestation_count,
    SUM(CASE WHEN is_license_file THEN 1 ELSE 0 END) as license_file_count
FROM agg_artifact_patterns;
