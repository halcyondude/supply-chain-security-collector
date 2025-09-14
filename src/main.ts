import 'dotenv/config';
import { GraphQLClient } from 'graphql-request';
import NodeCache from 'node-cache';
import chalk from 'chalk';


import { getSdk } from './generated/graphql';
import { repositories, RepositoryTarget } from './config';
import { analyzeRepositoryData } from './analysis';
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

  let sdk: ReturnType<typeof getSdk> | null = null;
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
    sdk = getSdk(client);
  }

  const allAnalysisResults = [];

  for (const repo of repositories) {
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    let repoData;
    if (useMock) {
      // Use mock data if available
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_');
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData;
      } else {
        console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
        try {
          repoData = await sdk!.GetRepoData({ owner: repo.owner, name: repo.name });
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
