-- ============================================================================
-- CNCF Project Security Analysis Queries
-- ============================================================================
-- A collection of analytical queries for CNCF project security practices
-- 
-- Requires: agg_cncf_project_summary table (created by 05_cncf_project_analysis.sql)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Query 1: Security Maturity by CNCF Maturity Level
-- ----------------------------------------------------------------------------
-- Shows how security tool adoption correlates with CNCF project maturity
-- (graduated vs. incubating vs. sandbox)
SELECT 
  maturity,
  COUNT(*) as project_count,
  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,
  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,
  COUNT(CASE WHEN repos_with_signatures > 0 THEN 1 END) as projects_with_signing,
  COUNT(CASE WHEN repos_with_slsa_provenance > 0 THEN 1 END) as projects_with_slsa,
  COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) as projects_using_codeql,
  COUNT(CASE WHEN has_security_audits THEN 1 END) as projects_with_audits,
  ROUND(AVG(security_maturity_score), 2) as avg_security_score
FROM agg_cncf_project_summary
GROUP BY maturity
ORDER BY 
  CASE maturity
    WHEN 'graduated' THEN 1
    WHEN 'incubating' THEN 2
    WHEN 'sandbox' THEN 3
    ELSE 4
  END;

-- ----------------------------------------------------------------------------
-- Query 2: Top Security Leaders (Highest Security Maturity Score)
-- ----------------------------------------------------------------------------
-- Projects with the most comprehensive security practices
SELECT 
  display_name,
  maturity,
  category,
  security_maturity_score,
  repos_with_sbom || '/' || total_repos as sbom_repos,
  repos_with_signatures || '/' || total_repos as signing_repos,
  CASE WHEN has_security_audits THEN '✓' ELSE '' END as audited,
  CASE WHEN url_for_bestpractices IS NOT NULL THEN '✓' ELSE '' END as openssf_badge,
  homepage_url
FROM agg_cncf_project_summary
WHERE security_maturity_score >= 5  -- High bar for security maturity
ORDER BY security_maturity_score DESC, maturity, display_name
LIMIT 20;

