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
import type { RepositoryTarget, ProjectMetadata } from './config';
import { SecurityAnalyzer } from './SecurityAnalyzer';

type QueryFunction = (client: ReturnType<typeof createApiClient>, variables: { owner: string; name: string }, verbose: boolean) => Promise<unknown>;

// ============================================================================
// INPUT NORMALIZATION
// ============================================================================

/**
 * Normalize input format - convert both simple and rich formats to internal representation
 * 
 * Simple format: [{ owner: "kubernetes", name: "kubernetes" }]
 * Rich format:   [{ project_name: "Kubernetes", repos: [{owner: "kubernetes", name: "kubernetes", primary: true}], ...metadata }]
 * 
 * Output: Array of { repo: RepositoryTarget, metadata?: ProjectMetadata }
 */
function normalizeInput(
  inputData: (RepositoryTarget | ProjectMetadata)[],
  repoScope: 'primary' | 'all'
): Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }> {
  const results: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }> = [];

  for (const item of inputData) {
    // Check if it's rich format (has 'repos' field) or simple format (has only owner/name)
    if ('repos' in item && Array.isArray(item.repos)) {
      // Rich format: ProjectMetadata
      const metadata = item as ProjectMetadata;
      
      // Filter repositories based on scope
      const reposToProcess = repoScope === 'primary' 
        ? metadata.repos.filter(r => r.primary)
        : metadata.repos;

      for (const repo of reposToProcess) {
        results.push({
          repo: { owner: repo.owner, name: repo.name },
          metadata
        });
      }
    } else {
      // Simple format: RepositoryTarget
      const repo = item as RepositoryTarget;
      results.push({ repo, metadata: undefined });
    }
  }

  return results;
}

/**
 * Filter normalized input by maturity level(s)
 */
function filterByMaturity(
  normalizedInput: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }>,
  maturityLevels?: string[]
): Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }> {
  if (!maturityLevels || maturityLevels.length === 0) {
    return normalizedInput;
  }

  return normalizedInput.filter(item => {
    // If no metadata, keep it (simple format repos)
    if (!item.metadata || !item.metadata.maturity) {
      return true;
    }
    
    return maturityLevels.includes(item.metadata.maturity);
  });
}

