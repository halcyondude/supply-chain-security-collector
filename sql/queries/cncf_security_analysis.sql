-- ============================================================================-- ============================================================================

-- CNCF Project Security Practice Reporting Queries-- CNCF Project Security Analysis Queries

-- ============================================================================-- ============================================================================

-- Descriptive queries for reporting on CNCF project security practices-- A collection of analytical queries for CNCF project security practices

-- -- 

-- Requires: agg_cncf_project_summary table (created by 05_cncf_project_analysis.sql)-- Requires: agg_cncf_project_summary table (created by 05_cncf_project_analysis.sql)

-- ============================================================================-- ============================================================================



-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Query 1: Security Tool Adoption by CNCF Maturity Level-- Query 1: Security Maturity by CNCF Maturity Level

-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Reports security tool adoption patterns across maturity levels-- Shows how security tool adoption correlates with CNCF project maturity

-- (graduated vs. incubating vs. sandbox)

SELECT 

  maturity,SELECT 

  COUNT(*) as project_count,  maturity,

  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,  COUNT(*) as project_count,

  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,

  COUNT(CASE WHEN repos_with_signatures > 0 THEN 1 END) as projects_with_signing,  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,

  COUNT(CASE WHEN repos_with_slsa_provenance > 0 THEN 1 END) as projects_with_slsa,  COUNT(CASE WHEN repos_with_signatures > 0 THEN 1 END) as projects_with_signing,

  COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) as projects_using_codeql,  COUNT(CASE WHEN repos_with_slsa_provenance > 0 THEN 1 END) as projects_with_slsa,

  COUNT(CASE WHEN has_security_audits THEN 1 END) as projects_with_audits  COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) as projects_using_codeql,

FROM agg_cncf_project_summary  COUNT(CASE WHEN has_security_audits THEN 1 END) as projects_with_audits,

GROUP BY maturity  ROUND(AVG(security_maturity_score), 2) as avg_security_score

ORDER BY FROM agg_cncf_project_summary

  CASE maturityGROUP BY maturity

    WHEN 'graduated' THEN 1ORDER BY 

    WHEN 'incubating' THEN 2  CASE maturity

    WHEN 'sandbox' THEN 3    WHEN 'graduated' THEN 1

    ELSE 4    WHEN 'incubating' THEN 2

  END;    WHEN 'sandbox' THEN 3

    ELSE 4

-- ----------------------------------------------------------------------------  END;

-- Query 2: Projects with Security Audits

-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Lists projects that have completed formal security audits-- Query 2: Top Security Leaders (Highest Security Maturity Score)

-- ----------------------------------------------------------------------------

SELECT -- Projects with the most comprehensive security practices

  display_name,

  maturity,SELECT 

  category,  display_name,

  security_audit_count,  maturity,

  latest_audit_date,  category,

  latest_audit_vendor,  security_maturity_score,

  homepage_url  repos_with_sbom || '/' || total_repos as sbom_repos,

FROM agg_cncf_project_summary  repos_with_signatures || '/' || total_repos as signing_repos,

WHERE has_security_audits = TRUE  CASE WHEN has_security_audits THEN '✓' ELSE '' END as audited,

ORDER BY   CASE WHEN url_for_bestpractices IS NOT NULL THEN '✓' ELSE '' END as openssf_badge,

  CASE maturity  homepage_url

    WHEN 'graduated' THEN 1FROM agg_cncf_project_summary

    WHEN 'incubating' THEN 2WHERE security_maturity_score >= 5  -- High bar for security maturity

    WHEN 'sandbox' THEN 3ORDER BY security_maturity_score DESC, maturity, display_name

  END,LIMIT 20;

  display_name;

-- ----------------------------------------------------------------------------

-- ------------------------------------------------------------------------------ Query 3: SBOM Format Adoption Trends

-- Query 3: SBOM Format Adoption-- ----------------------------------------------------------------------------

-- ------------------------------------------------------------------------------ Which SBOM formats are most popular across CNCF projects?

-- Reports which SBOM formats are used across CNCF projects

SELECT 

