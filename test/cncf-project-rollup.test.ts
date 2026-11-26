// Regression tests for the CNCF project rollup (sql/models/05_cncf_project_analysis.sql).
// See https://github.com/halcyondude/supply-chain-security-collector/issues/78
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SecurityAnalyzer } from '../src/SecurityAnalyzer';
import { buildSnapshotFixture, queryObjects, type Fixture } from './helpers';

/** project-level count column in the rollup -> per-repo boolean in agg_repo_summary */
const ROLLUP_TO_REPO_FLAG: Record<string, string> = {
    repos_with_sbom: 'has_sbom_artifact',
    repos_with_signatures: 'has_signature_artifact',
    repos_with_attestations: 'has_attestation_artifact',
};

describe('agg_cncf_project_summary', () => {
    let fixture: Fixture;
    let db: DuckDBInstance;
    let con: DuckDBConnection;

    before(async () => {
        fixture = await buildSnapshotFixture();
        const analyzer = new SecurityAnalyzer(fixture.dbPath);
        await analyzer.analyze(true);
        await analyzer.close();
        db = await DuckDBInstance.create(fixture.dbPath);
        con = await db.connect();
    });

    after(() => {
        con?.closeSync();
        db?.closeSync();
        fixture?.cleanup();
    });

    test('every project repo whose name differs only in case is matched', async () => {
        const rows = await queryObjects(con, `
            SELECT pr.owner || '/' || pr.name AS listed, r.nameWithOwner AS canonical
            FROM base_cncf_project_repos pr
            JOIN base_repositories r ON LOWER(pr.owner || '/' || pr.name) = LOWER(r.nameWithOwner)
            WHERE pr.owner || '/' || pr.name <> r.nameWithOwner`);
        // The snapshot contains such repos (e.g. cubeFS/cubefs); without them this test proves nothing.
        assert.ok(rows.length > 0, 'snapshot should include case-mismatched repos');
    });

    for (const [rollupCol, repoFlag] of Object.entries(ROLLUP_TO_REPO_FLAG)) {
        test(`${rollupCol} agrees with agg_repo_summary.${repoFlag}`, async () => {
            const mismatches = await queryObjects(con, `
                WITH per_repo AS (
                    SELECT pr.project_name,
                           COUNT(DISTINCT CASE WHEN rs.${repoFlag} THEN r.id END) AS expected
                    FROM base_cncf_project_repos pr
                    JOIN base_repositories r ON LOWER(pr.owner || '/' || pr.name) = LOWER(r.nameWithOwner)
                    JOIN agg_repo_summary rs ON rs.repository_id = r.id
                    GROUP BY pr.project_name
                )
                SELECT p.project_name, p.${rollupCol} AS actual, COALESCE(pr.expected, 0) AS expected
                FROM agg_cncf_project_summary p
                LEFT JOIN per_repo pr USING (project_name)
                WHERE p.${rollupCol} <> COALESCE(pr.expected, 0)`);
            assert.deepEqual(mismatches, []);
        });
    }

    test('CubeFS is counted as signed (issue #78)', async () => {
        const [row] = await queryObjects(con,
            `SELECT repos_with_signatures FROM agg_cncf_project_summary WHERE project_name = 'CubeFS'`);
        assert.ok(row, 'CubeFS present in rollup');
        assert.ok(Number(row.repos_with_signatures) > 0);
    });
});
