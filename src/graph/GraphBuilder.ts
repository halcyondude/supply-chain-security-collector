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
     * Query DuckDB and return rows as arrays
     */
    private async queryDuck(sql: string): Promise<unknown[][]> {
        const result = await this.duckCon!.run(sql);
        return await result.getRows();
    }

    /**
     * Write rows to a temp CSV, return the path.
     * LadybugDB COPY FROM CSV is the fastest bulk load path.
     */
    private writeTempCsv(headers: string[], rows: unknown[][]): string {
        const tmpPath = path.join(os.tmpdir(), `lbug_${Date.now()}_${Math.random().toString(36).slice(2)}.csv`);
        const escapeCsv = (val: unknown): string => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };
        const lines = [headers.map(escapeCsv).join(',')];
        for (const row of rows) {
            lines.push(row.map(escapeCsv).join(','));
        }
        fs.writeFileSync(tmpPath, lines.join('\n'), 'utf-8');
        return tmpPath;
    }

    /**
     * Build the graph from DuckDB data
     */
    async build(): Promise<GraphBuildResult> {
        await this.connectDuck();
        let totalNodes = 0;
        let totalRels = 0;

        // Remove existing graph DB directory (LadybugDB uses a directory)
        if (fs.existsSync(this.graphDbPath)) {
            fs.rmSync(this.graphDbPath, { recursive: true });
        }

        console.log(chalk.cyan(`\n🕸️  Building graph database: ${this.graphDbPath}\n`));

        const graphDb = new lbug.Database(this.graphDbPath);
        const graphCon = new lbug.Connection(graphDb);

        // Create node tables and load data
        for (const nodeDef of NODE_TABLES) {
            const count = await this.createAndLoadNodeTable(graphCon, nodeDef);
            totalNodes += count;
        }

        // Create relationship tables and load data
        for (const relDef of REL_TABLES) {
            const count = await this.createAndLoadRelTable(graphCon, relDef);
            totalRels += count;
        }

        console.log(chalk.green.bold(`\n✅ Graph built: ${totalNodes} nodes, ${totalRels} relationships\n`));

        return { graphDbPath: this.graphDbPath, nodeCount: totalNodes, relCount: totalRels };
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

            // Extract data from DuckDB
            const rows = await this.queryDuck(def.sourceQuery);
            if (rows.length === 0) {
                console.log(chalk.gray(`  ⓘ ${def.name}: 0 nodes (empty source)`));
                return 0;
            }

            // Write to temp CSV and COPY into graph
            const headers = def.columns.map(c => c.name);
            const tmpCsv = this.writeTempCsv(headers, rows);
            try {
                await graphCon.query(`COPY ${def.name} FROM '${tmpCsv}' (header=true)`);
                console.log(chalk.green(`  ✓ ${def.name}: ${rows.length} nodes`));
            } finally {
                fs.unlinkSync(tmpCsv);
            }

            return rows.length;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.yellow(`  ⚠ ${def.name}: ${msg.substring(0, 120)}`));
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

            // Extract relationship data from DuckDB
            const rows = await this.queryDuck(def.sourceQuery);
            if (rows.length === 0) {
                console.log(chalk.gray(`  ⓘ ${def.name}: 0 relationships (empty source)`));
                return 0;
            }

            // Write to temp CSV and COPY
            const headers = ['from', 'to', ...def.columns.map(c => c.name)];
            const tmpCsv = this.writeTempCsv(headers, rows);
            try {
                await graphCon.query(`COPY ${def.name} FROM '${tmpCsv}' (header=true)`);
                console.log(chalk.green(`  ✓ ${def.name}: ${rows.length} relationships`));
            } finally {
                fs.unlinkSync(tmpCsv);
            }

            return rows.length;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(chalk.yellow(`  ⚠ ${def.name}: ${msg.substring(0, 120)}`));
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
