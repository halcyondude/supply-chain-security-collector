import { DuckDBInstance } from '@duckdb/node-api';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { installAndLoadExtensions } from './duckdb-extensions';

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

    private async getAndLogTableRowCount(tableName: string) {
        try {
            const countResult = await this.con!.run(`SELECT COUNT(*) FROM ${tableName}`);
            const countRows = await countResult.getRows();
            const rawCount = countRows[0]?.[0];
            const rowCount = Number(rawCount || 0);
            const checkbox = rowCount > 0 ? chalk.green('✓') : chalk.yellow('ⓘ');

            // Fetch column names and types
            const schemaResult = await this.con!.run(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = '${tableName}'
                ORDER BY ordinal_position
            `);
            const schemaRows = await schemaResult.getRows();

            // Print table name in green, with checkbox and row count
            console.log(chalk.green(`  ${checkbox} ${tableName}: ${rowCount} row(s)`));
            // Print each column indented (4 spaces), in gray, one per line
            // Find max column name length for alignment
            const maxColLen = schemaRows.reduce((max, [colName]) => Math.max(max, String(colName).length), 0);
            for (const [colName, colType] of schemaRows) {
                const paddedCol = String(colName).padEnd(maxColLen + 2); // 2 spaces after colon
                console.log(chalk.gray(`    ${' '.repeat(4)}${paddedCol}: ${colType}`));
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.log(chalk.red(`  ✗ ${tableName}: (error getting row count: ${errorMsg})`));
        }
    }

    /**
     * Create or replace a table and log the result with row count and checkbox
     */
    private async createOrReplaceTableWithLog(tableSql: string, tableName: string) {
        await this.connect();
        try {
            await this.con!.run(tableSql);
            await this.getAndLogTableRowCount(tableName);
        } catch (err) {
            console.log(chalk.red(`  ✗ ${tableName}: (error creating or counting rows)`));
        }
    }

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
            await installAndLoadExtensions(this.con);
        }
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

        // Run analysis models with robust error handling
        const models = [
            '00_initialize_indexes.sql',
            '01_artifact_analysis.sql',
            '01a_security_insights_flattener.sql',
            '02_workflow_tool_detection.sql',
            '03_repository_security_summary.sql',
            '04_summary_views.sql',
            '05_cncf_project_analysis.sql'
        ];

        for (const model of models) {
            try {
                await this.runModel(model);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(chalk.yellow(`    ⚠ Skipped ${model} due to error: ${errorMsg.substring(0, 100)}...`));
                // Continue to next model
            }
        }

        console.log(chalk.green.bold('\n✅ Analysis complete!\n'));
        
        // Export SBOMs and Attestations to CSV
        console.log(chalk.cyan('📄 Exporting Security Insights to CSV...'));
        const outputDir = path.dirname(this.dbPath);
        
        // Export SBOMs
        try {
            const sbomCsvPath = path.join(outputDir, 'security-insights-sboms.csv');
            await this.con!.run(`
                COPY (
                    SELECT 
                        SPLIT_PART(source_url, '/', 4) as owner,
                        SPLIT_PART(source_url, '/', 5) as repo,
                        source_url,
                        fetched_at,
                        schema_version,
                        last_updated,
                        repository_url,
                        project_name,
                        sbom_format,
                        sbom_file,
                        sbom_url,
                        sbom_comment
                    FROM base_si_sboms
                    ORDER BY owner, repo
                ) TO '${sbomCsvPath}' (HEADER, DELIMITER ',');
            `);
            console.log(chalk.green(`  ✓ Exported SBOMs to ${path.basename(sbomCsvPath)}`));
        } catch {
            console.log(chalk.gray(`  ⓘ No SBOMs to export`));
        }
        
        // Export Attestations
        try {
            const attestationCsvPath = path.join(outputDir, 'security-insights-attestations.csv');
            await this.con!.run(`
                COPY (
                    SELECT 
                        SPLIT_PART(source_url, '/', 4) as owner,
                        SPLIT_PART(source_url, '/', 5) as repo,
                        source_url,
                        fetched_at,
                        schema_version,
                        last_updated,
                        repository_url,
                        project_name,
                        attestation_source,
                        attestation_name,
                        attestation_location,
                        attestation_predicate_uri,
                        attestation_comment
                    FROM agg_si_attestations
                    ORDER BY owner, repo, attestation_source
                ) TO '${attestationCsvPath}' (HEADER, DELIMITER ',');
            `);
            console.log(chalk.green(`  ✓ Exported attestations to ${path.basename(attestationCsvPath)}`));
        } catch {
            console.log(chalk.gray(`  ⓘ No attestations to export`));
        }
        
        // Show summary
        await this.showSummary();

        // List all created tables (agg_*, base_*) and show row counts for key tables
        console.log(chalk.gray('\nVerifying tables...'));
        const allTablesResult = await this.con!.run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name");
        const allTables = await allTablesResult.getRows().then(rows => rows.map(r => r[0]));
        if (allTables.length === 0) {
            console.log(chalk.red('No analysis tables created!'));
        } else {
            console.log(chalk.gray(`Created analysis tables:`));
            // Gather all schemas first
            const tableSchemas: Array<{tableName: string, rowCount: number, schemaRows: Array<[string, string]>, checkbox: string}> = [];
            let globalMaxColLen = 0;
            for (const tbl of allTables) {
                const tableName = typeof tbl === 'string' ? tbl : (tbl ?? '').toString();
                try {
                    const countResult = await this.con!.run(`SELECT COUNT(*) FROM ${tableName}`);
                    const countRows = await countResult.getRows();
                    const rawCount = countRows[0]?.[0];
                    const rowCount = Number(rawCount || 0);
                    const checkbox = rowCount > 0 ? chalk.green('✓') : chalk.yellow('ⓘ');
                    const schemaResult = await this.con!.run(`
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_name = '${tableName}'
                        ORDER BY ordinal_position
                    `);
                    let schemaRowsRaw = await schemaResult.getRows();
                    // Only keep rows with exactly two elements (column name and type)
                    const schemaRows: [string, string][] = schemaRowsRaw.filter(row => row.length === 2) as [string, string][];
                    // Update global max column name length
                    for (const [colName] of schemaRows) {
                        globalMaxColLen = Math.max(globalMaxColLen, String(colName).length);
                    }
                    tableSchemas.push({tableName, rowCount, schemaRows, checkbox});
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    tableSchemas.push({tableName, rowCount: 0, schemaRows: [], checkbox: chalk.red('✗') + ` (error getting row count: ${errorMsg})`});
                }
            }
            // Print all tables with global alignment
            for (const {tableName, rowCount, schemaRows, checkbox} of tableSchemas) {
                if (schemaRows.length === 0) {
                    console.log(chalk.red(`  ✗ ${tableName}: (error or no columns)`));
                    continue;
                }
                console.log(chalk.green(`  ${checkbox} ${tableName}: ${rowCount} row(s)`));
                for (const [colName, colType] of schemaRows) {
                    const paddedCol = String(colName).padEnd(globalMaxColLen + 2);
                    console.log(chalk.gray(`    ${' '.repeat(4)}${paddedCol}: ${colType}`));
                }
            }
        }
        console.log(chalk.gray('    Checkpoint complete'));
        console.log(chalk.gray('    Connection closed'));
    }

    /**
     * Drop all aggregate tables (agg_*) and views
     */
    private async dropAggregateTables() {
        await this.connect();
        
        // Drop views first (they may depend on tables)
        const viewResult = await this.con!.run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'VIEW' AND table_name LIKE 'agg_%'");
        const views = await viewResult.getRows();
        for (const row of views) {
            const viewName = row[0];
            console.log(chalk.gray(`    Dropping view ${viewName}...`));
            await this.con!.run(`DROP VIEW IF EXISTS ${viewName}`);
        }
        
        // Then drop tables
        const tableResult = await this.con!.run("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' AND table_name LIKE 'agg_%'");
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
            
            // Just run the entire SQL file - DuckDB handles it
            await this.con!.run(sql);
            
            console.log(chalk.green(`    ✓ Completed`));
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Only handle missing table errors gracefully
            if (errorMsg.includes('does not exist') || errorMsg.includes('Catalog Error')) {
                console.log(chalk.gray(`    ⓘ Skipped - required tables not present` + errorMsg));
            } else {
                // Log other errors but don't abort
                console.log(chalk.yellow(`    ⚠ Warning: ${errorMsg.substring(0, 200)}`));
            }
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
