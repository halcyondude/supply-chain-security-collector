-- ============================================================================
-- Workflow Tool Detection Model
-- ============================================================================
-- Analyzes GitHub Actions workflow files to detect CI/CD security tools:
-- - SBOM generators (Syft, Trivy, CycloneDX Generator)
-- - Signing tools (Cosign, Sigstore, SLSA Generator)
-- - GoReleaser
-- - Security scanners (vulnerability, dependency, code, container)
-- 
-- Depends on: base_workflows table
-- Creates: agg_workflow_tools table
-- ============================================================================

CREATE OR REPLACE TABLE agg_workflow_tools AS
-- SBOM Generators
SELECT 
    w.id as workflow_id,
    w.repository_id,
    w.filename as workflow_name,
    'sbom-generator' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bsyft\b') THEN 'syft'
        WHEN REGEXP_MATCHES(w.content, '(?i)\btrivy\b') THEN 'trivy'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bcdxgen\b') THEN 'cdxgen'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bspdx-sbom-generator\b') THEN 'spdx-sbom-generator'
        WHEN REGEXP_MATCHES(w.content, '(?i)\b(tern-tools/tern|tern.*sbom)\b') THEN 'tern'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(syft|trivy|cdxgen|spdx-sbom-generator|tern-tools/tern|tern.*sbom)\b')

UNION ALL

-- Signing Tools
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'signer' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bcosign\b') THEN 'cosign'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bsigstore\b') THEN 'sigstore'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bslsa-github-generator\b') THEN 'slsa-github-generator'
        WHEN REGEXP_MATCHES(w.content, '(?i)\b(notation|notaryproject)\b') THEN 'notation'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(cosign|sigstore|slsa-github-generator|notation|notaryproject)\b')

UNION ALL

-- GoReleaser
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'goreleaser' as tool_category,
    'goreleaser' as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\bgoreleaser/goreleaser-action\b')

UNION ALL

-- Vulnerability Scanners
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'vulnerability-scanner' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bsnyk\b') THEN 'snyk'
        WHEN REGEXP_MATCHES(w.content, '(?i)\banchore\b') THEN 'anchore'
        WHEN REGEXP_MATCHES(w.content, '(?i)\btwistlock\b') THEN 'twistlock'
        WHEN REGEXP_MATCHES(w.content, '(?i)\baqua\b') THEN 'aqua'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bclair\b') THEN 'clair'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(snyk|anchore|twistlock|aqua|clair)\b')

UNION ALL

-- Dependency Scanners
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'dependency-scanner' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bdependabot\b') THEN 'dependabot'
        WHEN REGEXP_MATCHES(w.content, '(?i)\brenovate\b') THEN 'renovate'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bwhitesource\b') THEN 'whitesource'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bfossa\b') THEN 'fossa'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(dependabot|renovate|whitesource|fossa)\b')

UNION ALL

-- Code Scanners
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'code-scanner' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bcodeql\b') THEN 'codeql'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bsemgrep\b') THEN 'semgrep'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bbandit\b') THEN 'bandit'
        WHEN REGEXP_MATCHES(w.content, '(?i)\beslint-security\b') THEN 'eslint-security'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(codeql|semgrep|bandit|eslint-security)\b')

UNION ALL

-- Container Scanners
SELECT 
    w.id,
    w.repository_id,
    w.filename,
    'container-scanner' as tool_category,
    CASE 
        WHEN REGEXP_MATCHES(w.content, '(?i)\bdocker.*scout\b') THEN 'docker-scout'
        WHEN REGEXP_MATCHES(w.content, '(?i)\bgrype\b') THEN 'grype'
        WHEN REGEXP_MATCHES(w.content, '(?i)\btrivy\b') THEN 'trivy'
    END as tool_name
FROM base_workflows w
WHERE REGEXP_MATCHES(w.content, '(?i)\b(docker.*scout|grype|trivy)\b');

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
