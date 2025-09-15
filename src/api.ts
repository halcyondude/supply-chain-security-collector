// src/api.ts
// This module encapsulates all interactions with the GitHub GraphQL API.

import { GraphQLClient } from 'graphql-request';
import chalk from 'chalk';
import { GetRepoDataDocument, GetRepoDataQuery } from './generated/graphql';

/**
 * Creates and configures a GraphQLClient for the GitHub API.
 * @param token - The GitHub Personal Access Token.
 * @returns An initialized GraphQLClient instance.
 */
// FIX: Added 'export' to make this function visible to other modules.
export function createApiClient(token: string): GraphQLClient {
  return new GraphQLClient('https://api.github.com/graphql', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Fetches data for a single repository from the GitHub API with detailed, conditional logging.
 *
 * @param client - The GraphQLClient instance to use for the request.
 * @param variables - The owner and name of the repository to fetch.
 * @param verbose - A flag to enable or disable detailed logging.
 * @returns The GraphQL query result, or null if the fetch fails or the repository is not found.
 */
// FIX: Added 'export' to make this function visible to other modules.
export async function fetchRepositoryData(
  client: GraphQLClient,
  variables: { owner: string; name: string },
  verbose: boolean
): Promise<GetRepoDataQuery | null> {
  const repoIdentifier = `${variables.owner}/${variables.name}`;

  if (verbose) {
    console.log(chalk.gray(`[API] Fetching data for ${repoIdentifier}...`));
  }

  try {
    // Use rawRequest to get access to response headers for rate limit info
    const response = await client.rawRequest<GetRepoDataQuery>(GetRepoDataDocument, variables);
    const headers = response.headers;
    const rateLimitRemaining = headers.get('x-ratelimit-remaining');
    const rateLimitReset = headers.get('x-ratelimit-reset');

    if (verbose) {
      console.log(
        chalk.green(`[API] Success for ${repoIdentifier}.`),
        chalk.yellow(`(Rate Limit Remaining: ${rateLimitRemaining})`)
      );

      // Log the reset time only if the rate limit is getting low
      if (rateLimitReset && rateLimitRemaining && Number(rateLimitRemaining) < 100) {
        const resetTime = new Date(Number(rateLimitReset) * 1000);
        console.log(chalk.red.bold(`[API] Warning: Low rate limit. Resets at: ${resetTime.toLocaleTimeString()}`));
      }
    }

    // The GitHub API returns `data: { repository: null }` for non-existent or private repos.
    if (response.data?.repository === null) {
      console.log(chalk.yellow(`[API] Repository not found or access denied for ${repoIdentifier}. Skipping.`));
      return null;
    }

    // Check for specific GraphQL errors returned in the body
    if (response.errors) {
        console.error(chalk.red(`[API] GraphQL errors returned for ${repoIdentifier}:`), JSON.stringify(response.errors, null, 2));
        return null;
    }

    return response.data;
  } catch (error: any) {
    console.error(chalk.red.bold(`[API] Network or authentication error for ${repoIdentifier}.`));

    if (error.response) {
      console.error(chalk.red('  Response Status:'), error.response.status);
      console.error(chalk.red('  GraphQL Errors:'), JSON.stringify(error.response.errors, null, 2));
    } else {
        console.error(chalk.red('  Error Details:'), error.message);
    }
    return null;
  }
}