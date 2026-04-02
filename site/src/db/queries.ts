/**
 * Pre-built query catalog covering key findings from the CNCF landscape
 * supply chain security analysis.
 */

export interface CatalogQuery {
  id: string;
  name: string;
  description: string;
  sql: string;
  category: string;
  renderHint?: 'table' | 'bar' | 'pie' | 'scatter';
}

export const queryLibrary: CatalogQuery[] = [
  // --- Overview ---
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    description: 'High-level numbers across all CNCF projects',
    sql: `SELECT * FROM agg_executive_summary`,
    category: 'overview',
    renderHint: 'table',
  },
  {
    id: 'repo-count',
    name: 'Total Repositories',
    description: 'Count of all repositories in the dataset',
    sql: `SELECT COUNT(*) AS total_repos FROM base_repositories`,
    category: 'overview',
    renderHint: 'table',
  },
  {
    id: 'project-count',
    name: 'CNCF Projects by Maturity',
    description: 'Distribution of projects across maturity levels',
    sql: `SELECT maturity, COUNT(*) AS project_count
FROM agg_cncf_project_summary
GROUP BY maturity
ORDER BY project_count DESC`,
    category: 'overview',
    renderHint: 'bar',
  },

  // --- Signing & SBOMs ---
  {
    id: 'signing-adoption',
    name: 'Signing Adoption',
    description: 'Projects with signature artifacts in releases',
    sql: `SELECT nameWithOwner, signature_artifact_count, sbom_artifact_count
FROM agg_repo_summary
WHERE signature_artifact_count > 0
ORDER BY signature_artifact_count DESC
LIMIT 20`,
    category: 'signing',
    renderHint: 'bar',
  },
  {
    id: 'sbom-adoption',
    name: 'SBOM Adoption',
    description: 'Projects publishing SBOMs in releases',
    sql: `SELECT nameWithOwner, sbom_artifact_count, total_release_assets
FROM agg_repo_summary
WHERE sbom_artifact_count > 0
ORDER BY sbom_artifact_count DESC
LIMIT 20`,
    category: 'signing',
    renderHint: 'bar',
  },
  {
    id: 'signing-vs-sbom',
    name: 'Signing vs SBOMs',
    description: 'Projects with signing, SBOMs, both, or neither',
    sql: `SELECT
  CASE
    WHEN has_sbom_artifact AND has_signature_artifact THEN 'Both'
    WHEN has_sbom_artifact THEN 'SBOM only'
    WHEN has_signature_artifact THEN 'Signing only'
    ELSE 'Neither'
  END AS category,
  COUNT(*) AS repo_count
FROM agg_repo_summary
GROUP BY category
ORDER BY repo_count DESC`,
    category: 'signing',
    renderHint: 'pie',
  },

  // --- Tool Adoption ---
  {
    id: 'tool-summary',
    name: 'CI/CD Tool Adoption',
    description: 'Which security tools are used across the landscape',
    sql: `SELECT * FROM agg_tool_summary ORDER BY repo_count DESC`,
    category: 'tools',
    renderHint: 'bar',
  },
  {
    id: 'tool-categories',
    name: 'Tool Categories',
    description: 'Security tools grouped by category',
    sql: `SELECT * FROM agg_tool_category_summary ORDER BY repo_count DESC`,
    category: 'tools',
    renderHint: 'bar',
  },

  // --- Maturity Analysis ---
  {
    id: 'maturity-security',
    name: 'Security by Maturity Level',
    description: 'Security adoption rates across graduated, incubating, and sandbox projects',
    sql: `SELECT
  maturity,
  COUNT(*) AS projects,
  ROUND(100.0 * SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) / COUNT(*), 1) AS sbom_pct,
  ROUND(100.0 * SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) / COUNT(*), 1) AS signing_pct
FROM agg_cncf_project_summary
GROUP BY maturity
ORDER BY projects DESC`,
    category: 'maturity',
    renderHint: 'bar',
  },

  // --- Release Analysis ---
  {
    id: 'releases-per-repo',
    name: 'Releases per Repository',
    description: 'Distribution of release counts across repos',
    sql: `SELECT
  CASE
    WHEN release_count = 0 THEN '0 releases'
    WHEN release_count BETWEEN 1 AND 5 THEN '1-5'
    WHEN release_count BETWEEN 6 AND 20 THEN '6-20'
    WHEN release_count BETWEEN 21 AND 50 THEN '21-50'
    ELSE '50+'
  END AS bucket,
  COUNT(*) AS repo_count
FROM agg_repo_summary
GROUP BY bucket
ORDER BY repo_count DESC`,
    category: 'releases',
    renderHint: 'bar',
  },
  {
    id: 'artifact-patterns',
    name: 'Release Artifact Patterns',
    description: 'Most common artifact filename patterns in releases',
    sql: `SELECT * FROM agg_artifact_patterns ORDER BY count DESC LIMIT 30`,
    category: 'releases',
    renderHint: 'table',
  },

  // --- SBOM Details ---
  {
    id: 'sbom-formats',
    name: 'SBOM Formats',
    description: 'Distribution of SBOM formats found in sigstore transparency log',
    sql: `SELECT * FROM agg_sbom_summary`,
    category: 'sbom',
    renderHint: 'table',
  },
  {
    id: 'si-attestations',
    name: 'Sigstore Attestations',
    description: 'Sigstore transparency log attestation summary',
    sql: `SELECT * FROM agg_si_attestations`,
    category: 'sbom',
    renderHint: 'table',
  },

  // --- Drill-down ---
  {
    id: 'repo-detail',
    name: 'Full Repo Detail',
    description: 'Complete detail view for all repos (wide table)',
    sql: `SELECT * FROM agg_repo_detail LIMIT 50`,
    category: 'detail',
    renderHint: 'table',
  },
  {
    id: 'cncf-project-summary',
    name: 'CNCF Project Summary',
    description: 'Summary per CNCF project with security metrics',
    sql: `SELECT * FROM agg_cncf_project_summary ORDER BY maturity, name`,
    category: 'detail',
    renderHint: 'table',
  },
];

export const categories = [
  { id: 'overview', name: 'Overview' },
  { id: 'signing', name: 'Signing & SBOMs' },
  { id: 'tools', name: 'Tool Adoption' },
  { id: 'maturity', name: 'Maturity Analysis' },
  { id: 'releases', name: 'Release Analysis' },
  { id: 'sbom', name: 'SBOM Details' },
  { id: 'detail', name: 'Drill-down' },
];
