#!/usr/bin/env node
// analyze.ts - CLI tool for running security analysis on collected data
// This is the domain-specific analysis layer on top of generic data collection

import 'dotenv/config';
import chalk from 'chalk';
import { Command } from 'commander';
import { SecurityAnalyzer } from './SecurityAnalyzer';

async function main() {
    const program = new Command();
    
    program
        .name('analyze')
        .description('Analyze GitHub repository data for supply chain security signals')
        .requiredOption('-d, --database <path>', 'Path to DuckDB database file to analyze')
        .option('-q, --query <path>', 'Run a specific SQL query file instead of full analysis')
        .option('--export-csv <path>', 'Export agg_repo_summary to CSV file')
        .action(async (options) => {
            try {
                const analyzer = new SecurityAnalyzer(options.database);
                
                if (options.query) {
                    // Run specific query
                    console.log(chalk.cyan(`\n📊 Running query: ${options.query}\n`));
                    const results = await analyzer.runQuery(options.query);
                    
                    if (results.length === 0) {
                        console.log(chalk.yellow('No results returned.'));
                    } else {
                        // Display results as table
                        console.table(results);
                    }
                } else {
                    // Run full analysis
                    await analyzer.analyze();
                    
                    // Export to CSV if requested
                    if (options.exportCsv) {
                        console.log(chalk.cyan(`\n📄 Exporting to CSV: ${options.exportCsv}\n`));
                        await analyzer.executeSql(`
                            COPY agg_repo_summary 
                            TO '${options.exportCsv}' 
                            (HEADER, DELIMITER ',')
                        `);
                        console.log(chalk.green(`✓ Exported to ${options.exportCsv}`));
                    }
                }
                
                await analyzer.close();
                
            } catch (error) {
                console.error(chalk.red.bold('\n❌ Analysis failed:'), error instanceof Error ? error.message : error);
                if (error instanceof Error && error.stack) {
                    console.error(chalk.gray(error.stack));
                }
                process.exit(1);
            }
        });
    
    program.parse();
}

main().catch((error) => {
    console.error(chalk.red.bold('\n❌ Fatal error:'), error.message);
    if (error.stack) {
        console.error(chalk.gray(error.stack));
    }
    process.exit(1);
});
