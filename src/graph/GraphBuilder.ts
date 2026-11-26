import { DuckDBInstance } from '@duckdb/node-api';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { installAndLoadExtensions } from '../duckdb-extensions';
import { NODE_TABLES, REL_TABLES } from './schema';
import type { NodeTableDef, RelTableDef } from './schema';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lbug = require('lbug');

type DuckDBConnection = Awaited<ReturnType<DuckDBInstance['connect']>>;

// LadybugDB connection type (untyped npm package)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LbugConnection = any;

interface GraphBuildResult {
    graphDbPath: string;
    nodeCount: number;
    relCount: number;
    /** Tables whose load failed (missing source tables are skipped, not failures). */
    failures: string[];
}

/**
 * GraphBuilder — reads DuckDB base and agg tables and builds a LadybugDB
 * property graph for Cypher-based supply chain security analysis.
 */
export class GraphBuilder {
    private duckDbPath: string;
    private graphDbPath: string;
    private duckDb?: DuckDBInstance;
    private duckCon?: DuckDBConnection;
    private failures: string[] = [];

    constructor(duckDbPath: string, graphDbPath?: string) {
        this.duckDbPath = duckDbPath;
        this.graphDbPath = graphDbPath || path.join(path.dirname(duckDbPath), 'graph.lbug');
    }

    private async connectDuck() {
        if (!this.duckDb) {
            this.duckDb = await DuckDBInstance.create(this.duckDbPath);
            this.duckCon = await this.duckDb.connect();
            await installAndLoadExtensions(this.duckCon);
        }
    }

    /**
     * Check if a DuckDB table exists
     */
    private async tableExists(tableName: string): Promise<boolean> {
        const result = await this.duckCon!.run(
            `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${tableName}'`
        );
        const rows = await result.getRows();
        return Number(rows[0]?.[0]) > 0;
    }

    /**
     * Export a source query to a temp Parquet file and return its path and row count.
     *
     * Parquet (not CSV) is the bulk-load format: values carry their types, and
     * text with quotes, commas or newlines (e.g. release names) needs no escaping.
     * Column order is preserved, which LadybugDB uses to map node properties and
     * the FROM/TO keys of relationship tables.
     */
    private async exportTempParquet(sourceQuery: string): Promise<{ path: string; rows: number }> {
        const tmpPath = path.join(os.tmpdir(), `lbug_${Date.now()}_${Math.random().toString(36).slice(2)}.parquet`);
        const result = await this.duckCon!.run(
            `COPY (${sourceQuery}) TO '${tmpPath.replace(/'/g, "''")}' (FORMAT PARQUET)`
        );
        return { path: tmpPath, rows: Number(result.rowsChanged) };
    }

    /**
     * Build the graph from DuckDB data
     */
    async build(): Promise<GraphBuildResult> {
        await this.connectDuck();
        let totalNodes = 0;
        let totalRels = 0;
        this.failures = [];

        // Remove existing graph DB directory (LadybugDB uses a directory)
        if (fs.existsSync(this.graphDbPath)) {
            fs.rmSync(this.graphDbPath, { recursive: true });
        }

        console.log(chalk.cyan(`\n🕸️  Building graph database: ${this.graphDbPath}\n`));

        const graphDb = new lbug.Database(this.graphDbPath);
        const graphCon = new lbug.Connection(graphDb);
        try {
            // Create node tables and load data
            for (const nodeDef of NODE_TABLES) {
                totalNodes += await this.createAndLoadNodeTable(graphCon, nodeDef);
            }

            // Create relationship tables and load data
            for (const relDef of REL_TABLES) {
                totalRels += await this.createAndLoadRelTable(graphCon, relDef);
            }
        } finally {
            // Release the on-disk lock so the graph can be reopened (e.g. by graph:query).
            await graphCon.close();
            await graphDb.close();
        }

        const result = { graphDbPath: this.graphDbPath, nodeCount: totalNodes, relCount: totalRels, failures: [...this.failures] };
        if (result.failures.length > 0) {
            // A partial graph answers Cypher queries wrongly (e.g. every project looks unsigned
            // when HAS_ASSET is empty), so a failed load must fail the build.
            throw new Error(`failed to load ${result.failures.join(', ')} (${totalNodes} nodes, ${totalRels} relationships loaded)`);
        }

        console.log(chalk.green.bold(`\n✅ Graph built: ${totalNodes} nodes, ${totalRels} relationships\n`));
        return result;
    }

    private async createAndLoadNodeTable(graphCon: LbugConnection, def: NodeTableDef): Promise<number> {
        // Check if source tables exist
        const srcTable = this.extractTableName(def.sourceQuery);
        if (srcTable && !(await this.tableExists(srcTable))) {
            console.log(chalk.gray(`  ⓘ Skipping ${def.name} (source table ${srcTable} not found)`));
            return 0;
        }

        try {
            // Create node table DDL
            const colDefs = def.columns.map(c =>
                c.name === def.primaryKey
                    ? `${c.name} ${c.type} PRIMARY KEY`
                    : `${c.name} ${c.type}`
            ).join(', ');

            await graphCon.query(`CREATE NODE TABLE IF NOT EXISTS ${def.name}(${colDefs})`);

            const tmp = await this.exportTempParquet(def.sourceQuery);
            try {
                if (tmp.rows === 0) {
                    console.log(chalk.gray(`  ⓘ ${def.name}: 0 nodes (empty source)`));
                    return 0;
                }
                await graphCon.query(`COPY ${def.name} FROM '${tmp.path}'`);
                console.log(chalk.green(`  ✓ ${def.name}: ${tmp.rows} nodes`));
                return tmp.rows;
            } finally {
                fs.rmSync(tmp.path, { force: true });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ✗ ${def.name}: ${msg.substring(0, 200)}`));
            this.failures.push(def.name);
            return 0;
        }
    }

    private async createAndLoadRelTable(graphCon: LbugConnection, def: RelTableDef): Promise<number> {
        // Check if source tables exist
        const srcTable = this.extractTableName(def.sourceQuery);
        if (srcTable && !(await this.tableExists(srcTable))) {
            console.log(chalk.gray(`  ⓘ Skipping ${def.name} (source table ${srcTable} not found)`));
            return 0;
        }

        try {
            // Create relationship table DDL
            const extraCols = def.columns.length > 0
                ? ', ' + def.columns.map(c => `${c.name} ${c.type}`).join(', ')
                : '';

            await graphCon.query(
                `CREATE REL TABLE IF NOT EXISTS ${def.name}(FROM ${def.from} TO ${def.to}${extraCols})`
            );

            const tmp = await this.exportTempParquet(def.sourceQuery);
            try {
                if (tmp.rows === 0) {
                    console.log(chalk.gray(`  ⓘ ${def.name}: 0 relationships (empty source)`));
                    return 0;
                }
                await graphCon.query(`COPY ${def.name} FROM '${tmp.path}'`);
                console.log(chalk.green(`  ✓ ${def.name}: ${tmp.rows} relationships`));
                return tmp.rows;
            } finally {
                fs.rmSync(tmp.path, { force: true });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ✗ ${def.name}: ${msg.substring(0, 200)}`));
            this.failures.push(def.name);
            return 0;
        }
    }

    /**
     * Extract the primary table name from a source query (best-effort)
     */
    private extractTableName(sql: string): string | null {
        const match = sql.match(/FROM\s+(base_\w+|agg_\w+)/i);
        return match ? match[1] : null;
    }

    async close() {
        if (this.duckCon) {
            try { this.duckCon.closeSync(); } catch { /* ignore */ }
        }
        this.duckCon = undefined;
        this.duckDb = undefined;
    }
}
