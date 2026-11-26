// Shared helpers for offline tests. No GitHub token or network access to
// api.github.com is needed: fixtures are built from the committed Parquet
// snapshot that also feeds the explorer site.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { SecurityAnalyzer } from '../src/SecurityAnalyzer';

export const SNAPSHOT_DIR = path.join(__dirname, '..', 'site', 'public', 'data');

/** Columns the export script strips but the SQL models expect. */
const STRIPPED_COLUMNS: Record<string, Record<string, string>> = {
    base_workflows: { content: "''" },
};

export interface Fixture {
    dir: string;
    dbPath: string;
    cleanup: () => void;
}

/**
 * Build a fresh DuckDB file containing every base_* table from the snapshot.
 * agg_* tables are deliberately not copied so the SQL models rebuild them.
 */
export async function buildSnapshotFixture(): Promise<Fixture> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sscc-test-'));
    const dbPath = path.join(dir, 'database.db');
    const db = await DuckDBInstance.create(dbPath);
    const con = await db.connect();
    try {
        const baseFiles = fs.readdirSync(SNAPSHOT_DIR).filter((f) => /^base_.*\.parquet$/.test(f));
        for (const file of baseFiles) {
            const table = path.basename(file, '.parquet');
            const src = path.join(SNAPSHOT_DIR, file).replace(/'/g, "''");
            const extras = Object.entries(STRIPPED_COLUMNS[table] ?? {})
                .map(([col, expr]) => `, ${expr} AS ${col}`)
                .join('');
            await con.run(`CREATE TABLE ${table} AS SELECT *${extras} FROM read_parquet('${src}')`);
        }
    } finally {
        con.closeSync();
        db.closeSync();
    }
    return { dir, dbPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Run a query and return rows as plain objects keyed by column name. */
export async function queryObjects(con: DuckDBConnection, sql: string): Promise<Record<string, unknown>[]> {
    const reader = await con.runAndReadAll(sql);
    return reader.getRowObjectsJson() as Record<string, unknown>[];
}

/**
 * Snapshot fixture with every SQL model applied. Tables listed in `overlay`
 * are then replaced by their committed agg_* Parquet; use this for tables the
 * models cannot rebuild offline (agg_workflow_tools needs workflow content,
 * which the snapshot strips).
 */
export async function buildAnalyzedSnapshotFixture(overlay: string[] = []): Promise<Fixture> {
    const fixture = await buildSnapshotFixture();
    const analyzer = new SecurityAnalyzer(fixture.dbPath);
    await analyzer.analyze(true);
    await analyzer.close();
    if (overlay.length > 0) {
        const db = await DuckDBInstance.create(fixture.dbPath);
        const con = await db.connect();
        try {
            for (const table of overlay) {
                const src = path.join(SNAPSHOT_DIR, `${table}.parquet`).replace(/'/g, "''");
                await con.run(`CREATE OR REPLACE TABLE ${table} AS SELECT * FROM read_parquet('${src}')`);
            }
        } finally {
            con.closeSync();
            db.closeSync();
        }
    }
    return fixture;
}
