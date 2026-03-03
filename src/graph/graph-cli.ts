#!/usr/bin/env node
import 'dotenv/config';
import * as fs from 'fs';
import chalk from 'chalk';
import { Command } from 'commander';
import { GraphBuilder } from './GraphBuilder';
import { CYPHER_QUERIES, getQuery, listQueries } from './queries';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lbug = require('lbug');

async function main() {
    const program = new Command();

    program
        .name('graph')
        .description('Build and query a LadybugDB property graph from DuckDB data');

    program
        .command('build')
        .description('Build graph database from DuckDB')
        .requiredOption('-d, --database <path>', 'Path to DuckDB database file')
        .option('-o, --output <path>', 'Output graph database path')
        .action(async (options) => {
            try {
                const builder = new GraphBuilder(options.database, options.output);
                const result = await builder.build();
                console.log(chalk.green(`Graph database: ${result.graphDbPath}`));
                await builder.close();
            } catch (error) {
                console.error(chalk.red.bold('\n❌ Graph build failed:'), error instanceof Error ? error.message : error);
                process.exit(1);
            }
        });

    program
        .command('query')
        .description('Run a Cypher query against the graph')
        .requiredOption('-g, --graph <path>', 'Path to LadybugDB graph database')
        .option('-n, --name <name>', 'Name of a built-in query to run')
        .option('-c, --cypher <cypher>', 'Cypher query string to execute')
        .option('-f, --file <path>', 'Path to a .cypher file to execute')
        .action(async (options) => {
            try {
                let cypher: string;

                if (options.name) {
                    const q = getQuery(options.name);
                    if (!q) {
                        console.log(chalk.red(`Unknown query: ${options.name}`));
                        console.log(chalk.cyan('\nAvailable queries:'));
                        for (const name of listQueries()) {
                            console.log(chalk.gray(`  ${name}`));
                        }
                        process.exit(1);
                    }
                    console.log(chalk.cyan(`\n📊 Running: ${q.description}\n`));
                    cypher = q.cypher;
                } else if (options.file) {
                    cypher = fs.readFileSync(options.file, 'utf-8').trim();
                    console.log(chalk.cyan(`\n📊 Running query from ${options.file}\n`));
                } else if (options.cypher) {
                    cypher = options.cypher;
                } else {
                    console.log(chalk.yellow('Specify --name, --cypher, or --file'));
                    console.log(chalk.cyan('\nAvailable built-in queries:'));
                    for (const name of listQueries()) {
                        console.log(chalk.gray(`  ${name}`));
                    }
                    process.exit(1);
                }

                const graphDb = new lbug.Database(options.graph);
                const graphCon = new lbug.Connection(graphDb);
                const result = await graphCon.query(cypher);
                const rows = await result.getAll();

                if (rows.length === 0) {
                    console.log(chalk.yellow('No results.'));
                } else {
                    console.table(rows);
                    console.log(chalk.gray(`\n${rows.length} row(s)`));
                }
            } catch (error) {
                console.error(chalk.red.bold('\n❌ Query failed:'), error instanceof Error ? error.message : error);
                process.exit(1);
            }
        });

    program
        .command('list')
        .description('List available built-in Cypher queries')
        .action(() => {
            console.log(chalk.cyan('\nAvailable Cypher queries:\n'));
            for (const q of CYPHER_QUERIES) {
                console.log(chalk.bold(`  ${q.name}`));
                console.log(chalk.gray(`    ${q.description}`));
                console.log(chalk.gray(`    ${q.cypher.split('\n')[0]}...`));
                console.log();
            }
        });

    program.parse();
}

main().catch((error) => {
    console.error(chalk.red.bold('\n❌ Fatal error:'), error.message);
    process.exit(1);
});
