-- ============================================================================
-- Workflow Tool Detection Model
-- ============================================================================
-- Analyzes GitHub Actions workflow files to detect CI/CD security tools:
-- - SBOM generators (Syft, Trivy, CycloneDX Generator)
-- - Signing tools (Cosign, Sigstore, SLSA Generator)
-- - GoReleaser
-- - Security scanners (vulnerability, dependency, code, container)
-- 
-- Uses Full-Text Search (FTS) for efficient tool detection in workflow content.
-- 
-- Depends on: base_workflows table, FTS index on content
-- Creates: agg_workflow_tools table
-- ============================================================================

CREATE OR REPLACE TABLE agg_workflow_tools AS
-- SBOM Generators
SELECT 
    w.id as workflow_id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename as workflow_name,
    'sbom-generator' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'syft') IS NOT NULL THEN 'syft'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'trivy') IS NOT NULL THEN 'trivy'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'cdxgen') IS NOT NULL THEN 'cdxgen'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'spdx-sbom-generator') IS NOT NULL THEN 'spdx-sbom-generator'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'tern') IS NOT NULL THEN 'tern'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'syft OR trivy OR cdxgen OR spdx-sbom-generator OR tern') IS NOT NULL

UNION ALL

-- Signing Tools
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'signer' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'cosign') IS NOT NULL THEN 'cosign'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'sigstore') IS NOT NULL THEN 'sigstore'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'slsa-github-generator') IS NOT NULL THEN 'slsa-github-generator'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'notation') IS NOT NULL THEN 'notation'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'notaryproject') IS NOT NULL THEN 'notation'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'cosign OR sigstore OR slsa-github-generator OR notation OR notaryproject') IS NOT NULL

UNION ALL

-- GoReleaser
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'goreleaser' as tool_category,
    'goreleaser' as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'goreleaser-action') IS NOT NULL

UNION ALL

-- Vulnerability Scanners
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'vulnerability-scanner' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'snyk') IS NOT NULL THEN 'snyk'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'anchore') IS NOT NULL THEN 'anchore'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'twistlock') IS NOT NULL THEN 'twistlock'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'aqua') IS NOT NULL THEN 'aqua'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'clair') IS NOT NULL THEN 'clair'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'snyk OR anchore OR twistlock OR aqua OR clair') IS NOT NULL

UNION ALL

-- Dependency Scanners
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'dependency-scanner' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'dependabot') IS NOT NULL THEN 'dependabot'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'renovate') IS NOT NULL THEN 'renovate'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'whitesource') IS NOT NULL THEN 'whitesource'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'fossa') IS NOT NULL THEN 'fossa'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'dependabot OR renovate OR whitesource OR fossa') IS NOT NULL

UNION ALL

-- Code Scanners
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'code-scanner' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'codeql') IS NOT NULL THEN 'codeql'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'semgrep') IS NOT NULL THEN 'semgrep'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'bandit') IS NOT NULL THEN 'bandit'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'eslint-security') IS NOT NULL THEN 'eslint-security'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'codeql OR semgrep OR bandit OR eslint-security') IS NOT NULL

UNION ALL

-- Container Scanners
SELECT 
    w.id,
    w.repository_id,
    -- Repository identification
    SPLIT_PART(repo.nameWithOwner, '/', 1) as owner,
    repo.name as repo,
    repo.nameWithOwner as nameWithOwner,
    w.filename,
    'container-scanner' as tool_category,
    CASE 
        WHEN fts_main_base_workflows.match_bm25(w.id, 'docker-scout') IS NOT NULL THEN 'docker-scout'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'grype') IS NOT NULL THEN 'grype'
        WHEN fts_main_base_workflows.match_bm25(w.id, 'trivy') IS NOT NULL THEN 'trivy'
    END as tool_name
FROM base_workflows w
JOIN base_repositories repo ON w.repository_id = repo.id
WHERE fts_main_base_workflows.match_bm25(w.id, 'docker-scout OR grype OR trivy') IS NOT NULL;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workflow_repository ON agg_workflow_tools(repository_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tool_category ON agg_workflow_tools(tool_category);
CREATE INDEX IF NOT EXISTS idx_workflow_tool_name ON agg_workflow_tools(tool_name);

-- Validation: Show summary stats
SELECT 
    '✓ Created agg_workflow_tools' as status,
    COUNT(*) as total_detections,
    COUNT(DISTINCT workflow_id) as unique_workflows,
    COUNT(DISTINCT repository_id) as unique_repositories
FROM agg_workflow_tools;
