-- ============================================================================
-- 00_initialize_indexes.sql
-- 
-- Creates indexes including full-text search indexes for improved query
-- performance on text-heavy columns.
--
-- This should run AFTER base_* tables are created but BEFORE analysis models.
-- Gracefully handles missing tables via SecurityAnalyzer error handling.
-- ============================================================================

-- Full-Text Search Index on workflow content
-- Enables fast searching of workflow YAML for tool names, commands, etc.
PRAGMA create_fts_index('base_workflows', 'id', 'content', overwrite=1);

-- Full-Text Search Index on workflow filenames
PRAGMA create_fts_index('base_workflows', 'id', 'filename', overwrite=1);

-- Full-Text Search Index on repository descriptions  
PRAGMA create_fts_index('base_repositories', 'id', 'description', 'nameWithOwner', overwrite=1);

-- Full-Text Search Index on release names
PRAGMA create_fts_index('base_releases', 'id', 'name', overwrite=1);

-- Full-Text Search Index on release asset names (optional - may not exist)
PRAGMA create_fts_index('base_release_assets', 'id', 'name', overwrite=1);

-- Full-Text Search Index on SECURITY.md content
PRAGMA create_fts_index('base_security_md', 'id', 'content', overwrite=1);

-- Standard B-tree indexes for common join keys
CREATE INDEX IF NOT EXISTS idx_workflows_repo_id 
ON base_workflows(repository_id);

CREATE INDEX IF NOT EXISTS idx_releases_repo_id 
ON base_releases(repository_id);

-- Release assets index (optional - may not exist)
CREATE INDEX IF NOT EXISTS idx_release_assets_release_id 
ON base_release_assets(release_id);

-- ============================================================================
-- CNCF-Specific Indexes (optional - may not exist)
-- ============================================================================

-- Project name index for joining
CREATE INDEX IF NOT EXISTS idx_cncf_projects_name 
ON base_cncf_projects(project_name);

-- Maturity level for filtering
CREATE INDEX IF NOT EXISTS idx_cncf_projects_maturity 
ON base_cncf_projects(maturity);

-- Category for analysis
CREATE INDEX IF NOT EXISTS idx_cncf_projects_category 
ON base_cncf_projects(category);

-- Project name for joining
CREATE INDEX IF NOT EXISTS idx_cncf_repos_project 
ON base_cncf_project_repos(project_name);

-- Owner/name for joining with repositories
CREATE INDEX IF NOT EXISTS idx_cncf_repos_owner_name 
ON base_cncf_project_repos(owner, name);

-- Primary flag for filtering (primary is a reserved keyword, needs quoting)
CREATE INDEX IF NOT EXISTS idx_cncf_repos_primary 
ON base_cncf_project_repos("primary");
