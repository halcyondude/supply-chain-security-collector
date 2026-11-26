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
-- Terms are also stemmed ('generator' and 'generate' both become 'gener'), so
-- multi-word names like spdx-sbom-generator match any workflow that generates
-- an SPDX SBOM. Those rows add a case-insensitive regex that the workflow must
-- also contain; it only runs on the FTS hits. NULL means FTS alone decides.
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
CREATE OR REPLACE TEMP MACRO workflow_tool_matches(category, tool, terms, pattern) AS TABLE
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
    WHERE fts_main_base_workflows.match_bm25(w.id, terms, fields := 'content', conjunctive := 1) IS NOT NULL
      AND (pattern IS NULL OR regexp_matches(w.content, pattern, 'i'));

-- Tool catalog: (tool_category, tool_name, FTS terms that must all appear, exact regex or NULL).
CREATE OR REPLACE TABLE agg_workflow_tools AS
SELECT DISTINCT * FROM (
              FROM workflow_tool_matches('sbom-generator',        'syft',                  'syft', NULL)
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'trivy',                 'trivy', NULL)
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'cdxgen',                'cdxgen', NULL)
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'spdx-sbom-generator',   'spdx sbom generator', 'spdx-sbom-generator')
    UNION ALL FROM workflow_tool_matches('sbom-generator',        'tern',                  'tern', NULL)
    UNION ALL FROM workflow_tool_matches('signer',                'cosign',                'cosign', NULL)
    UNION ALL FROM workflow_tool_matches('signer',                'sigstore',              'sigstore', NULL)
    UNION ALL FROM workflow_tool_matches('signer',                'slsa-github-generator', 'slsa github generator', 'slsa-github-generator')
    UNION ALL FROM workflow_tool_matches('signer',                'notation',              'notation', NULL)
    UNION ALL FROM workflow_tool_matches('signer',                'notation',              'notaryproject', NULL)
    UNION ALL FROM workflow_tool_matches('goreleaser',            'goreleaser',            'goreleaser', NULL)
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'snyk',                  'snyk', NULL)
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'anchore',               'anchore', NULL)
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'twistlock',             'twistlock', NULL)
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'aqua',                  'aqua', NULL)
    UNION ALL FROM workflow_tool_matches('vulnerability-scanner', 'clair',                 'clair', NULL)
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'dependabot',            'dependabot', NULL)
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'renovate',              'renovate', NULL)
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'whitesource',           'whitesource', NULL)
    UNION ALL FROM workflow_tool_matches('dependency-scanner',    'fossa',                 'fossa', NULL)
    UNION ALL FROM workflow_tool_matches('code-scanner',          'codeql',                'codeql', NULL)
    UNION ALL FROM workflow_tool_matches('code-scanner',          'semgrep',               'semgrep', NULL)
    UNION ALL FROM workflow_tool_matches('code-scanner',          'bandit',                'bandit', NULL)
    UNION ALL FROM workflow_tool_matches('code-scanner',          'eslint-security',       'eslint plugin security', 'eslint-plugin-security')
    UNION ALL FROM workflow_tool_matches('container-scanner',     'docker-scout',          'docker scout', 'docker/scout-action|docker scout')
    UNION ALL FROM workflow_tool_matches('container-scanner',     'grype',                 'grype', NULL)
    UNION ALL FROM workflow_tool_matches('container-scanner',     'trivy',                 'trivy', NULL)
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