-- ----------------------------------------------------------------------------
-- Query 3: SBOM Format Adoption Trends
-- ----------------------------------------------------------------------------
-- Which SBOM formats are most popular across CNCF projects?
SELECT 
  'SPDX' as sbom_format,
  COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) as projects_using,
  SUM(repos_with_spdx) as total_repos_using,
  ROUND(COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pct
FROM agg_cncf_project_summary
UNION ALL
SELECT 
  'CycloneDX' as sbom_format,
  COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) as projects_using,
  SUM(repos_with_cyclonedx) as total_repos_using,
  ROUND(COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pct
FROM agg_cncf_project_summary
ORDER BY adoption_pct DESC;

-- ----------------------------------------------------------------------------
-- Query 4: Tool Popularity Across CNCF Projects
-- ----------------------------------------------------------------------------
-- Which supply chain security tools are most commonly used?
WITH tool_usage AS (
  SELECT 'Syft' as tool_name, 'SBOM Generator' as category, SUM(repos_using_syft) as repo_count, COUNT(CASE WHEN repos_using_syft > 0 THEN 1 END) as project_count FROM agg_cncf_project_summary
  UNION ALL SELECT 'Trivy', 'Vulnerability Scanner', SUM(repos_using_trivy), COUNT(CASE WHEN repos_using_trivy > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'Cosign', 'Signing Tool', SUM(repos_using_cosign), COUNT(CASE WHEN repos_using_cosign > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'CodeQL', 'Code Scanner', SUM(repos_using_codeql), COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'SLSA Generator', 'Provenance', SUM(repos_using_slsa_generator), COUNT(CASE WHEN repos_using_slsa_generator > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'Grype', 'Vulnerability Scanner', SUM(repos_using_grype), COUNT(CASE WHEN repos_using_grype > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'CDXGen', 'SBOM Generator', SUM(repos_using_cdxgen), COUNT(CASE WHEN repos_using_cdxgen > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'Snyk', 'Vulnerability Scanner', SUM(repos_using_snyk), COUNT(CASE WHEN repos_using_snyk > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'Dependabot', 'Dependency Updater', SUM(repos_using_dependabot), COUNT(CASE WHEN repos_using_dependabot > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'Renovate', 'Dependency Updater', SUM(repos_using_renovate), COUNT(CASE WHEN repos_using_renovate > 0 THEN 1 END) FROM agg_cncf_project_summary
  UNION ALL SELECT 'GoReleaser', 'Release Automation', SUM(repos_using_goreleaser), COUNT(CASE WHEN repos_using_goreleaser > 0 THEN 1 END) FROM agg_cncf_project_summary
)
SELECT 
  tool_name,
  category,
  project_count as projects_using,
  repo_count as repos_using,
  ROUND(project_count * 100.0 / (SELECT COUNT(*) FROM agg_cncf_project_summary), 1) as project_adoption_pct
FROM tool_usage
WHERE repo_count > 0
ORDER BY project_count DESC, tool_name;

-- ----------------------------------------------------------------------------
-- Query 5: Security Audit vs. Tool Adoption Correlation
-- ----------------------------------------------------------------------------
-- Do projects with security audits have better supply chain security?
SELECT 
  CASE WHEN has_security_audits THEN 'With Security Audits' ELSE 'No Security Audits' END as audit_status,
  COUNT(*) as project_count,
  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,
  ROUND(AVG(CASE WHEN repos_with_signatures > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as pct_with_signing,
  ROUND(AVG(CASE WHEN repos_with_slsa_provenance > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as pct_with_slsa,
  ROUND(AVG(security_maturity_score), 2) as avg_security_score
FROM agg_cncf_project_summary
GROUP BY has_security_audits
ORDER BY has_security_audits DESC;

-- ----------------------------------------------------------------------------
-- Query 6: Category-Based Security Analysis
-- ----------------------------------------------------------------------------
-- Which Cloud Native categories lead in security practices?
SELECT 
  category,
  COUNT(*) as project_count,
  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,
  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,
  COUNT(CASE WHEN repos_using_cosign > 0 THEN 1 END) as projects_using_cosign,
  COUNT(CASE WHEN repos_using_trivy > 0 THEN 1 END) as projects_using_trivy,
  ROUND(AVG(security_maturity_score), 2) as avg_security_score
FROM agg_cncf_project_summary
GROUP BY category
HAVING COUNT(*) >= 3  -- Only categories with 3+ projects
ORDER BY avg_security_score DESC, project_count DESC
LIMIT 15;

-- ----------------------------------------------------------------------------
-- Query 7: Projects Missing Key Security Practices
-- ----------------------------------------------------------------------------
-- Identify projects that could improve their supply chain security
SELECT 
  display_name,
  maturity,
  category,
  total_repos,
  security_maturity_score,
  CASE WHEN repos_with_sbom = 0 THEN '❌ No SBOM' ELSE '✓' END as sbom_status,
  CASE WHEN repos_with_signatures = 0 THEN '❌ No Signing' ELSE '✓' END as signing_status,
  CASE WHEN repos_using_vuln_scanner = 0 THEN '❌ No Vuln Scanning' ELSE '✓' END as scanning_status,
  CASE WHEN repos_using_dependabot + repos_using_renovate = 0 THEN '❌ No Dep Mgmt' ELSE '✓' END as dep_mgmt_status,
  homepage_url
FROM agg_cncf_project_summary
WHERE maturity IN ('graduated', 'incubating')  -- Focus on mature projects
  AND security_maturity_score < 4  -- Below average security
ORDER BY 
  CASE maturity WHEN 'graduated' THEN 1 ELSE 2 END,
  security_maturity_score,
  display_name
LIMIT 25;

-- ----------------------------------------------------------------------------
-- Query 8: SBOM Discovery URLs
-- ----------------------------------------------------------------------------
-- Projects with package manager or Docker registry URLs (SBOM discovery)
SELECT 
  display_name,
  maturity,
  repos_with_sbom || '/' || total_repos as sbom_repos,
  package_manager_url,
  docker_url,
  homepage_url
FROM agg_cncf_project_summary
WHERE package_manager_url IS NOT NULL 
   OR docker_url IS NOT NULL
ORDER BY maturity, display_name;

-- ----------------------------------------------------------------------------
-- Query 9: Time-Based SBOM Adoption
-- ----------------------------------------------------------------------------
-- When did projects start generating SBOMs?
SELECT 
  display_name,
  maturity,
  earliest_release_with_sbom,
  earliest_sbom_date,
  EXTRACT(YEAR FROM earliest_sbom_date::DATE) as sbom_adoption_year,
  repos_with_sbom || '/' || total_repos as current_sbom_coverage
FROM agg_cncf_project_summary
WHERE earliest_sbom_date IS NOT NULL
ORDER BY earliest_sbom_date DESC
LIMIT 30;

-- ----------------------------------------------------------------------------
-- Query 10: Multi-Repository Project Analysis
-- ----------------------------------------------------------------------------
-- Projects with multiple repositories and their security posture
SELECT 
  display_name,
  maturity,
  total_repos,
  primary_repos,
  repos_with_sbom,
  ROUND(sbom_adoption_rate * 100, 1) as sbom_adoption_pct,
  repos_using_cosign as signing_repos,
  security_maturity_score,
  repo_url
FROM agg_cncf_project_summary
WHERE total_repos > 1  -- Multi-repo projects
ORDER BY total_repos DESC, security_maturity_score DESC
LIMIT 25;