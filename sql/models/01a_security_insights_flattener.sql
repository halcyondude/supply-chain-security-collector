-- ============================================================================
-- Security Insights Attestation Flattener Model
-- ============================================================================
-- Reads the nested JSON from base_si_documents and flattens attestations from
-- repository.release.attestations[] into a wide, analytics-friendly table.
-- 
-- Based on OSSF Security Insights Schema v2.0.0+
-- See: https://github.com/ossf/security-insights/blob/main/spec/schema.cue
-- 
-- Note: This model is designed for v2 schema. V1 schema (deprecated) may not
-- have all fields. The schema_version column indicates which version was found.
--
-- Depends on: base_si_documents
-- Creates: agg_si_attestations
-- ============================================================================

-- First check if base_si_documents table exists and has data
CREATE OR REPLACE TABLE _si_table_check AS
SELECT COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'main' 
AND table_name = 'base_si_documents';

-- Get the result
CREATE OR REPLACE TEMP TABLE _si_check_result AS
SELECT table_exists FROM _si_table_check;

-- Create the flattened attestations table
CREATE OR REPLACE TABLE agg_si_attestations AS
WITH table_check AS (
    SELECT table_exists FROM _si_check_result
),
-- Extract attestations from repository.release.attestations[]
release_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        -- Document metadata
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        -- Attestation data
        'release' as attestation_source,
        json_extract_string(attestation, '$.name') as attestation_name,
        json_extract_string(attestation, '$.location') as attestation_location,
        json_extract_string(attestation, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(attestation, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.repository.release.attestations') AS JSON[]),
                []
            )
        ) AS attestation
    ) AS attestations
    WHERE 
        (SELECT table_exists FROM table_check) > 0
        AND attestation IS NOT NULL
),
-- Extract attestations from repository.security.tools[].results.adhoc
tool_adhoc_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        'tool_adhoc' as attestation_source,
        json_extract_string(adhoc_result, '$.name') as attestation_name,
        json_extract_string(adhoc_result, '$.location') as attestation_location,
        json_extract_string(adhoc_result, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(adhoc_result, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.repository.security.tools') AS JSON[]),
                []
            )
        ) AS tool
    ) AS tools,
    LATERAL (
        SELECT json_extract(tool, '$.results.adhoc') AS adhoc_result
    ) AS adhoc_results
    WHERE 
        (SELECT table_exists FROM table_check) > 0
        AND adhoc_result IS NOT NULL
),
-- Extract attestations from repository.security.tools[].results.ci
tool_ci_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        'tool_ci' as attestation_source,
        json_extract_string(ci_result, '$.name') as attestation_name,
        json_extract_string(ci_result, '$.location') as attestation_location,
        json_extract_string(ci_result, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(ci_result, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.repository.security.tools') AS JSON[]),
                []
            )
        ) AS tool
    ) AS tools,
    LATERAL (
        SELECT json_extract(tool, '$.results.ci') AS ci_result
    ) AS ci_results
    WHERE 
        (SELECT table_exists FROM table_check) > 0
        AND ci_result IS NOT NULL
),
-- Extract attestations from repository.security.tools[].results.release
tool_release_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        'tool_release' as attestation_source,
        json_extract_string(release_result, '$.name') as attestation_name,
        json_extract_string(release_result, '$.location') as attestation_location,
        json_extract_string(release_result, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(release_result, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.repository.security.tools') AS JSON[]),
                []
            )
        ) AS tool
    ) AS tools,
    LATERAL (
        SELECT json_extract(tool, '$.results.release') AS release_result
    ) AS release_results
    WHERE 
        (SELECT table_exists FROM table_check) > 0
        AND release_result IS NOT NULL
),
-- Combine all attestations

-- Extract attestations from top-level $.attestations[]
top_level_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        'top_level' as attestation_source,
        json_extract_string(attestation, '$.name') as attestation_name,
        json_extract_string(attestation, '$.location') as attestation_location,
        json_extract_string(attestation, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(attestation, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.attestations') AS JSON[]),
                []
            )
        ) AS attestation
    ) AS attestations
    WHERE (SELECT table_exists FROM table_check) > 0 AND attestation IS NOT NULL
),

