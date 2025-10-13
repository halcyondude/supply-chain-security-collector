-- ============================================================================
-- Repository Security Overview
-- ============================================================================
-- Quick dashboard-style summary of security metrics across all repositories
-- ============================================================================

SELECT 'Total Repositories' as metric, 
    COUNT(*)::VARCHAR as value 
FROM agg_repo_summary

UNION ALL

SELECT 'Repositories with SBOMs',
    COUNT(*)::VARCHAR
FROM agg_repo_summary
WHERE has_sbom_artifact

UNION ALL

SELECT 'Repositories with Signatures',
    COUNT(*)::VARCHAR
FROM agg_repo_summary
WHERE has_signature_artifact

UNION ALL

SELECT 'Repositories using Cosign',
    COUNT(*)::VARCHAR
FROM agg_repo_summary
WHERE uses_cosign

UNION ALL

SELECT 'Repositories using Syft',
    COUNT(*)::VARCHAR
FROM agg_repo_summary
WHERE uses_syft

UNION ALL

SELECT 'Average Security Maturity Score',
    ROUND(AVG(security_maturity_score), 2)::VARCHAR || '/10'
FROM agg_repo_summary;
