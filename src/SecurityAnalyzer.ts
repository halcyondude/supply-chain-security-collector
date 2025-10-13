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
            await this.initializeExtensions();
        }
    }

    /**
     * Initialize DuckDB extensions for enhanced functionality
     */
    private async initializeExtensions() {
        console.log(chalk.gray('  Loading DuckDB extensions...'));
        
        // Full-text search for workflow content and descriptions
        await this.con!.run("INSTALL fts; LOAD fts;");
        console.log(chalk.gray('    ✓ fts (Full-Text Search)'));
        
        // Enhanced JSON processing for API responses and security features
        await this.con!.run("INSTALL json; LOAD json;");
        console.log(chalk.gray('    ✓ json (JSON Processing)'));
    }

    /**
     * Run the complete security analysis pipeline
     */
    async analyze(recreate: boolean = false) {
        await this.connect();
        
        console.log(chalk.bold.cyan('\n🔍 Running Security Analysis...\n'));

        // Drop existing agg_ tables if recreate is true
        if (recreate) {
            console.log(chalk.yellow('  Dropping existing aggregate tables...'));
            await this.dropAggregateTables();
            console.log(chalk.green('  ✓ Dropped existing tables\n'));
        }

        // Create indexes (including FTS indexes)
        await this.runModel('00_initialize_indexes.sql');

        // Run analysis models in dependency order
        await this.runModel('01_artifact_analysis.sql');
        await this.runModel('02_workflow_tool_detection.sql');
        await this.runModel('03_repository_security_summary.sql');
        await this.runModel('04_summary_views.sql');
        
        // CNCF-specific analysis (gracefully skips if base_cncf_projects doesn't exist)
        await this.runModel('05_cncf_project_analysis.sql');

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
     * Drop all aggregate tables (agg_*) and views
     */
    private async dropAggregateTables() {
        await this.connect();
        
        // Drop views first (they may depend on tables)
        const viewResult = await this.con!.run("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'agg_%'");
        const views = await viewResult.getRows();
        for (const row of views) {
            const viewName = row[0];
            console.log(chalk.gray(`    Dropping view ${viewName}...`));
            await this.con!.run(`DROP VIEW IF EXISTS ${viewName}`);
        }
        
        // Then drop tables
        const tableResult = await this.con!.run("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agg_%'");
        const tables = await tableResult.getRows();
        for (const row of tables) {
            const tableName = row[0];
            console.log(chalk.gray(`    Dropping table ${tableName}...`));
            await this.con!.run(`DROP TABLE IF EXISTS ${tableName}`);
        }
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
     * Show analysis summary with comprehensive tool detection stats
     */
    private async showSummary() {
        try {
            // Get repository summary
            const summaryQuery = `
                SELECT 
                    COUNT(*) as total_repos,
                    SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
                    SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) as repos_with_signatures,
                    SUM(CASE WHEN has_attestation_artifact THEN 1 ELSE 0 END) as repos_with_attestations
                FROM agg_repo_summary
            `;
            
            const result = await this.con!.run(summaryQuery);
            const rows = await result.getRows();
            
            if (rows.length > 0) {
                const [total_repos, repos_with_sbom, repos_with_signatures, repos_with_attestations] = rows[0];
                
                console.log(chalk.bold('Repository Artifacts:'));
                console.log(chalk.gray(`  Total repositories: ${total_repos}`));
                console.log(chalk.gray(`  With SBOM artifacts: ${repos_with_sbom} (${Math.round(100 * Number(repos_with_sbom) / Number(total_repos))}%)`));
                console.log(chalk.gray(`  With signature artifacts: ${repos_with_signatures} (${Math.round(100 * Number(repos_with_signatures) / Number(total_repos))}%)`));
                console.log(chalk.gray(`  With attestation artifacts: ${repos_with_attestations} (${Math.round(100 * Number(repos_with_attestations) / Number(total_repos))}%)`));
            }

            // Get tool detection stats by category
            const toolStatsQuery = `
                SELECT 
                    tool_category,
                    COUNT(DISTINCT repository_id) as repo_count,
                    COUNT(DISTINCT tool_name) as unique_tools,
                    COUNT(*) as total_detections
                FROM agg_workflow_tools
                GROUP BY tool_category
                ORDER BY repo_count DESC
            `;
            
            const toolResult = await this.con!.run(toolStatsQuery);
            const toolRows = await toolResult.getRows();
            
            if (toolRows.length > 0) {
                console.log(chalk.bold('\nCI/CD Security Tools Detected:'));
                for (const row of toolRows) {
                    const [category, repoCount, uniqueTools, totalDetections] = row;
                    const categoryLabel = String(category).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    console.log(chalk.cyan(`  ${categoryLabel}:`), 
                        chalk.gray(`${repoCount} repos, ${uniqueTools} unique tools, ${totalDetections} workflow detections`));
                }
            }

            // Get specific tool usage (all tools)
            const specificToolsQuery = `
                SELECT 
                    tool_name,
                    COUNT(DISTINCT repository_id) as repo_count
                FROM agg_workflow_tools
                GROUP BY tool_name
                ORDER BY repo_count DESC, tool_name
            `;
            
            const specificResult = await this.con!.run(specificToolsQuery);
            const specificRows = await specificResult.getRows();
            
            if (specificRows.length > 0) {
                console.log(chalk.bold('\nAll Detected Tools:'));
                for (const row of specificRows) {
                    const [toolName, repoCount] = row;
                    console.log(chalk.gray(`  ${String(toolName).padEnd(25)} ${repoCount} repos`));
                }
            }

        } catch (error) {
            console.log(chalk.yellow('  (Summary query failed)'), error instanceof Error ? error.message : error);
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
