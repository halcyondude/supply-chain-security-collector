/**
 * test-dot-project-duckdb.ts
 *
 * Validates that .project data actually lands in DuckDB correctly by driving the
 * REAL writeDotProjectArtifacts() production path with synthetic GraphQL
 * responses — no token, no network. Confirms:
 *   - all five dot_project* tables are created
 *   - PRIMARY KEY on dot_project(org) is enforced
 *   - date columns land as TIMESTAMP (aligned with fetched_at), not TEXT
 *   - maintainers.yaml is parsed into dot_project_maintainers
 *   - a malformed project.yaml for one org does NOT abort the write
 *
 * Usage:
 *   npx ts-node scripts/test-dot-project-duckdb.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DuckDBInstance } from '@duckdb/node-api';
import { writeDotProjectArtifacts } from '../src/ArtifactWriter';
import type { GetDotProjectDataResponse } from '../src/api';

// Helper: build a synthetic GraphQL response as fetchDotProjectData would return.
function makeResponse(
    org: string,
    projectYamlText: string | null,
    maintainersYamlText: string | null = null,
    oid: string | null = null
): { org: string; data: GetDotProjectDataResponse } {
    return {
        org,
        data: {
            repository: {
                __typename: 'Repository',
                id: `id_${org}`,
                nameWithOwner: `${org}/.project`,
                defaultBranchRef: oid
                    ? { name: 'main', target: { oid } }
                    : { name: 'main', target: null },
                projectYaml: projectYamlText === null
                    ? null
                    : { __typename: 'Blob', id: `blob_${org}`, text: projectYamlText },
                maintainersYaml: maintainersYamlText === null
                    ? null
                    : { __typename: 'Blob', id: `mblob_${org}`, text: maintainersYamlText },
            },
        },
    };
}

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

const KUBERNETES_MAINTAINERS_YAML = `
maintainers:
  - project_id: "kubernetes"
    org: "kubernetes"
    teams:
      - name: "project-maintainers"
        members:
          - "@thockin"
          - "dims"
`;

// A DELIBERATELY malformed project.yaml (scalar repositories + numeric lead +
// non-string repo entries) that would have CRASHED the old code. It must be
// tolerated: parsed defensively and NOT abort the write of the other orgs.
const MALFORMED_YAML = `
schema_version: "1.0.0"
slug: "malformed"
name: "Malformed Project"
project_lead: 42
repositories: "https://github.com/malformed-org/only-repo"
maturity_log: "not-a-list"
`;

async function main() {
    console.log('writeDotProjectArtifacts → DuckDB landing test (real production path)');
    console.log('='.repeat(60));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-project-test-'));
    const dbPath = path.join(tmpDir, 'database.db');

    // Pre-create an empty database.db (writeDotProjectArtifacts opens an existing one)
    {
        const db = await DuckDBInstance.create(dbPath);
        const con = await db.connect();
        await con.run('CREATE TABLE _placeholder (x INTEGER)');
        await con.run('CHECKPOINT');
        con.closeSync();
    }

    // Drive the REAL production function with synthetic responses, including:
    //  - open-telemetry (2 repos, advisory url)
    //  - kubernetes (1 repo, 1 audit, email, maintainers.yaml, resolved oid → permalink)
    //  - malformed (scalar/numeric junk that must not crash)
    //  - ghost (repo exists but no project.yaml → skipped)
    const responses = [
        makeResponse('open-telemetry', OTEL_YAML),
        makeResponse('kubernetes', KUBERNETES_YAML, KUBERNETES_MAINTAINERS_YAML, 'abc123def456'),
        makeResponse('malformed-org', MALFORMED_YAML),
        makeResponse('ghost-org', null),
    ];

    try {
        await writeDotProjectArtifacts(responses, tmpDir);
    } catch (err) {
        console.error('FAIL: writeDotProjectArtifacts threw (should never happen):', err);
        process.exit(1);
    }

    // Re-open and validate
    const db = await DuckDBInstance.create(dbPath);
    const con = await db.connect();

    function assert(cond: boolean, msg: string) {
        if (!cond) { console.error(`  FAIL: ${msg}`); process.exitCode = 1; }
        else console.log(`  PASS: ${msg}`);
    }

    try {
        console.log('\n── Assertions ──');

        // All five tables exist
        const tablesResult = await con.run(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='main' AND table_name LIKE 'dot_project%'
            ORDER BY table_name
        `);
        const tableNames = (await tablesResult.getRows()).map(r => String(r[0]));
        console.log('  Tables:', tableNames.join(', '));
        for (const t of ['dot_project', 'dot_project_audits', 'dot_project_maintainers',
                         'dot_project_maturity_log', 'dot_project_repositories']) {
            assert(tableNames.includes(t), `table ${t} exists`);
        }

        // Row counts: malformed-org still lands (defensive parse); ghost-org does not
        const dpCount = await con.run('SELECT count(*) FROM dot_project');
        const dpRows = Number((await dpCount.getRows())[0][0]);
        assert(dpRows === 3, `dot_project has 3 rows (otel, k8s, malformed; ghost skipped) — got ${dpRows}`);

        // PRIMARY KEY on org is enforced
        const pkResult = await con.run(`
            SELECT constraint_type FROM information_schema.table_constraints
            WHERE table_name='dot_project' AND constraint_type='PRIMARY KEY'
        `);
        const pkRows = await pkResult.getRows();
        assert(pkRows.length >= 1, 'dot_project has a PRIMARY KEY constraint');

        // Inserting a duplicate org must violate the PK
        let pkViolated = false;
        try {
            await con.run(`
                INSERT INTO dot_project (org, source_url) VALUES ('kubernetes', 'dup')
            `);
        } catch {
            pkViolated = true;
        }
        assert(pkViolated, 'duplicate org insert rejected by PRIMARY KEY');

        // Column types: date columns are TIMESTAMP, aligned with fetched_at
        const typesResult = await con.run(`
            SELECT column_name, data_type FROM information_schema.columns
            WHERE table_name='dot_project'
              AND column_name IN ('current_maturity_date', 'fetched_at')
        `);
        const typeMap = new Map<string, string>();
        for (const row of await typesResult.getRows()) {
            typeMap.set(String(row[0]), String(row[1]));
        }
        console.log('  dot_project column types:', JSON.stringify(Object.fromEntries(typeMap)));
        assert(typeMap.get('current_maturity_date') === 'TIMESTAMP', `current_maturity_date is TIMESTAMP (got ${typeMap.get('current_maturity_date')})`);
        assert(typeMap.get('fetched_at') === 'TIMESTAMP', `fetched_at is TIMESTAMP (got ${typeMap.get('fetched_at')})`);

        const matDateType = await con.run(`
            SELECT data_type FROM information_schema.columns
            WHERE table_name='dot_project_maturity_log' AND column_name='date'
        `);
        assert(String((await matDateType.getRows())[0][0]) === 'TIMESTAMP', 'dot_project_maturity_log.date is TIMESTAMP');

        // Content spot-checks
        const otel = await con.run(`
            SELECT slug, current_maturity, repository_count, current_maturity_date
            FROM dot_project WHERE org='open-telemetry'
        `);
        const otelRow = (await otel.getRows())[0];
        console.log('  open-telemetry:', otelRow);
        assert(otelRow[0] === 'opentelemetry', 'otel slug');
        assert(otelRow[1] === 'graduated', 'otel maturity');
        assert(Number(otelRow[2]) === 2, 'otel repository_count = 2');
        assert(otelRow[3] !== null, 'otel current_maturity_date populated (TIMESTAMP cast worked)');

        // malformed-org: numeric project_lead dropped, scalar repo coerced to 1
        const mal = await con.run(`
            SELECT project_lead, repository_count FROM dot_project WHERE org='malformed-org'
        `);
        const malRow = (await mal.getRows())[0];
        console.log('  malformed-org:', malRow);
        assert(malRow[0] === null, 'malformed project_lead=42 dropped to NULL (not "42")');
        assert(Number(malRow[1]) === 1, 'malformed scalar repositories coerced to 1');

        // repositories rows
        const repoCount = await con.run('SELECT count(*) FROM dot_project_repositories');
        const repoRows = Number((await repoCount.getRows())[0][0]);
        assert(repoRows === 4, `dot_project_repositories has 4 rows (otel 2 + k8s 1 + malformed 1) — got ${repoRows}`);

        // audits
        const auditCount = await con.run('SELECT count(*) FROM dot_project_audits');
        assert(Number((await auditCount.getRows())[0][0]) === 1, 'dot_project_audits has 1 row (k8s)');

        // maintainers (from kubernetes maintainers.yaml)
        const maintCount = await con.run('SELECT count(*) FROM dot_project_maintainers');
        const maintRows = Number((await maintCount.getRows())[0][0]);
        assert(maintRows === 2, `dot_project_maintainers has 2 rows (thockin, dims) — got ${maintRows}`);

        const maintDetail = await con.run(`
            SELECT member, team FROM dot_project_maintainers ORDER BY member
        `);
        const maintDetailRows = await maintDetail.getRows();
        console.log('  maintainers:', maintDetailRows);
        assert(maintDetailRows.some(r => r[0] === 'thockin'), 'thockin present (@ stripped)');
        assert(maintDetailRows.some(r => r[0] === 'dims'), 'dims present');

        // Parquet files exported
        const parquetDir = path.join(tmpDir, 'parquet');
        for (const t of ['dot_project', 'dot_project_repositories', 'dot_project_maturity_log',
                         'dot_project_audits', 'dot_project_maintainers']) {
            assert(fs.existsSync(path.join(parquetDir, `${t}.parquet`)), `${t}.parquet exported`);
        }
    } finally {
        try { con.closeSync(); } catch { /* ignore */ }
    }

    fs.rmSync(tmpDir, { recursive: true });

    const exitCode = process.exitCode ?? 0;
    console.log(`\n${'='.repeat(60)}`);
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
