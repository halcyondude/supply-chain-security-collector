-- ============================================================================
-- CNCF Project Analysis Model
-- ============================================================================
-- Aggregates security and supply chain metrics at the CNCF project level:
-- - Project maturity vs. security tool adoption
-- - SBOM generation across project repositories
-- - Security audit correlation with tool usage
-- - Category-based analysis (Cloud Native Landscape taxonomy)
-- 
-- Depends on: base_cncf_projects, base_cncf_project_repos, base_repositories, agg_repo_summary
-- Creates: agg_cncf_project_summary table
-- 
-- Note: Only runs when base_cncf_projects table exists (rich format input)
--       Uses CREATE OR REPLACE which fails gracefully if tables don't exist
-- ============================================================================

-- Create CNCF project summary table (will skip if base tables don't exist)
CREATE OR REPLACE TABLE agg_cncf_project_summary AS
    WITH repo_aggregates AS (
      -- Aggregate metrics across all repos for each project
      SELECT 
        pr.project_name,
        COUNT(DISTINCT pr.owner || '/' || pr.name) as total_repos,
        COUNT(DISTINCT CASE WHEN pr.primary THEN pr.owner || '/' || pr.name END) as primary_repos,
        
        -- Repository-level aggregates (from agg_repo_summary)
        SUM(COALESCE(rs.total_releases, 0)) as total_releases_all_repos,
        SUM(COALESCE(rs.total_assets, 0)) as total_assets_all_repos,
        SUM(COALESCE(rs.total_workflows, 0)) as total_workflows_all_repos,
        
        -- SBOM Adoption
        COUNT(DISTINCT CASE WHEN rs.has_sbom_artifact THEN pr.owner || '/' || pr.name END) as repos_with_sbom,
        SUM(COALESCE(rs.sbom_artifact_count, 0)) as total_sbom_artifacts,
        COUNT(DISTINCT CASE WHEN rs.has_spdx_sbom THEN pr.owner || '/' || pr.name END) as repos_with_spdx,
        COUNT(DISTINCT CASE WHEN rs.has_cyclonedx_sbom THEN pr.owner || '/' || pr.name END) as repos_with_cyclonedx,
        
        -- Signing & Attestation
        COUNT(DISTINCT CASE WHEN rs.has_signature_artifact THEN pr.owner || '/' || pr.name END) as repos_with_signatures,
        COUNT(DISTINCT CASE WHEN rs.has_attestation_artifact THEN pr.owner || '/' || pr.name END) as repos_with_attestations,
        COUNT(DISTINCT CASE WHEN rs.has_slsa_provenance THEN pr.owner || '/' || pr.name END) as repos_with_slsa_provenance,
        COUNT(DISTINCT CASE WHEN rs.has_in_toto_attestation THEN pr.owner || '/' || pr.name END) as repos_with_in_toto,
        
        -- Tool Usage (CI/CD)
        COUNT(DISTINCT CASE WHEN rs.uses_syft THEN pr.owner || '/' || pr.name END) as repos_using_syft,
        COUNT(DISTINCT CASE WHEN rs.uses_trivy THEN pr.owner || '/' || pr.name END) as repos_using_trivy,
        COUNT(DISTINCT CASE WHEN rs.uses_cosign THEN pr.owner || '/' || pr.name END) as repos_using_cosign,
        COUNT(DISTINCT CASE WHEN rs.uses_sigstore THEN pr.owner || '/' || pr.name END) as repos_using_sigstore,
        COUNT(DISTINCT CASE WHEN rs.uses_slsa_github_generator THEN pr.owner || '/' || pr.name END) as repos_using_slsa_generator,
        COUNT(DISTINCT CASE WHEN rs.uses_cdxgen THEN pr.owner || '/' || pr.name END) as repos_using_cdxgen,
        COUNT(DISTINCT CASE WHEN rs.uses_grype THEN pr.owner || '/' || pr.name END) as repos_using_grype,
        
        -- Security Scanning
        COUNT(DISTINCT CASE WHEN rs.uses_codeql THEN pr.owner || '/' || pr.name END) as repos_using_codeql,
        COUNT(DISTINCT CASE WHEN rs.uses_snyk THEN pr.owner || '/' || pr.name END) as repos_using_snyk,
        COUNT(DISTINCT CASE WHEN rs.uses_vulnerability_scanner THEN pr.owner || '/' || pr.name END) as repos_using_vuln_scanner,
        COUNT(DISTINCT CASE WHEN rs.uses_container_scanner THEN pr.owner || '/' || pr.name END) as repos_using_container_scanner,
        
        -- Dependency Management
        COUNT(DISTINCT CASE WHEN rs.uses_dependabot THEN pr.owner || '/' || pr.name END) as repos_using_dependabot,
        COUNT(DISTINCT CASE WHEN rs.uses_renovate THEN pr.owner || '/' || pr.name END) as repos_using_renovate,
        
        -- GoReleaser (popular in CNCF)
        COUNT(DISTINCT CASE WHEN rs.uses_goreleaser THEN pr.owner || '/' || pr.name END) as repos_using_goreleaser,
        
        -- Earliest SBOM adoption
        MIN(rs.first_sbom_date) as earliest_sbom_date,
        MIN(rs.first_release_with_sbom) as earliest_release_with_sbom
        
      FROM base_cncf_project_repos pr
      LEFT JOIN base_repositories r ON pr.owner = SPLIT_PART(r.nameWithOwner, '/', 1) 
                                     AND pr.name = SPLIT_PART(r.nameWithOwner, '/', 2)
      LEFT JOIN agg_repo_summary rs ON r.id = rs.repository_id
      GROUP BY pr.project_name
    )
    SELECT 
      p.project_name,
      
      -- ========================================
      -- Project Identity
      -- ========================================
      p.display_name,
      p.description,
      p.maturity,
      p.category,
      p.subcategory,
      
      -- ========================================
      -- Repository Counts
      -- ========================================
      COALESCE(ra.total_repos, 0) as total_repos,
      COALESCE(ra.primary_repos, 0) as primary_repos,
      
      -- ========================================
      -- Activity Metrics
      -- ========================================
      COALESCE(ra.total_releases_all_repos, 0) as total_releases,
      COALESCE(ra.total_assets_all_repos, 0) as total_release_assets,
      COALESCE(ra.total_workflows_all_repos, 0) as total_workflows,
      
      -- ========================================
      -- SBOM Adoption Metrics
      -- ========================================
      COALESCE(ra.repos_with_sbom, 0) as repos_with_sbom,
      COALESCE(ra.total_sbom_artifacts, 0) as total_sbom_artifacts,
      COALESCE(ra.repos_with_spdx, 0) as repos_with_spdx,
      COALESCE(ra.repos_with_cyclonedx, 0) as repos_with_cyclonedx,
      CASE 
        WHEN COALESCE(ra.total_repos, 0) > 0 
        THEN CAST(COALESCE(ra.repos_with_sbom, 0) AS DECIMAL) / ra.total_repos
        ELSE 0
      END as sbom_adoption_rate,
      ra.earliest_sbom_date,
      ra.earliest_release_with_sbom,
      
      -- ========================================
      -- Signing & Attestation
      -- ========================================
      COALESCE(ra.repos_with_signatures, 0) as repos_with_signatures,
      COALESCE(ra.repos_with_attestations, 0) as repos_with_attestations,
      COALESCE(ra.repos_with_slsa_provenance, 0) as repos_with_slsa_provenance,
      COALESCE(ra.repos_with_in_toto, 0) as repos_with_in_toto,
      
      -- ========================================
      -- Supply Chain Security Tools
      -- ========================================
      COALESCE(ra.repos_using_syft, 0) as repos_using_syft,
      COALESCE(ra.repos_using_trivy, 0) as repos_using_trivy,
      COALESCE(ra.repos_using_cosign, 0) as repos_using_cosign,
      COALESCE(ra.repos_using_sigstore, 0) as repos_using_sigstore,
      COALESCE(ra.repos_using_slsa_generator, 0) as repos_using_slsa_generator,
      COALESCE(ra.repos_using_cdxgen, 0) as repos_using_cdxgen,
      COALESCE(ra.repos_using_grype, 0) as repos_using_grype,
      COALESCE(ra.repos_using_goreleaser, 0) as repos_using_goreleaser,
      
      -- ========================================
      -- Security Scanning Tools
      -- ========================================
      COALESCE(ra.repos_using_codeql, 0) as repos_using_codeql,
      COALESCE(ra.repos_using_snyk, 0) as repos_using_snyk,
      COALESCE(ra.repos_using_vuln_scanner, 0) as repos_using_vuln_scanner,
      COALESCE(ra.repos_using_container_scanner, 0) as repos_using_container_scanner,
      
      -- ========================================
      -- Dependency Management
      -- ========================================
      COALESCE(ra.repos_using_dependabot, 0) as repos_using_dependabot,
      COALESCE(ra.repos_using_renovate, 0) as repos_using_renovate,
      
      -- ========================================
      -- CNCF-Specific Metadata
      -- ========================================
      p.date_accepted,
      p.date_incubating,
      p.date_graduated,
      
      -- Security Audits
      p.has_security_audits,
      p.security_audit_count,
      p.latest_audit_date,
      p.latest_audit_vendor,
      
      -- URLs for SBOM Discovery
      p.homepage_url,
      p.repo_url,
      
      -- OpenSSF/Monitoring
      p.clomonitor_name,
      p.dev_stats_url,
      
      -- Social/Community
      p.blog_url,
      p.crunchbase,
      p.twitter
      
    FROM base_cncf_projects p
    LEFT JOIN repo_aggregates ra ON p.project_name = ra.project_name;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cncf_summary_project ON agg_cncf_project_summary(project_name);
CREATE INDEX IF NOT EXISTS idx_cncf_summary_maturity ON agg_cncf_project_summary(maturity);
CREATE INDEX IF NOT EXISTS idx_cncf_summary_category ON agg_cncf_project_summary(category);
CREATE INDEX IF NOT EXISTS idx_cncf_summary_sbom_adoption ON agg_cncf_project_summary(sbom_adoption_rate);

-- Validation: Show summary stats
SELECT 
  '✓ Created agg_cncf_project_summary' as status,
  COUNT(*) as total_projects,
  COUNT(CASE WHEN maturity = 'graduated' THEN 1 END) as graduated_projects,
  COUNT(CASE WHEN maturity = 'incubating' THEN 1 END) as incubating_projects,
  COUNT(CASE WHEN maturity = 'sandbox' THEN 1 END) as sandbox_projects,
  SUM(repos_with_sbom) as total_repos_with_sbom,
  ROUND(AVG(sbom_adoption_rate) * 100, 1) || '%' as avg_sbom_adoption_rate
FROM agg_cncf_project_summary;