SELECT   'SPDX' as sbom_format,

  'SPDX' as sbom_format,  COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) as projects_using,

  COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) as projects_using,  SUM(repos_with_spdx) as total_repos_using,

  SUM(repos_with_spdx) as total_repos_using,  ROUND(COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pct

  ROUND(COUNT(CASE WHEN repos_with_spdx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pctFROM agg_cncf_project_summary

FROM agg_cncf_project_summary

UNION ALL

UNION ALL

SELECT 

SELECT   'CycloneDX' as sbom_format,

  'CycloneDX' as sbom_format,  COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) as projects_using,

  COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) as projects_using,  SUM(repos_with_cyclonedx) as total_repos_using,

  SUM(repos_with_cyclonedx) as total_repos_using,  ROUND(COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pct

  ROUND(COUNT(CASE WHEN repos_with_cyclonedx > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pctFROM agg_cncf_project_summary

FROM agg_cncf_project_summary

ORDER BY adoption_pct DESC;

UNION ALL

-- ----------------------------------------------------------------------------

SELECT -- Query 4: Tool Popularity Across CNCF Projects

  'Any SBOM' as sbom_format,-- ----------------------------------------------------------------------------

  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_using,-- Which supply chain security tools are most commonly used?

  SUM(repos_with_sbom) as total_repos_using,

  ROUND(COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) * 100.0 / COUNT(*), 1) as adoption_pctWITH tool_usage AS (

FROM agg_cncf_project_summary;  SELECT 'Syft' as tool_name, 'SBOM Generator' as category, SUM(repos_using_syft) as repo_count, COUNT(CASE WHEN repos_using_syft > 0 THEN 1 END) as project_count FROM agg_cncf_project_summary

  UNION ALL SELECT 'Trivy', 'Vulnerability Scanner', SUM(repos_using_trivy), COUNT(CASE WHEN repos_using_trivy > 0 THEN 1 END) FROM agg_cncf_project_summary

-- ----------------------------------------------------------------------------  UNION ALL SELECT 'Cosign', 'Signing Tool', SUM(repos_using_cosign), COUNT(CASE WHEN repos_using_cosign > 0 THEN 1 END) FROM agg_cncf_project_summary

-- Query 4: Signing and Attestation Practices  UNION ALL SELECT 'CodeQL', 'Code Scanner', SUM(repos_using_codeql), COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) FROM agg_cncf_project_summary

-- ----------------------------------------------------------------------------  UNION ALL SELECT 'SLSA Generator', 'Provenance', SUM(repos_using_slsa_generator), COUNT(CASE WHEN repos_using_slsa_generator > 0 THEN 1 END) FROM agg_cncf_project_summary

-- Reports on artifact signing and SLSA provenance adoption  UNION ALL SELECT 'Grype', 'Vulnerability Scanner', SUM(repos_using_grype), COUNT(CASE WHEN repos_using_grype > 0 THEN 1 END) FROM agg_cncf_project_summary

  UNION ALL SELECT 'CDXGen', 'SBOM Generator', SUM(repos_using_cdxgen), COUNT(CASE WHEN repos_using_cdxgen > 0 THEN 1 END) FROM agg_cncf_project_summary

SELECT   UNION ALL SELECT 'Snyk', 'Vulnerability Scanner', SUM(repos_using_snyk), COUNT(CASE WHEN repos_using_snyk > 0 THEN 1 END) FROM agg_cncf_project_summary

  maturity,  UNION ALL SELECT 'Dependabot', 'Dependency Updater', SUM(repos_using_dependabot), COUNT(CASE WHEN repos_using_dependabot > 0 THEN 1 END) FROM agg_cncf_project_summary

  COUNT(*) as project_count,  UNION ALL SELECT 'Renovate', 'Dependency Updater', SUM(repos_using_renovate), COUNT(CASE WHEN repos_using_renovate > 0 THEN 1 END) FROM agg_cncf_project_summary

  COUNT(CASE WHEN repos_with_signatures > 0 THEN 1 END) as projects_with_signing,  UNION ALL SELECT 'GoReleaser', 'Release Automation', SUM(repos_using_goreleaser), COUNT(CASE WHEN repos_using_goreleaser > 0 THEN 1 END) FROM agg_cncf_project_summary

  SUM(repos_with_signatures) as total_repos_with_signing,)

  COUNT(CASE WHEN repos_with_slsa_provenance > 0 THEN 1 END) as projects_with_slsa,SELECT 

  SUM(repos_with_slsa_provenance) as total_repos_with_slsa  tool_name,

FROM agg_cncf_project_summary  category,

GROUP BY maturity  project_count as projects_using,

ORDER BY   repo_count as repos_using,

  CASE maturity  ROUND(project_count * 100.0 / (SELECT COUNT(*) FROM agg_cncf_project_summary), 1) as project_adoption_pct

    WHEN 'graduated' THEN 1FROM tool_usage

    WHEN 'incubating' THEN 2WHERE repo_count > 0

    WHEN 'sandbox' THEN 3ORDER BY project_count DESC, tool_name;

  END;

-- ----------------------------------------------------------------------------

-- ------------------------------------------------------------------------------ Query 5: Security Audit vs. Tool Adoption Correlation

-- Query 5: Category-Level Security Tool Adoption-- ----------------------------------------------------------------------------

-- ------------------------------------------------------------------------------ Do projects with security audits have better supply chain security?

-- Reports security tool adoption by project category

SELECT 

SELECT   CASE WHEN has_security_audits THEN 'With Security Audits' ELSE 'No Security Audits' END as audit_status,

  category,  COUNT(*) as project_count,

  COUNT(*) as project_count,  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,

  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,  ROUND(AVG(CASE WHEN repos_with_signatures > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as pct_with_signing,

  COUNT(CASE WHEN repos_using_codeql > 0 THEN 1 END) as projects_using_codeql,  ROUND(AVG(CASE WHEN repos_with_slsa_provenance > 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as pct_with_slsa,

  COUNT(CASE WHEN repos_using_dependabot + repos_using_renovate > 0 THEN 1 END) as projects_with_dep_updates  ROUND(AVG(security_maturity_score), 2) as avg_security_score

FROM agg_cncf_project_summaryFROM agg_cncf_project_summary

GROUP BY categoryGROUP BY has_security_audits

ORDER BY project_count DESC;ORDER BY has_security_audits DESC;



-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Query 6: Vulnerability Scanning Tool Usage-- Query 6: Category-Based Security Analysis

-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Reports which vulnerability scanning tools are in use-- Which Cloud Native categories lead in security practices?



SELECT SELECT 

  maturity,  category,

  COUNT(*) as project_count,  COUNT(*) as project_count,

  SUM(repos_using_trivy) as repos_using_trivy,  ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_adoption_pct,

  SUM(repos_using_snyk) as repos_using_snyk,  COUNT(CASE WHEN repos_with_sbom > 0 THEN 1 END) as projects_with_sbom,

  SUM(repos_using_grype) as repos_using_grype,  COUNT(CASE WHEN repos_using_cosign > 0 THEN 1 END) as projects_using_cosign,

  SUM(repos_using_vuln_scanner) as repos_using_any_scanner  COUNT(CASE WHEN repos_using_trivy > 0 THEN 1 END) as projects_using_trivy,

FROM agg_cncf_project_summary  ROUND(AVG(security_maturity_score), 2) as avg_security_score

GROUP BY maturityFROM agg_cncf_project_summary

ORDER BY GROUP BY category

  CASE maturityHAVING COUNT(*) >= 3  -- Only categories with 3+ projects

    WHEN 'graduated' THEN 1ORDER BY avg_security_score DESC, project_count DESC

    WHEN 'incubating' THEN 2LIMIT 15;

    WHEN 'sandbox' THEN 3

  END;-- ----------------------------------------------------------------------------

-- Query 7: Projects Missing Key Security Practices

-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Query 7: SBOM Generator Tool Usage-- Identify projects that could improve their supply chain security

-- ----------------------------------------------------------------------------

-- Reports which SBOM generation tools are in useSELECT 

  display_name,

SELECT   maturity,

  'Syft' as tool,  category,

  COUNT(CASE WHEN repos_using_syft > 0 THEN 1 END) as projects_using,  total_repos,

  SUM(repos_using_syft) as total_repos_using  security_maturity_score,

FROM agg_cncf_project_summary  CASE WHEN repos_with_sbom = 0 THEN '❌ No SBOM' ELSE '✓' END as sbom_status,

  CASE WHEN repos_with_signatures = 0 THEN '❌ No Signing' ELSE '✓' END as signing_status,

UNION ALL  CASE WHEN repos_using_vuln_scanner = 0 THEN '❌ No Vuln Scanning' ELSE '✓' END as scanning_status,

  CASE WHEN repos_using_dependabot + repos_using_renovate = 0 THEN '❌ No Dep Mgmt' ELSE '✓' END as dep_mgmt_status,

SELECT   homepage_url

  'Trivy (SBOM mode)' as tool,FROM agg_cncf_project_summary

  COUNT(CASE WHEN repos_using_trivy > 0 THEN 1 END) as projects_using,WHERE maturity IN ('graduated', 'incubating')  -- Focus on mature projects

  SUM(repos_using_trivy) as total_repos_using  AND security_maturity_score < 4  -- Below average security

FROM agg_cncf_project_summaryORDER BY 

  CASE maturity WHEN 'graduated' THEN 1 ELSE 2 END,

UNION ALL  security_maturity_score,

  display_name

SELECT LIMIT 25;

  'CycloneDX Generator' as tool,

  COUNT(CASE WHEN repos_using_cyclonedx_gen > 0 THEN 1 END) as projects_using,-- ----------------------------------------------------------------------------

  SUM(repos_using_cyclonedx_gen) as total_repos_using-- Query 8: SBOM Discovery URLs

FROM agg_cncf_project_summary-- ----------------------------------------------------------------------------

-- Projects with package manager or Docker registry URLs (SBOM discovery)

UNION ALL

SELECT 

SELECT   display_name,

  'SPDX SBOM Generator' as tool,  maturity,

  COUNT(CASE WHEN repos_using_spdx_sbom_gen > 0 THEN 1 END) as projects_using,  repos_with_sbom || '/' || total_repos as sbom_repos,

  SUM(repos_using_spdx_sbom_gen) as total_repos_using  package_manager_url,

FROM agg_cncf_project_summary;  docker_url,

  homepage_url

-- ----------------------------------------------------------------------------FROM agg_cncf_project_summary

-- Query 8: Dependency Update Tool UsageWHERE package_manager_url IS NOT NULL 

-- ----------------------------------------------------------------------------   OR docker_url IS NOT NULL

-- Reports which dependency update tools are in useORDER BY maturity, display_name;



SELECT -- ----------------------------------------------------------------------------

  maturity,-- Query 9: Time-Based SBOM Adoption

  COUNT(*) as project_count,-- ----------------------------------------------------------------------------

  SUM(repos_using_dependabot) as repos_using_dependabot,-- When did projects start generating SBOMs?

  SUM(repos_using_renovate) as repos_using_renovate,

  SUM(repos_using_dependabot) + SUM(repos_using_renovate) as repos_with_any_dep_updatesSELECT 

FROM agg_cncf_project_summary  display_name,

GROUP BY maturity  maturity,

ORDER BY   earliest_release_with_sbom,

  CASE maturity  earliest_sbom_date,

    WHEN 'graduated' THEN 1  EXTRACT(YEAR FROM earliest_sbom_date::DATE) as sbom_adoption_year,

    WHEN 'incubating' THEN 2  repos_with_sbom || '/' || total_repos as current_sbom_coverage

    WHEN 'sandbox' THEN 3FROM agg_cncf_project_summary

  END;WHERE earliest_sbom_date IS NOT NULL

ORDER BY earliest_sbom_date DESC

-- ----------------------------------------------------------------------------LIMIT 30;

-- Query 9: Multi-Repository Projects

-- ------------------------------------------------------------------------------ ----------------------------------------------------------------------------

-- Lists projects with multiple repositories-- Query 10: Multi-Repository Project Analysis

-- ----------------------------------------------------------------------------

SELECT -- Projects with multiple repositories and their security posture

  project_name,

  display_name,SELECT 

  maturity,  display_name,

  category,  maturity,

  total_repos,  total_repos,

  repos_with_sbom,  primary_repos,

  homepage_url  repos_with_sbom,

FROM agg_cncf_project_summary  ROUND(sbom_adoption_rate * 100, 1) as sbom_adoption_pct,

WHERE total_repos > 1  repos_using_cosign as signing_repos,

ORDER BY total_repos DESC, display_name;  security_maturity_score,

  repo_url

-- ----------------------------------------------------------------------------FROM agg_cncf_project_summary

-- Query 10: Projects with Complete MetadataWHERE total_repos > 1  -- Multi-repo projects

-- ----------------------------------------------------------------------------ORDER BY total_repos DESC, security_maturity_score DESC

-- Lists projects that have provided comprehensive metadataLIMIT 25;



SELECT ```
  project_name,
  display_name,
  maturity,
  category,
  CASE WHEN homepage_url IS NOT NULL THEN '✓' ELSE '' END as has_homepage,
  CASE WHEN blog_url IS NOT NULL THEN '✓' ELSE '' END as has_blog,
  CASE WHEN clomonitor_name IS NOT NULL THEN '✓' ELSE '' END as has_clomonitor,
  CASE WHEN dev_stats_url IS NOT NULL THEN '✓' ELSE '' END as has_devstats,
  CASE WHEN has_security_audits THEN '✓' ELSE '' END as has_audits
FROM agg_cncf_project_summary
ORDER BY 
  CASE maturity
    WHEN 'graduated' THEN 1
    WHEN 'incubating' THEN 2
    WHEN 'sandbox' THEN 3
  END,
  display_name;
