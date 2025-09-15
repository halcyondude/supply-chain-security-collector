// src/api.ts
// This module encapsulates all interactions with the GitHub GraphQL API.

import { GraphQLClient, ClientError } from 'graphql-request';
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
    // Use request to get the typed data object
    const data = await client.request<GetRepoDataQuery>(GetRepoDataDocument, variables);

    if (verbose) {
      console.log(chalk.green(`[API] Success for ${repoIdentifier}.`));
    }

    // The GitHub API returns { repository: null } for non-existent or private repos.
    if (data.repository === null) {
      console.log(chalk.yellow(`[API] Repository not found or access denied for ${repoIdentifier}. Skipping.`));
      return null;
    }

    return data;
  } catch (error: unknown) {
    console.error(chalk.red.bold(`[API] Request failed for ${repoIdentifier}.`));

    // graphql-request throws an error with a .response property on GraphQL or HTTP errors
    if (error instanceof ClientError) {
      if (error.response.status !== undefined) {
        console.error(chalk.red('  HTTP Status:'), error.response.status);
      }
      if (error.response.errors) {
        console.error(chalk.red('  GraphQL Errors:'), JSON.stringify(error.response.errors, null, 2));
      }
      // Try to surface rate limit info if present
      const { headers } = error.response;
      if (headers && typeof (headers as Headers).get === 'function') {
        const h = headers as Headers;
        const remaining = h.get('x-ratelimit-remaining');
        const reset = h.get('x-ratelimit-reset');
        if (remaining !== null) {
          console.error(chalk.yellow('  Rate Limit Remaining:'), remaining);
        }
        if (reset !== null) {
          const resetTime = new Date(Number(reset) * 1000);
          console.error(chalk.yellow('  Rate Limit Resets At:'), resetTime.toLocaleTimeString());
        }
      }
    } else if (error instanceof Error) {
      console.error(chalk.red('  Error Details:'), error.message);
    } else {
      console.error(chalk.red('  An unknown error occurred:'), error);
    }
    return null;
  }
}