-- ============================================================================
-- Org CI Visibility Model
-- ============================================================================
-- Aggregates repository coverage at the GitHub org level:
-- - How many repos in the org are tracked in the landscape scan
-- - How many are missing from the landscape
-- - Archived and forked repo counts
-- - Which CNCF project the org belongs to
--
-- Depends on: base_org_repos, base_repositories
-- Creates: agg_org_summary table
--
-- Note: Only runs when base_org_repos table exists (org scan input)
--       Uses CREATE OR REPLACE which fails gracefully if tables don't exist
-- ============================================================================

CREATE OR REPLACE TABLE agg_org_summary AS
SELECT
    o.cncf_project_name,
    o.org,
    COUNT(*) as total_repos,
    COUNT(CASE WHEN r.nameWithOwner IS NOT NULL THEN 1 END) as repos_in_landscape,
    COUNT(CASE WHEN r.nameWithOwner IS NULL THEN 1 END) as repos_not_in_landscape,
    COUNT(CASE WHEN o.isArchived THEN 1 END) as archived_repos,
    COUNT(CASE WHEN o.isFork THEN 1 END) as forked_repos
FROM base_org_repos o
LEFT JOIN base_repositories r ON o.nameWithOwner = r.nameWithOwner
GROUP BY o.cncf_project_name, o.org
ORDER BY total_repos DESC;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_org_summary_project ON agg_org_summary(cncf_project_name);
CREATE INDEX IF NOT EXISTS idx_org_summary_org ON agg_org_summary(org);

-- Validation: Show summary stats
SELECT
    '✓ Created agg_org_summary' as status,
    COUNT(*) as total_orgs,
    SUM(total_repos) as total_org_repos,
    SUM(repos_in_landscape) as repos_in_landscape,
    SUM(repos_not_in_landscape) as repos_not_in_landscape,
    SUM(archived_repos) as archived_repos,
    SUM(forked_repos) as forked_repos
FROM agg_org_summary;
