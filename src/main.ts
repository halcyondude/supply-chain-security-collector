import 'dotenv/config';
import { GraphQLClient } from 'graphql-request';
import NodeCache from 'node-cache';
import chalk from 'chalk';

import { getSdk } from './generated/graphql';
import { repositories, RepositoryTarget } from './config';
import { analyzeRepositoryData } from './analysis';
import { generateReports } from './report';

// Initialize cache with a 24-hour TTL
const cache = new NodeCache({ stdTTL: 86400 });

async function main() {
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
    process.exit(1);
  }

  const client = new GraphQLClient('https://api.github.com/graphql', {
    headers: {
      Authorization: `Bearer ${githubPat}`,
    },
  });

  const sdk = getSdk(client);
  const allAnalysisResults = [];

  for (const repo of repositories) {
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    let repoData;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      console.log(chalk.green('✅ Found data in cache.'));
      repoData = cachedData;
    } else {
      console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
      try {
        repoData = await sdk.GetRepoData({ owner: repo.owner, name: repo.name });
        cache.set(cacheKey, repoData);
        console.log(chalk.green('👍 Data fetched and cached successfully.'));
      } catch (error) {
        console.error(chalk.red(`Failed to fetch data for ${cacheKey}:`), error);
        continue;
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
