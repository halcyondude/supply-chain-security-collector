// src/main.ts
// GraphQL Data Collection Tool
// Fetches data from GraphQL APIs, logs audit trail, stores in DuckDB with normalized tables

import 'dotenv/config';
import chalk from 'chalk';
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createApiClient } from './api';
import { appendRawResponse } from './rawResponseWriter';
import { writeArtifacts } from './ArtifactWriter';
import type { RepositoryTarget } from './config';
import {
  type GetRepoDataArtifactsQuery,
  type GetRepoDataExtendedInfoQuery,
  GetRepoDataArtifactsDocument,
  GetRepoDataExtendedInfoDocument,
} from './generated/graphql';

/**
 * Fetch GraphQL data for a single repository
 */
async function fetchRepoData(
  repo: RepositoryTarget,
  client: ReturnType<typeof createApiClient> | null,
  useMock: boolean,
  useExtended: boolean,
  verbose: boolean
): Promise<GetRepoDataArtifactsQuery | GetRepoDataExtendedInfoQuery | null> {
  try {
    if (verbose) {
      console.log(chalk.gray(`  Fetching: ${repo.owner}/${repo.name}`));
    }

    if (useMock) {
      // Mock mode: read from stored responses
      const mockDir = path.join(process.cwd(), 'mocks', 'responses');
      const filename = `${repo.owner}_${repo.name}.json`;
      const mockPath = path.join(mockDir, filename);
      
      try {
        const mockData = await fs.readFile(mockPath, 'utf-8');
        return JSON.parse(mockData);
      } catch {
        console.error(chalk.red(`  ❌ Mock file not found: ${filename}`));
        return null;
      }
    }

    // Live mode: fetch from GraphQL API
    if (!client) {
      throw new Error('GraphQL client not initialized');
    }

    const queryDocument = useExtended
      ? GetRepoDataExtendedInfoDocument
      : GetRepoDataArtifactsDocument;

    const result = await client.request(queryDocument, {
      owner: repo.owner,
      name: repo.name,
    });

    return result as GetRepoDataArtifactsQuery | GetRepoDataExtendedInfoQuery;
  } catch (error) {
    console.error(chalk.red(`  ❌ Error fetching ${repo.owner}/${repo.name}:`), error);
    return null;
  }
}

/**
 * Main execution function
 */
async function main() {
  const program = new Command();
  program
    .name('graphql-data-collector')
    .description('Fetch GraphQL data and store in DuckDB with normalized tables')
    .requiredOption('-i, --input <file>', 'Input JSONL file with repository targets')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('--mock', 'Use mock data instead of live API calls', false)
    .option('--extended', 'Use extended query (GetRepoDataExtendedInfo)', false)
    .option('--parallel', 'Fetch repositories in parallel', false)
    .option('-v, --verbose', 'Verbose output', false)
    .parse(process.argv);

  const options = program.opts();
  const { input, output, mock: useMock, extended: useExtended, parallel: useParallel, verbose } = options;

  console.log(chalk.blue.bold('🚀 Starting GraphQL Data Collection...'));
  
  // Setup output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const inputBase = path.basename(input, '.jsonl');
  const runDir = path.join(output, `${inputBase}-${timestamp}`);
  await fs.mkdir(runDir, { recursive: true });

  const rawResponsesPath = path.join(runDir, 'raw-responses.jsonl');

  // Read input file (JSONL format)
  const inputContent = await fs.readFile(input, 'utf-8');
  const repositories: RepositoryTarget[] = inputContent
    .trim()
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  console.log(chalk.cyan(`📂 Input: ${input} (${repositories.length} repositories)`));
  console.log(chalk.cyan(`📁 Output: ${runDir}`));
  console.log(chalk.cyan(`🔧 Mode: ${useMock ? 'Mock' : 'Live API'}`));
  console.log(chalk.cyan(`📊 Query: ${useExtended ? 'GetRepoDataExtendedInfo' : 'GetRepoDataArtifacts'}`));

  // Create GraphQL client (if not using mocks)
  let client: ReturnType<typeof createApiClient> | null = null;
  if (!useMock) {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is required for live API calls');
    }
    client = createApiClient(githubToken);
  }

  const queryType = useExtended ? 'GetRepoDataExtendedInfo' : 'GetRepoDataArtifacts';
  const allGraphQLResponses: (GetRepoDataArtifactsQuery | GetRepoDataExtendedInfoQuery)[] = [];

  // Fetch data
  console.log(chalk.bold.green(`\n🔄 Fetching data...`));

  if (useParallel) {
    // Parallel fetching
    const promises = repositories.map((repo) =>
      fetchRepoData(repo, client, useMock, useExtended, verbose)
    );
    
    const results = await Promise.allSettled(promises);
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const repo = repositories[i];
      
      if (result.status === 'fulfilled' && result.value) {
        allGraphQLResponses.push(result.value);
        
        // Log to audit trail
        await appendRawResponse(rawResponsesPath, {
          queryType,
          owner: repo.owner,
          repo: repo.name,
          response: result.value,
        });
      }
    }
  } else {
    // Sequential fetching
    for (const repo of repositories) {
      const repoData = await fetchRepoData(repo, client, useMock, useExtended, verbose);
      
      if (repoData) {
        allGraphQLResponses.push(repoData);
        
        // Log to audit trail
        await appendRawResponse(rawResponsesPath, {
          queryType,
          owner: repo.owner,
          repo: repo.name,
          response: repoData,
        });
      }
    }
  }

  console.log(chalk.green(`✓ Fetched ${allGraphQLResponses.length}/${repositories.length} repositories`));

  // Create DuckDB database with normalized tables
  if (allGraphQLResponses.length > 0) {
    console.log(chalk.bold.green(`\n📊 Creating DuckDB database with normalized tables...`));
    
    try {
      await writeArtifacts(
        allGraphQLResponses,
        runDir,
        queryType
      );
      console.log(chalk.green(`✓ Database created: ${runDir}/database.db`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to create database:'), error);
      throw error;
    }
  } else {
    console.log(chalk.yellow('⚠ No data collected, skipping database creation'));
  }

  console.log(chalk.blue.bold('\n✨ Collection complete.'));
  console.log(chalk.gray(`\nOutput directory: ${runDir}`));
  console.log(chalk.gray(`Audit log: ${rawResponsesPath}`));
  console.log(chalk.gray(`Database: ${runDir}/database.db`));
  console.log(chalk.gray(`Parquet files: ${runDir}/parquet/`));
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
  process.exit(1);
});
