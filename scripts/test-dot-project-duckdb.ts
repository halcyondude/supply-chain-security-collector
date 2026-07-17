/**
 * test-dot-project-duckdb.ts
 *
 * Validates that parseDotProject output actually lands in DuckDB correctly.
 * Uses an in-memory DuckDB instance — no token, no network required.
 *
 * Usage:
 *   npx ts-node scripts/test-dot-project-duckdb.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DuckDBInstance } from '@duckdb/node-api';
import { parseDotProject, mergeDotProjectResults } from '../src/normalizers/DotProjectNormalizer';
import { installAndLoadExtensions } from '../src/duckdb-extensions';

// Fixture: real open-telemetry data from test-dot-project-parse.ts
const OTEL_YAML = `
schema_version: "1.0.0"
slug: "opentelemetry"
name: "OpenTelemetry"
description: "High-quality, ubiquitous, and portable telemetry to enable effective observability"
type: "project"
project_lead: "alolita"
maturity_log:
  - phase: "graduated"
    date: "2019-05-07T00:00:00Z"
    issue: "https://github.com/cncf/toc/issues/2152"
repositories:
  - "https://github.com/open-telemetry/community"
  - "https://github.com/open-telemetry/opentelemetry-specification"
website: "https://opentelemetry.io/"
security:
  policy:
    path: "https://github.com/open-telemetry/.github/blob/main/SECURITY.md"
  contact:
    advisory_url: "https://github.com/open-telemetry/opentelemetry.io/security/advisories/new"
landscape:
  category: "Observability and Analysis"
  subcategory: "Observability"
`;

const KUBERNETES_YAML = `
schema_version: "1.0.0"
slug: "kubernetes"
name: "Kubernetes"
description: "Container orchestration"
type: "platform"
project_lead:
  - "thockin"
  - "kubernetes/sig-leads"
maturity_log:
  - phase: "graduated"
    date: "2018-03-06T00:00:00Z"
    issue: "https://github.com/cncf/toc/issues/999"
repositories:
  - "https://github.com/kubernetes/kubernetes"
audits:
  - date: 2019-08-06T00:00:00Z
    type: "security"
    url: "https://example.com/audit1"
security:
  contact:
    email: "security@kubernetes.io"
`;

const DOT_PROJECT_SCHEMAS = {
    dot_project: `
        org TEXT NOT NULL,
        source_url TEXT NOT NULL,
        schema_version TEXT,
        slug TEXT,
        name TEXT,
        description TEXT,
        type TEXT,
        project_lead TEXT,
        repository_count INTEGER,
        website TEXT,
        current_maturity TEXT,
        current_maturity_date TEXT,
        audit_count INTEGER,
        security_policy_path TEXT,
        security_threat_model_path TEXT,
        security_contact_email TEXT,
        security_advisory_url TEXT,
        landscape_category TEXT,
        landscape_subcategory TEXT,
        package_managers_json TEXT,
        fetched_at TIMESTAMP
    `,
    dot_project_repositories: `
        org TEXT NOT NULL,
        position INTEGER NOT NULL,
        repo_url TEXT NOT NULL,
        repo_owner TEXT,
        repo_name TEXT
    `,
    dot_project_maturity_log: `
        org TEXT NOT NULL,
        position INTEGER NOT NULL,
        phase TEXT,
        date TEXT,
        issue TEXT
    `,
    dot_project_audits: `
        org TEXT NOT NULL,
        position INTEGER NOT NULL,
        date TEXT,
        type TEXT,
        url TEXT
    `,
} as const;

async function main() {
    console.log('DotProjectNormalizer → DuckDB landing test');
    console.log('='.repeat(50));

    // Parse fixtures
    const r1 = parseDotProject('open-telemetry', OTEL_YAML,
        'https://github.com/open-telemetry/.project/blob/HEAD/project.yaml');
    const r2 = parseDotProject('kubernetes', KUBERNETES_YAML,
        'https://github.com/kubernetes/.project/blob/HEAD/project.yaml');

    if (!r1 || !r2) {
        console.error('FAIL: parseDotProject returned null for a fixture');
        process.exit(1);
    }

    const merged = mergeDotProjectResults([r1, r2]);
    console.log(`Parsed: ${merged.dot_project.length} projects, ${merged.dot_project_repositories.length} repos`);

    // Write to a temp DuckDB
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-project-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = await DuckDBInstance.create(dbPath);
    const con = await db.connect();

    try {
        await installAndLoadExtensions(con);

        // Write each table using the same pattern as writeDotProjectArtifacts
        for (const [tableName, data] of [
            ['dot_project', merged.dot_project],
            ['dot_project_repositories', merged.dot_project_repositories],
            ['dot_project_maturity_log', merged.dot_project_maturity_log],
            ['dot_project_audits', merged.dot_project_audits],
        ] as const) {
            const schema = DOT_PROJECT_SCHEMAS[tableName];
            if (data.length > 0) {
                const tempPath = path.join(tmpDir, `temp_${tableName}.json`);
                fs.writeFileSync(tempPath, JSON.stringify(data));
                await con.run(`
                    CREATE TABLE ${tableName} AS
                    SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true, union_by_name=true)
                `);
                fs.unlinkSync(tempPath);
            } else {
                await con.run(`CREATE TABLE ${tableName} (${schema})`);
            }
            console.log(`  Created: ${tableName} (${(data as unknown[]).length} rows)`);
        }

        // Query and validate
        console.log('\n── dot_project ──');
        const dpResult = await con.run(`
            SELECT org, slug, name, current_maturity, repository_count, audit_count,
                   security_advisory_url IS NOT NULL AS has_advisory,
                   security_contact_email,
                   landscape_category
            FROM dot_project
            ORDER BY org
        `);
        const dpRows = await dpResult.getRows();
        for (const row of dpRows) {
            console.log(row);
        }

        console.log('\n── dot_project_repositories ──');
        const repoResult = await con.run(`
            SELECT org, repo_owner, repo_name, position
            FROM dot_project_repositories
            ORDER BY org, position
        `);
        const repoRows = await repoResult.getRows();
        for (const row of repoRows) {
            console.log(row);
        }

        console.log('\n── dot_project_maturity_log ──');
        const matResult = await con.run(`
            SELECT org, phase, date, position
            FROM dot_project_maturity_log
            ORDER BY org, position
        `);
        const matRows = await matResult.getRows();
        for (const row of matRows) {
            console.log(row);
        }

        console.log('\n── dot_project_audits ──');
        const auditResult = await con.run(`
            SELECT org, type, url, position
            FROM dot_project_audits
            ORDER BY org, position
        `);
        const auditRows = await auditResult.getRows();
        for (const row of auditRows) {
            console.log(row);
        }

        // Assertions on query results
        console.log('\n── Assertions ──');

        function assert(cond: boolean, msg: string) {
            if (!cond) { console.error(`  FAIL: ${msg}`); process.exitCode = 1; }
            else console.log(`  PASS: ${msg}`);
        }

        assert(dpRows.length === 2, `dot_project has 2 rows (got ${dpRows.length})`);

        // Row ordering: open-telemetry < kubernetes alphabetically
        const otelRow = dpRows.find(r => r[0] === 'open-telemetry');
        const k8sRow = dpRows.find(r => r[0] === 'kubernetes');

        assert(otelRow !== undefined, 'open-telemetry row exists');
        assert(k8sRow !== undefined, 'kubernetes row exists');

        if (otelRow) {
            assert(otelRow[1] === 'opentelemetry', `otel slug = opentelemetry (got ${otelRow[1]})`);
            assert(otelRow[3] === 'graduated', `otel maturity = graduated (got ${otelRow[3]})`);
            assert(Number(otelRow[4]) === 2, `otel repository_count = 2 (got ${otelRow[4]})`);
            assert(otelRow[6] === true, 'otel has_advisory = true');
        }

        if (k8sRow) {
            assert(k8sRow[1] === 'kubernetes', `k8s slug = kubernetes (got ${k8sRow[1]})`);
            assert(Number(k8sRow[5]) === 1, `k8s audit_count = 1 (got ${k8sRow[5]})`);
            assert(k8sRow[7] === 'security@kubernetes.io', `k8s security_contact_email set`);
        }

        assert(repoRows.length === 3, `dot_project_repositories has 3 rows (got ${repoRows.length})`);
        assert(matRows.length === 2, `dot_project_maturity_log has 2 rows (got ${matRows.length})`);
        assert(auditRows.length === 1, `dot_project_audits has 1 row (got ${auditRows.length})`);

        await con.run('CHECKPOINT');
    } finally {
        try { con.closeSync(); } catch { /* ignore */ }
    }

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });

    const exitCode = process.exitCode ?? 0;
    console.log(`\n${'='.repeat(50)}`);
    if (exitCode === 0) {
        console.log('All DuckDB landing tests passed.');
    } else {
        console.error('Some DuckDB landing tests FAILED.');
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
