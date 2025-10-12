#!/usr/bin/env node
// neo.ts - Clean GraphQL Data Collection Tool
// Fetches GraphQL data, logs audit trail, stores in DuckDB with normalized tables

import 'dotenv/config';
import chalk from 'chalk';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createApiClient, fetchRepositoryArtifacts, fetchRepositoryExtendedInfo } from './api';
import { appendRawResponse } from './rawResponseWriter';
import { writeArtifacts } from './ArtifactWriter';
import type { RepositoryTarget } from './config';
import { SecurityAnalyzer } from './SecurityAnalyzer';

type QueryFunction = (client: ReturnType<typeof createApiClient>, variables: { owner: string; name: string }, verbose: boolean) => Promise<unknown>;

async function main() {
  // Parse CLI arguments
  const program = new Command();
  program
    .name('graphql-data-collector')
    .description('Fetch GraphQL data and store in DuckDB with normalized tables')
    .requiredOption('-i, --input <file>', 'Input JSONL file with repository targets')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-q, --queries <names...>', 'Query names to run (e.g., GetRepoDataArtifacts GetRepoDataExtendedInfo)', ['GetRepoDataArtifacts'])
    .option('--parallel', 'Fetch repositories in parallel', false)
    .option('--analyze', 'Run security analysis after data collection', false)
    .option('-v, --verbose', 'Verbose output', false)
    .parse(process.argv);

  const options = program.opts();
  const { input, output, queries: queryNames, parallel: useParallel, analyze: runAnalysis, verbose } = options;

  console.log(chalk.blue.bold('🚀 GraphQL Data Collection'));
  console.log(chalk.gray('─'.repeat(50)));

  // Validate GitHub token
  const githubToken = process.env.GITHUB_PAT;
  if (!githubToken) {
    throw new Error('GITHUB_PAT environment variable is required');
  }

  // Setup output directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const inputBase = path.basename(input, '.jsonl');
  const runDir = path.join(output, `${inputBase}-${timestamp}`);
  await fs.mkdir(runDir, { recursive: true });

  const rawResponsesPath = path.join(runDir, 'raw-responses.jsonl');

  // Read input file
  const inputContent = await fs.readFile(input, 'utf-8');
  const repositories: RepositoryTarget[] = inputContent
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  console.log(chalk.cyan(`📂 Input:  ${input}`));
  console.log(chalk.cyan(`📁 Output: ${runDir}`));
  console.log(chalk.cyan(`📊 Repos:  ${repositories.length}`));
  console.log(chalk.cyan(`🔍 Queries: ${queryNames.join(', ')}`));
  console.log(chalk.cyan(`⚡ Mode:   ${useParallel ? 'Parallel' : 'Sequential'}`));
  console.log(chalk.gray('─'.repeat(50)));

  // Create GraphQL client
  const client = createApiClient(githubToken);

  // Map of query names to fetch functions
  const queryFunctions: Record<string, QueryFunction> = {
    'GetRepoDataArtifacts': fetchRepositoryArtifacts,
    'GetRepoDataExtendedInfo': fetchRepositoryExtendedInfo,
  };

  // Validate query names
  for (const queryName of queryNames) {
    if (!queryFunctions[queryName]) {
      throw new Error(`Unknown query: ${queryName}. Available: ${Object.keys(queryFunctions).join(', ')}`);
    }
  }

  // Fetch data for each query
  for (const queryName of queryNames) {
    console.log(chalk.bold.green(`\n🔄 Fetching ${queryName}...\n`));
    const allResponses: unknown[] = [];
    let successCount = 0;
    let failureCount = 0;

    const fetchFn = queryFunctions[queryName];

    if (useParallel) {
      // Parallel fetching
      const fetchPromises = repositories.map(async (repo) => {
        if (verbose) {
          console.log(chalk.gray(`  → ${repo.owner}/${repo.name}`));
        }
        
        const data = await fetchFn(client, { owner: repo.owner, name: repo.name }, verbose);

        if (data) {
          await appendRawResponse(rawResponsesPath, {
            queryType: queryName,
            owner: repo.owner,
            repo: repo.name,
            response: data,
          });
          return { repo, data };
        }
        return { repo, data: null };
      });

      const results = await Promise.allSettled(fetchPromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.data) {
          allResponses.push(result.value.data);
          successCount++;
          if (!verbose) {
            console.log(chalk.green(`  ✓ ${result.value.repo.owner}/${result.value.repo.name}`));
          }
        } else if (result.status === 'fulfilled') {
          failureCount++;
          console.log(chalk.red(`  ✗ ${result.value.repo.owner}/${result.value.repo.name}`));
        } else {
          failureCount++;
          console.log(chalk.red(`  ✗ Error: ${result.reason?.message || 'Unknown error'}`));
        }
      }
    } else {
      // Sequential fetching
      for (const repo of repositories) {
        if (verbose) {
          console.log(chalk.gray(`  → ${repo.owner}/${repo.name}`));
        }

        try {
          const data = await fetchFn(client, { owner: repo.owner, name: repo.name }, verbose);

          if (data) {
            await appendRawResponse(rawResponsesPath, {
              queryType: queryName,
              owner: repo.owner,
              repo: repo.name,
              response: data,
            });
            allResponses.push(data);
            successCount++;
            if (!verbose) {
              console.log(chalk.green(`  ✓ ${repo.owner}/${repo.name}`));
            }
          } else {
            failureCount++;
            console.log(chalk.red(`  ✗ ${repo.owner}/${repo.name}`));
          }
        } catch (error) {
          failureCount++;
          console.log(chalk.red(`  ✗ ${repo.owner}/${repo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    }

    console.log(chalk.gray('\n' + '─'.repeat(50)));
    console.log(chalk.bold(`📈 ${queryName}: ${chalk.green(successCount.toString())} success, ${chalk.red(failureCount.toString())} failed`));

    // Create DuckDB database with normalized tables for this query
    if (allResponses.length > 0) {
      console.log(chalk.bold.green('\n📊 Creating DuckDB database...\n'));
      
      try {
        // Create subdirectory for this query to avoid table name conflicts
        const queryDir = path.join(runDir, queryName);
        await fs.mkdir(queryDir, { recursive: true });
        
        await writeArtifacts(allResponses, queryDir, queryName);
        
        console.log(chalk.green('  ✓ Database created'));
        console.log(chalk.green('  ✓ Parquet files exported'));
      } catch (error) {
        console.error(chalk.red('\n❌ Database creation failed:'), error);
        throw error;
      }
    } else {
      console.log(chalk.yellow('\n⚠  No data collected for this query, skipping database creation'));
    }
  }

  // Summary
  console.log(chalk.gray('\n' + '─'.repeat(50)));
  console.log(chalk.blue.bold('✨ Complete\n'));
  console.log(chalk.gray('Output:'));
  console.log(chalk.gray(`  Directory: ${runDir}`));
  console.log(chalk.gray(`  Audit log: raw-responses.jsonl`));
  if (queryNames.length > 0) {
    console.log(chalk.gray(`  Databases: ${queryNames.length} query types`));
    for (const queryName of queryNames) {
      console.log(chalk.gray(`    - ${queryName}/database.db`));
      console.log(chalk.gray(`    - ${queryName}/parquet/`));
    }
  }
  console.log();

  // Run analysis if requested
  if (runAnalysis) {
    console.log(chalk.gray('\n' + '─'.repeat(50)));
    
    // Run analysis on each database
    for (const queryName of queryNames) {
      const dbPath = path.join(runDir, queryName, 'database.db');
      
      console.log(chalk.bold.cyan(`\n🔍 Analyzing ${queryName}...\n`));
      
      try {
        const analyzer = new SecurityAnalyzer(dbPath);
        await analyzer.analyze();
        await analyzer.close();
      } catch (error) {
        console.error(chalk.yellow(`  ⚠ Analysis failed for ${queryName}: ${error instanceof Error ? error.message : error}`));
        console.log(chalk.gray('  (This is expected if workflow data is not available)'));
      }
    }
  }
}

main().catch((error) => {
  console.error(chalk.red.bold('\n❌ Fatal Error:'), error.message);
  if (error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
});
