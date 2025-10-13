-- ============================================================================
-- 00_initialize_indexes.sql
-- 
-- Creates indexes including full-text search indexes for improved query
-- performance on text-heavy columns.
--
-- This should run AFTER base_* tables are created but BEFORE analysis models.
-- ============================================================================

-- Full-Text Search Index on workflow content
-- Enables fast searching of workflow YAML for tool names, commands, etc.
-- The overwrite=1 flag allows recreating the index if it exists
PRAGMA create_fts_index('base_workflows', 'id', 'content', overwrite=1);

-- Full-Text Search Index on workflow filenames
-- Enables searching workflow files by name (e.g., "release", "build", "security")
PRAGMA create_fts_index('base_workflows', 'id', 'filename', overwrite=1);

-- Full-Text Search Index on repository descriptions  
-- Enables searching repository descriptions for keywords
PRAGMA create_fts_index('base_repositories', 'id', 'description', 'nameWithOwner', overwrite=1);

-- Full-Text Search Index on release names
-- Enables searching release names for version patterns, keywords (e.g., "security", "hotfix")
PRAGMA create_fts_index('base_releases', 'id', 'name', overwrite=1);

-- Full-Text Search Index on release asset names
-- Enables searching artifact filenames without REGEXP (e.g., "sbom", "attestation", "linux-amd64")
PRAGMA create_fts_index('base_release_assets', 'id', 'name', overwrite=1);

-- Standard B-tree indexes for common join keys
CREATE INDEX IF NOT EXISTS idx_workflows_repo_id 
ON base_workflows(repository_id);

CREATE INDEX IF NOT EXISTS idx_releases_repo_id 
ON base_releases(repository_id);

CREATE INDEX IF NOT EXISTS idx_release_assets_release_id 
ON base_release_assets(release_id);
