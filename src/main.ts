
// Load environment variables from .env (for GITHUB_PAT, etc.)
import 'dotenv/config';
// GraphQLClient is used for making requests to the GitHub GraphQL API
import { GraphQLClient } from 'graphql-request';
// NodeCache provides in-memory caching for API responses (24h TTL)
import NodeCache from 'node-cache';
// Chalk is used for colored CLI output
import chalk from 'chalk';

// Import generated GraphQL query document helper
import { gql } from './generated/gql';
// Import repository config and type
import { repositories, RepositoryTarget } from './config';
// Import the main analysis logic for extracting supply chain signals
import { analyzeRepositoryData } from './analysis';
// Import the generated GraphQL types for type safety
import { GetRepoDataQuery } from './generated/graphql';
// Import report generation logic (JSON/CSV)
import { generateReports } from './report';
// Import mock data for offline/mock mode
import { mockRepoData } from './mockData';

// Initialize cache with a 24-hour TTL (used only in real API mode)
const cache = new NodeCache({ stdTTL: 86400 });


/**
 * Main entry point for the CLI tool.
 * Handles environment setup, repository iteration, data fetching (mock or real),
 * analysis, and report generation.
 */
async function main() {
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

  // Determine if mock mode is enabled (bypasses real API calls)
  const useMock = process.env.MOCK_GITHUB === '1';
  if (useMock) {
    console.log(chalk.magenta.bold('🧪 MOCK MODE ENABLED: Using mock GitHub data.'));
  }

  // Initialize GraphQL client for real API mode
  let client: GraphQLClient | null = null;
  if (!useMock) {
    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      // Fail fast if no PAT is set
      console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
      process.exit(1);
    }
    client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${githubPat}`,
      },
    });
  }

  // Collect all analysis results for reporting
  const allAnalysisResults = [];

  // The Repository type matches the GraphQL schema for type safety
  type Repository = GetRepoDataQuery['repository'];
  for (const repo of repositories) {
    // Each repo is identified by owner/name (e.g., sigstore/cosign)
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    // repoData will hold the GraphQL response for this repo
    let repoData: { repository: Repository } | null = null;
    if (useMock) {
      // In mock mode, look up static data by key (owner_name)
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_') as keyof typeof mockRepoData;
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        // Warn and skip if no mock data is available
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      // In real mode, check cache first to avoid redundant API calls
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData as { repository: Repository };
      } else {
        // Build and execute the GraphQL query for this repo
        console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
        try {
          // The query is defined in src/graphql/GetRepoData.graphql and codegen'd
          const document = gql(`query GetRepoData($owner: String!, $name: String!) {\n  repository(owner: $owner, name: $name) {\n    name\n    url\n    description\n    releases(last: 3, orderBy: { field: CREATED_AT, direction: DESC }) {\n      nodes {\n        name\n        tagName\n        url\n        createdAt\n        releaseAssets(first: 50) {\n          nodes {\n            name\n            downloadUrl\n          }\n        }\n      }\n    }\n    workflows: object(expression: \"HEAD:.github/workflows\") {\n      ... on Tree {\n        entries {\n          name\n          object {\n            ... on Blob {\n              text\n            }\n          }\n        }\n      }\n    }\n  }\n}\n`);
          repoData = await client!.request(document as any, { owner: repo.owner, name: repo.name });
          cache.set(cacheKey, repoData);
          console.log(chalk.green('👍 Data fetched and cached successfully.'));
        } catch (error) {
          // Log and skip on API/network errors
          console.error(chalk.red(`Failed to fetch data for ${cacheKey}:`), error);
          continue;
        }
      }
    }

    // Only analyze if data is present (mock or real)
    if (repoData && repoData.repository) {
      // Analyze the repository for supply chain security signals
      const analysisResult = analyzeRepositoryData(repoData.repository as any);
      allAnalysisResults.push(analysisResult);
    }
  }

  // Generate reports if any repositories were successfully analyzed
  if (allAnalysisResults.length > 0) {
    await generateReports(allAnalysisResults);
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }

  console.log(chalk.blue.bold('\n✨ Analysis complete.'));
}

// Start the CLI tool and handle any unexpected errors
main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});
