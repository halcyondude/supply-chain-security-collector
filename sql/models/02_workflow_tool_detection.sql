-- ============================================================================
-- Workflow Tool Detection Model
-- ============================================================================
-- Detects CI/CD security tools referenced in GitHub Actions workflow YAML.
--
-- Detection is data-driven: the catalog below lists each tool once, with the
-- FTS terms that identify it. Every term must appear in the workflow
-- content (conjunctive match), which matters because the FTS tokenizer splits
-- hyphenated names: 'docker-scout' becomes 'docker' + 'scout', and an OR match
-- would flag every workflow that mentions docker.
--
-- A workflow can match several tools in a category (e.g. syft and trivy);
-- each match is its own row.
--
-- To add a tool: add a line to the catalog. agg_repo_summary only exposes
-- uses_<tool> columns for tools listed in 03_repository_security_summary.sql.
--
-- Depends on: base_workflows, base_repositories, FTS index on base_workflows
-- Creates: agg_workflow_tools
-- ============================================================================

-- One FTS lookup per catalog row. The terms must be a constant at each call
-- site: passing them as a column (e.g. CROSS JOIN a catalog table) turns
-- match_bm25 into a per-row correlated subquery and takes minutes, not ms.
CREATE OR REPLACE TEMP MACRO workflow_tool_matches(category, tool, terms) AS TABLE
    SELECT
        w.id AS workflow_id,
        w.repository_id,
        SPLIT_PART(repo.nameWithOwner, '/', 1) AS owner,
        repo.name AS repo,
        repo.nameWithOwner AS nameWithOwner,
        w.filename AS workflow_name,
        category AS tool_category,
        tool AS tool_name
    FROM base_workflows w
    JOIN base_repositories repo ON w.repository_id = repo.id
    WHERE fts_main_base_workflows.match_bm25(w.id, terms, fields := 'content', conjunctive := 1) IS NOT NULL;

-- Tool catalog: (tool_category, tool_name, FTS terms that must all appear).
CREATE OR REPLACE TABLE agg_workflow_tools AS
SELECT DISTINCT * FROM (
              FROM workflow_tool_matches('sbom-generator',        'syft',                  'syft')
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'trivy',                 'trivy')
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'cdxgen',                'cdxgen')
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'spdx-sbom-generator',   'spdx sbom generator')
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'tern',                  'tern')
    UNION ALL FROM workflow_tool_matches('signer',                'cosign',                'cosign')
    UNION ALL FROM workflow_tool_matches('signer',                'sigstore',              'sigstore')
    UNION ALL FROM workflow_tool_matches('signer',                'slsa-github-generator', 'slsa github generator')
    UNION ALL FROM workflow_tool_matches('signer',                'notation',              'notation')
    UNION ALL FROM workflow_tool_matches('signer',                'notation',              'notaryproject')
    UNION ALL FROM workflow_tool_matches('goreleaser',            'goreleaser',            'goreleaser')
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'snyk',                  'snyk')
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'anchore',               'anchore')
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'twistlock',             'twistlock')
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'aqua',                  'aqua')
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'clair',                 'clair')
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'dependabot',            'dependabot')
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'renovate',              'renovate')
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'whitesource',           'whitesource')
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'fossa',                 'fossa')
    UNION ALL FROM workflow_tool_matches('code-scanner',          'codeql',                'codeql')
    UNION ALL FROM workflow_tool_matches('code-scanner',          'semgrep',               'semgrep')
    UNION ALL FROM workflow_tool_matches('code-scanner',          'bandit',                'bandit')
    UNION ALL FROM workflow_tool_matches('code-scanner',          'eslint-security',       'eslint plugin security')
    UNION ALL FROM workflow_tool_matches('container-scanner',     'docker-scout',          'docker scout')
    UNION ALL FROM workflow_tool_matches('container-scanner',     'grype',                 'grype')
    UNION ALL FROM workflow_tool_matches('container-scanner',     'trivy',                 'trivy')
);

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
