// Graph build regression tests (src/graph). Builds the LadybugDB graph from the
// analyzed snapshot and checks it is complete and that built-in queries are sound.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { DuckDBInstance } from '@duckdb/node-api';
import { GraphBuilder } from '../src/graph/GraphBuilder';
import { NODE_TABLES, REL_TABLES } from '../src/graph/schema';
import { getQuery } from '../src/graph/queries';
import { buildAnalyzedSnapshotFixture, queryObjects, type Fixture } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lbug = require('lbug');

/** A release whose name contains double quotes; CSV loading used to choke on these. */
const QUOTED_RELEASE_ID = 'RE_kwDOFPvgPs4FzP4R';

async function cypher(graphPath: string, query: string): Promise<Record<string, unknown>[]> {
    const db = new lbug.Database(graphPath);
    const con = new lbug.Connection(db);
    try {
        const result = await con.query(query);
        return await result.getAll();
    } finally {
        await con.close();
        await db.close();
    }
}

describe('GraphBuilder', () => {
    let fixture: Fixture;
    let graphPath: string;
    let expectedCounts: Map<string, number>;
    let build: Awaited<ReturnType<GraphBuilder['build']>>;

    before(async () => {
        fixture = await buildAnalyzedSnapshotFixture(['agg_workflow_tools']);
        graphPath = path.join(fixture.dir, 'graph.lbug');

        const db = await DuckDBInstance.create(fixture.dbPath);
        const con = await db.connect();
        expectedCounts = new Map();
        for (const def of [...NODE_TABLES, ...REL_TABLES]) {
            const [row] = await queryObjects(con, `SELECT COUNT(*) AS n FROM (${def.sourceQuery})`);
            expectedCounts.set(def.name, Number(row.n));
        }
        con.closeSync();
        db.closeSync();

        const builder = new GraphBuilder(fixture.dbPath, graphPath);
        build = await builder.build();
        await builder.close();
    });

    after(() => fixture?.cleanup());

    test('loads every node and relationship table without failures', () => {
        assert.deepEqual(build.failures, []);
        const expectedNodes = NODE_TABLES.reduce((n, d) => n + expectedCounts.get(d.name)!, 0);
        const expectedRels = REL_TABLES.reduce((n, d) => n + expectedCounts.get(d.name)!, 0);
        assert.equal(build.nodeCount, expectedNodes);
        assert.equal(build.relCount, expectedRels);
    });

    for (const def of [...NODE_TABLES, ...REL_TABLES]) {
        test(`${def.name} matches its source row count`, async () => {
            const isNode = NODE_TABLES.some((n) => n.name === def.name);
            const q = isNode
                ? `MATCH (n:${def.name}) RETURN count(n) AS n`
                : `MATCH ()-[r:${def.name}]->() RETURN count(r) AS n`;
            const [row] = await cypher(graphPath, q);
            assert.equal(Number(row.n), expectedCounts.get(def.name));
        });
    }

    test('text with embedded quotes round-trips', async () => {
        const db = await DuckDBInstance.create(fixture.dbPath);
        const con = await db.connect();
        const [src] = await queryObjects(con, `SELECT name FROM base_releases WHERE id = '${QUOTED_RELEASE_ID}'`);
        con.closeSync();
        db.closeSync();
        assert.ok(src, 'fixture release present');
        const [row] = await cypher(graphPath, `MATCH (r:Release {id: '${QUOTED_RELEASE_ID}'}) RETURN r.name AS name`);
        assert.equal(row?.name, src.name);
    });

    test('ReleaseAsset classification matches agg_artifact_patterns', async () => {
        const db = await DuckDBInstance.create(fixture.dbPath);
        const con = await db.connect();
        const [sql] = await queryObjects(con, `
            SELECT COUNT(*) FILTER (WHERE is_sbom) AS sbom,
                   COUNT(*) FILTER (WHERE is_signature) AS sig,
                   COUNT(*) FILTER (WHERE is_attestation) AS att
            FROM agg_artifact_patterns`);
        con.closeSync();
        db.closeSync();
        for (const [flag, expected] of [['is_sbom', sql.sbom], ['is_signature', sql.sig], ['is_attestation', sql.att]]) {
            const [row] = await cypher(graphPath, `MATCH (a:ReleaseAsset) WHERE a.${flag} RETURN count(*) AS n`);
            assert.equal(Number(row.n), Number(expected), flag as string);
        }
    });

    test('graduated-no-signing excludes repos whose workflows use a signer', async () => {
        const rows = await cypher(graphPath, getQuery('graduated-no-signing')!.cypher);
        const db = await DuckDBInstance.create(fixture.dbPath);
        const con = await db.connect();
        const signers = await queryObjects(con, `
            SELECT DISTINCT r.nameWithOwner
            FROM agg_workflow_tools wt
            JOIN base_repositories r ON r.id = wt.repository_id
            JOIN base_cncf_project_repos pr ON LOWER(pr.owner || '/' || pr.name) = LOWER(r.nameWithOwner)
            JOIN base_cncf_projects p ON p.project_name = pr.project_name
            WHERE wt.tool_category = 'signer' AND p.maturity = 'graduated'`);
        con.closeSync();
        db.closeSync();
        assert.ok(signers.length > 0, 'snapshot has graduated repos with signers in CI');
        const returned = new Set(rows.map((r) => r['r.nameWithOwner']));
        for (const s of signers) {
            assert.ok(!returned.has(s.nameWithOwner), `${s.nameWithOwner} uses a signer but was returned`);
        }
    });
});
