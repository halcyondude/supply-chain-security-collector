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
    ra.name as asset_name,
    ra.downloadUrl as download_url,
    
    -- ========================================
    -- SBOM Detection
    -- ========================================
    REGEXP_MATCHES(ra.name, '(?i)\b(sbom|spdx|cyclonedx)\b') as is_sbom,
    
    CASE 
        WHEN REGEXP_MATCHES(ra.name, '(?i)\b(spdx|\.spdx)\b') THEN 'spdx'
        WHEN REGEXP_MATCHES(ra.name, '(?i)\b(cyclonedx|cdx|\.cdx)\b') THEN 'cyclonedx'
        WHEN REGEXP_MATCHES(ra.name, '(?i)\bsbom\b') THEN 'unknown'
        ELSE NULL
    END as sbom_format,
    
    -- ========================================
    -- Signature & Attestation Detection
    -- ========================================
    REGEXP_MATCHES(ra.name, '(?i)\.(sig|asc|pem|pub)$') as is_signature,
    REGEXP_MATCHES(ra.name, '(?i)attestation') as is_attestation,
    
    -- ========================================
    -- Advanced Supply Chain Artifacts
    -- ========================================
    REGEXP_MATCHES(ra.name, '(?i)\b(vex|\.vex)\b') as is_vex,
    REGEXP_MATCHES(ra.name, '(?i)\b(provenance|slsa|\.intoto\.jsonl)\b') as is_slsa_provenance,
    REGEXP_MATCHES(ra.name, '(?i)\b(link|\.link)\b') as is_in_toto_link,
    REGEXP_MATCHES(ra.name, '(?i)\b(cosign|rekor|fulcio)\b') as is_container_attestation,
    REGEXP_MATCHES(ra.name, '(?i)\b(license|copying|notice)\b') as is_license_file

FROM base_release_assets ra
JOIN base_releases rel ON ra.release_id = rel.id;

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
    SUM(CASE WHEN is_attestation THEN 1 ELSE 0 END) as attestation_count
FROM agg_artifact_patterns;
