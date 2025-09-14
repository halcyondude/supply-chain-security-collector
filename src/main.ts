import 'dotenv/config';
import { GraphQLClient } from 'graphql-request';
import NodeCache from 'node-cache';
import chalk from 'chalk';


import { gql } from './generated/gql';
import { repositories, RepositoryTarget } from './config';
import { analyzeRepositoryData } from './analysis';
import { GetRepoDataQuery } from './generated/graphql';
import { generateReports } from './report';
import { mockRepoData } from './mockData';

// Initialize cache with a 24-hour TTL
const cache = new NodeCache({ stdTTL: 86400 });

async function main() {
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));


  const useMock = process.env.MOCK_GITHUB === '1';
  if (useMock) {
    console.log(chalk.magenta.bold('🧪 MOCK MODE ENABLED: Using mock GitHub data.'));
  }

  let client: GraphQLClient | null = null;
  if (!useMock) {
    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
      process.exit(1);
    }
    client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${githubPat}`,
      },
    });
  }

  const allAnalysisResults = [];

  type Repository = GetRepoDataQuery['repository'];
  for (const repo of repositories) {
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    let repoData: { repository: Repository } | null = null;
    if (useMock) {
      // Use mock data if available
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_') as keyof typeof mockRepoData;
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData as { repository: Repository };
      } else {
        console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
        try {
          const document = gql(`query GetRepoData($owner: String!, $name: String!) {\n  repository(owner: $owner, name: $name) {\n    name\n    url\n    description\n    releases(last: 3, orderBy: { field: CREATED_AT, direction: DESC }) {\n      nodes {\n        name\n        tagName\n        url\n        createdAt\n        releaseAssets(first: 50) {\n          nodes {\n            name\n            downloadUrl\n          }\n        }\n      }\n    }\n    workflows: object(expression: \"HEAD:.github/workflows\") {\n      ... on Tree {\n        entries {\n          name\n          object {\n            ... on Blob {\n              text\n            }\n          }\n        }\n      }\n    }\n  }\n}\n`);
          repoData = await client!.request(document as any, { owner: repo.owner, name: repo.name });
          cache.set(cacheKey, repoData);
          console.log(chalk.green('👍 Data fetched and cached successfully.'));
        } catch (error) {
          console.error(chalk.red(`Failed to fetch data for ${cacheKey}:`), error);
          continue;
        }
      }
    }

    if (repoData && repoData.repository) {
      const analysisResult = analyzeRepositoryData(repoData.repository as any);
      allAnalysisResults.push(analysisResult);
    }
  }

  if (allAnalysisResults.length > 0) {
    await generateReports(allAnalysisResults);
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }

  console.log(chalk.blue.bold('\n✨ Analysis complete.'));
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});