-- Extract attestations from $.security-artifacts.attestations[]
security_artifacts_attestations AS (
    SELECT
        docs.repo_id,
        docs.source_url,
        docs.fetched_at,
        json_extract_string(docs.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(docs.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(docs.document, '$.repository.url') as repository_url,
        json_extract_string(docs.document, '$.project.name') as project_name,
        'security_artifacts' as attestation_source,
        json_extract_string(attestation, '$.name') as attestation_name,
        json_extract_string(attestation, '$.location') as attestation_location,
        json_extract_string(attestation, '$.predicate-uri') as attestation_predicate_uri,
        json_extract_string(attestation, '$.comment') as attestation_comment
    FROM base_si_documents docs,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(docs.document, '$.security-artifacts.attestations') AS JSON[]),
                []
            )
        ) AS attestation
    ) AS attestations
    WHERE (SELECT table_exists FROM table_check) > 0 AND attestation IS NOT NULL
),

all_attestations AS (
    SELECT * FROM release_attestations
    UNION ALL
    SELECT * FROM tool_adhoc_attestations
    UNION ALL
    SELECT * FROM tool_ci_attestations
    UNION ALL
    SELECT * FROM tool_release_attestations
    UNION ALL
    SELECT * FROM top_level_attestations
    UNION ALL
    SELECT * FROM security_artifacts_attestations
)
SELECT * FROM all_attestations;

-- Clean up temp tables
DROP TABLE IF EXISTS _si_table_check;
DROP TABLE IF EXISTS _si_check_result;

SELECT
    CASE 
        WHEN COUNT(*) > 0 THEN '✓ Created agg_si_attestations with ' || COUNT(*) || ' attestation(s) from ' || COUNT(DISTINCT repo_id) || ' repo(s)'
        ELSE '✓ Created agg_si_attestations (no attestations found)'
    END as status
FROM agg_si_attestations;

-- ============================================================================
-- SBOM Flattener Model
-- ============================================================================
-- Reads the nested JSON from base_si_documents and flattens SBOMs from
-- repository.release.dependencies.sbom[] into a normalized table.
--
-- Creates: base_si_sboms
-- ============================================================================

CREATE OR REPLACE TABLE base_si_sboms AS
WITH table_check AS (
    SELECT COUNT(*) as table_exists
    FROM information_schema.tables
    WHERE table_schema = 'main' AND table_name = 'base_si_documents'
),
sbom_docs AS (
    SELECT * FROM base_si_documents
    WHERE (SELECT table_exists FROM table_check) > 0
),
sboms_flat AS (
    SELECT
        doc.repo_id,
        doc.source_url,
        doc.fetched_at,
        json_extract_string(doc.document, '$.header.schema-version') as schema_version,
        TRY_CAST(json_extract_string(doc.document, '$.header.last-updated') AS DATE) as last_updated,
        json_extract_string(doc.document, '$.repository.url') as repository_url,
        json_extract_string(doc.document, '$.project.name') as project_name,
        json_extract_string(sbom, '$.sbom-format') as sbom_format,
        json_extract_string(sbom, '$.sbom-url') as sbom_url,
        json_extract_string(sbom, '$.sbom-file') as sbom_file,
        json_extract_string(sbom, '$.comment') as sbom_comment
    FROM sbom_docs doc,
    LATERAL (
        SELECT unnest(
            COALESCE(
                TRY_CAST(json_extract(doc.document, '$.dependencies.sbom') AS JSON[]),
                []
            )
        ) AS sbom
    ) AS sboms
    WHERE sbom IS NOT NULL
)
SELECT * FROM sboms_flat;

-- Validation statement to confirm creation
SELECT
    CASE 
        WHEN COUNT(*) > 0 THEN '✓ Created base_si_sboms with ' || COUNT(*) || ' SBOM(s) from ' || COUNT(DISTINCT repo_id) || ' repo(s)'
        ELSE '✓ Created base_si_sboms (no SBOMs found)'
    END as status
FROM base_si_sboms;