async function main() {
  // Parse CLI arguments
  const program = new Command();
  program
    .name('graphql-data-collector')
    .description('Fetch GraphQL data and store in DuckDB with normalized tables')
    .requiredOption('-i, --input <file>', 'Input JSON file with repository targets')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-q, --queries <names...>', 'Query names to run (e.g., GetRepoDataExtendedInfo)', ['GetRepoDataExtendedInfo'])
    .option('--maturity <levels...>', 'Filter by CNCF maturity level (graduated, incubating, sandbox, archived)')
    .option('--repo-scope <scope>', 'Repository scope: primary (default) or all', 'primary')
    .option('--parallel', 'Fetch repositories in parallel', false)
    .option('--analyze', 'Run security analysis after data collection', false)
    .option('-v, --verbose', 'Verbose output', false)
    .parse(process.argv);

  const options = program.opts();
  const { 
    input, 
    output, 
    queries: queryNames, 
    maturity: maturityLevels,
    repoScope,
    parallel: useParallel, 
    analyze: runAnalysis, 
    verbose 
  } = options;

  console.log(chalk.blue.bold('🚀 GraphQL Data Collection'));
  console.log(chalk.gray('─'.repeat(50)));

  // Validate CLI options
  if (repoScope !== 'primary' && repoScope !== 'all') {
    throw new Error('--repo-scope must be either "primary" or "all"');
  }

  // Validate GitHub token
  const githubToken = process.env.GITHUB_PAT;
  if (!githubToken) {
    throw new Error('GITHUB_PAT environment variable is required');
  }

  // Setup output directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const inputBaseName = path.basename(input, path.extname(input));
  const runDir = path.join(output, `${inputBaseName}-${timestamp}`);
  await fs.mkdir(runDir, { recursive: true });

  const rawResponsesPath = path.join(runDir, 'raw-responses.jsonl');

  // Read and normalize input file
  const inputContent = await fs.readFile(input, 'utf-8');
  const rawInput: (RepositoryTarget | ProjectMetadata)[] = JSON.parse(inputContent);
  
  // Normalize input format (simple or rich) and apply filters
  let normalizedInput = normalizeInput(rawInput, repoScope as 'primary' | 'all');
  
  if (maturityLevels && maturityLevels.length > 0) {
    normalizedInput = filterByMaturity(normalizedInput, maturityLevels);
  }

  const repositories = normalizedInput.map(item => item.repo);

  console.log(chalk.cyan(`📂 Input:  ${input}`));
  console.log(chalk.cyan(`📁 Output: ${runDir}`));
  console.log(chalk.cyan(`📊 Repos:  ${repositories.length}`));
  console.log(chalk.cyan(`🔍 Queries: ${queryNames.join(', ')}`));
  if (maturityLevels && maturityLevels.length > 0) {
    console.log(chalk.cyan(`🎯 Maturity: ${maturityLevels.join(', ')}`));
  }
  console.log(chalk.cyan(`🔗 Repo Scope: ${repoScope}`));
  console.log(chalk.cyan(`⚡ Mode:   ${useParallel ? 'Parallel' : 'Sequential'}`));
  console.log(chalk.gray('─'.repeat(50)));

  // Create GraphQL client
  const client = createApiClient(githubToken);

  // Map of query names to fetch functions
  // 
  // To add a new query:
  // 1. Create a new .graphql file in src/graphql/ (e.g., GetRepoDataMetrics.graphql)
  // 2. Run `npm run codegen` to generate TypeScript types
  // 3. Add a fetch function in src/api.ts (e.g., fetchRepositoryMetrics)
  // 4. Add the mapping here: 'GetRepoDataMetrics': fetchRepositoryMetrics
  // 5. Create a normalizer in src/normalizers/ (e.g., GetRepoDataMetricsNormalizer.ts)
  // 6. Add handling in src/ArtifactWriter.ts createNormalizedTables()
  //
  const queryFunctions: Record<string, QueryFunction> = {
    'GetRepoDataExtendedInfo': fetchRepositoryExtendedInfo,
    // Legacy query - kept for compatibility, but GetRepoDataExtendedInfo is recommended
    'GetRepoDataArtifacts': fetchRepositoryArtifacts,
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
    const responseMetadata: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }> = [];
    let successCount = 0;
    let failureCount = 0;

    const fetchFn = queryFunctions[queryName];

    if (useParallel) {
      // Parallel fetching with batching to avoid rate limits
      const BATCH_SIZE = 5; // Safe default: well under GitHub's 100 concurrent limit
      const BATCH_DELAY_MS = 1000; // 1 second between batches
      
      for (let i = 0; i < repositories.length; i += BATCH_SIZE) {
        const batch = repositories.slice(i, i + BATCH_SIZE);
        const batchStart = i;
        
        const fetchPromises = batch.map(async (repo, batchIdx) => {
          const idx = batchStart + batchIdx;
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
            return { repo, data, metadata: normalizedInput[idx].metadata };
          }
          return { repo, data: null, metadata: normalizedInput[idx].metadata };
        });

        const results = await Promise.allSettled(fetchPromises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.data) {
            allResponses.push(result.value.data);
            responseMetadata.push({ repo: result.value.repo, metadata: result.value.metadata });
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
        
        // Delay between batches (except after the last batch)
        if (i + BATCH_SIZE < repositories.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    } else {
      // Sequential fetching
      for (let idx = 0; idx < repositories.length; idx++) {
        const repo = repositories[idx];
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
            responseMetadata.push({ repo, metadata: normalizedInput[idx].metadata });
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
        
        await writeArtifacts(allResponses, queryDir, queryName, responseMetadata);
        
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
