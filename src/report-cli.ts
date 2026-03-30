#!/usr/bin/env node
import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { generateReport } from './ReportGenerator';

async function main() {
    const program = new Command();

    program
        .name('report')
        .description('Generate a markdown report from supply chain security analysis data')
        .requiredOption('-d, --database <path>', 'Path to DuckDB database file')
        .option('-o, --output <path>', 'Output file path (default: stdout)')
        .option('-t, --title <title>', 'Report title', 'CNCF Supply Chain Security Report')
        .action(async (options) => {
            try {
                console.log(chalk.cyan('\n📊 Generating Supply Chain Security Report...\n'));

                const report = await generateReport({
                    database: options.database,
                    output: options.output,
                    title: options.title,
                });

                if (options.output) {
                    const outputDir = path.dirname(options.output);
                    await fs.mkdir(outputDir, { recursive: true });
                    await fs.writeFile(options.output, report, 'utf-8');
                    console.log(chalk.green(`\n📄 Report written to ${options.output}`));
                } else {
                    console.log('\n' + report);
                }
            } catch (error) {
                console.error(chalk.red.bold('\n❌ Report generation failed:'), error instanceof Error ? error.message : error);
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
    process.exit(1);
});
