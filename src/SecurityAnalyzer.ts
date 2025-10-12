import { DuckDBInstance } from '@duckdb/node-api';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

/**
 * SecurityAnalyzer - Domain-specific analyzer for GitHub supply chain security
 * 
 * This class runs SQL-based analysis on collected repository data to identify
 * security practices, tool usage, and artifact patterns.
 * 
 * Runs analysis models in order:
 * 1. artifact_analysis - Pattern matching on release assets
 * 2. workflow_tool_detection - CI/CD tool detection in workflows
 * 3. repository_security_summary - Aggregated repository-level metrics
 */
type DuckDBConnection = Awaited<ReturnType<DuckDBInstance['connect']>>;

export class SecurityAnalyzer {
    private dbPath: string;
    private db?: DuckDBInstance;
    private con?: DuckDBConnection;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    /**
     * Initialize database connection
     */
    private async connect() {
        if (!this.db) {
            this.db = await DuckDBInstance.create(this.dbPath);
            this.con = await this.db.connect();
        }
    }

    /**
     * Run the complete security analysis pipeline
     */
    async analyze() {
        await this.connect();
        
        console.log(chalk.bold.cyan('\n🔍 Running Security Analysis...\n'));

        // Run models in dependency order
        await this.runModel('01_artifact_analysis.sql');
        await this.runModel('02_workflow_tool_detection.sql');
        await this.runModel('03_repository_security_summary.sql');

        console.log(chalk.green.bold('\n✅ Analysis complete!\n'));
        
        // Show summary
        await this.showSummary();
        
        // Verify tables were created
        console.log(chalk.gray('\nVerifying tables...'));
        const result = await this.con!.run("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agg_%' ORDER BY name");
        const tables = await result.getRows();
        console.log(chalk.gray(`Created ${tables.length} aggregate analysis tables`));
    }

    /**
     * Run a specific SQL query file and return results
     */
    async runQuery(queryPath: string): Promise<unknown[][]> {
        await this.connect();
        
        const sql = await fs.readFile(queryPath, 'utf-8');
        const result = await this.con!.run(sql);
        
        return await result.getRows();
    }

    /**
     * Execute SQL directly (not from a file)
     */
    async executeSql(sql: string): Promise<unknown[][]> {
        await this.connect();
        
        const result = await this.con!.run(sql);
        return await result.getRows();
    }

    /**
     * Run a single SQL model file
     */
    private async runModel(filename: string) {
        const modelPath = path.join(__dirname, '../sql/models', filename);
        
        console.log(chalk.cyan(`  Running ${filename}...`));
        
        try {
            const sql = await fs.readFile(modelPath, 'utf-8');
            
            // Use DuckDB's extractStatements API to properly handle multi-statement SQL
            const extracted = await this.con!.extractStatements(sql);
            const statementCount = extracted.count;
            
            // Execute each statement in order
            for (let i = 0; i < statementCount; i++) {
                const prepared = await extracted.prepare(i);
                const result = await prepared.run();
                
                // If this looks like a validation SELECT (contains '✓'), show results
                const statementText = sql.split(';')[i]?.trim() || '';
                if (statementText.toUpperCase().startsWith('SELECT') && statementText.includes('✓')) {
                    const rows = await result.getRows();
                    if (rows.length > 0) {
                        const firstRow = rows[0];
                        if (firstRow.length > 0 && typeof firstRow[0] === 'string') {
                            console.log(chalk.green(`    ${firstRow[0]}`));
                            // Show remaining values
                            for (let j = 1; j < firstRow.length; j++) {
                                console.log(chalk.gray(`      ${firstRow[j]}`));
                            }
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error(chalk.red(`    ✗ Failed: ${error instanceof Error ? error.message : error}`));
            throw error;
        }
    }

    /**
     * Show analysis summary
     */
    private async showSummary() {
        try {
            const summaryQuery = `
                SELECT 
                    COUNT(*) as total_repos,
                    SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
                    SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) as repos_with_signatures,
                    SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) as repos_with_cosign,
                    SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) as repos_with_syft,
                    ROUND(AVG(security_maturity_score), 2) as avg_maturity_score
                FROM agg_repo_summary
            `;
            
            const result = await this.con!.run(summaryQuery);
            const rows = await result.getRows();
            
            if (rows.length > 0) {
                const [total_repos, repos_with_sbom, repos_with_signatures, repos_with_cosign, repos_with_syft, avg_maturity_score] = rows[0];
                
                console.log(chalk.bold('Summary:'));
                console.log(chalk.gray(`  Total repositories: ${total_repos}`));
                console.log(chalk.gray(`  With SBOMs: ${repos_with_sbom} (${Math.round(100 * Number(repos_with_sbom) / Number(total_repos))}%)`));
                console.log(chalk.gray(`  With signatures: ${repos_with_signatures} (${Math.round(100 * Number(repos_with_signatures) / Number(total_repos))}%)`));
                console.log(chalk.gray(`  Using Cosign: ${repos_with_cosign}`));
                console.log(chalk.gray(`  Using Syft: ${repos_with_syft}`));
                console.log(chalk.gray(`  Average maturity score: ${avg_maturity_score}/10`));
            }
        } catch {
            console.log(chalk.yellow('  (Summary query failed - may need workflow data)'));
        }
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.con) {
            try {
                // Force DuckDB to write all pending changes to disk
                // CHECKPOINT synchronizes WAL to the database file
                await this.con.run('CHECKPOINT');
                console.log(chalk.gray('    Checkpoint complete'));
                
                // Explicitly close the connection
                this.con.closeSync();
                console.log(chalk.gray('    Connection closed'));
            } catch (error) {
                console.error(chalk.yellow('    Warning: Could not checkpoint/close database'), error);
            }
        }
        this.con = undefined;
        this.db = undefined;
    }
}
