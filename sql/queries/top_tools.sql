-- ============================================================================
-- Top Security Tools Usage
-- ============================================================================
-- Shows which security tools are most commonly used across repositories
-- ============================================================================

WITH tool_usage AS (
    SELECT 'Syft' as tool, SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) as repo_count FROM agg_repo_summary
    UNION ALL SELECT 'Trivy', SUM(CASE WHEN uses_trivy THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'Cosign', SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'CodeQL', SUM(CASE WHEN uses_codeql THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'Snyk', SUM(CASE WHEN uses_snyk THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'Dependabot', SUM(CASE WHEN uses_dependabot THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'GoReleaser', SUM(CASE WHEN uses_goreleaser THEN 1 ELSE 0 END) FROM agg_repo_summary
    UNION ALL SELECT 'Grype', SUM(CASE WHEN uses_grype THEN 1 ELSE 0 END) FROM agg_repo_summary
)
SELECT 
    tool,
    repo_count,
    ROUND(100.0 * repo_count / (SELECT COUNT(*) FROM agg_repo_summary), 1) as percentage
FROM tool_usage
WHERE repo_count > 0
ORDER BY repo_count DESC;
