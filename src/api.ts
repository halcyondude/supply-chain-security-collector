// src/api.ts
// This module encapsulates all interactions with the GitHub GraphQL API.
//
// To add a new query:
// 1. Create your .graphql file in src/graphql/ (e.g., GetRepoDataMetrics.graphql)
// 2. Run `npm run codegen` to generate TypeScript types
// 3. Import the generated Document and Query types below
// 4. Create a fetch function following the pattern of fetchRepositoryExtendedInfo
// 5. Export your fetch function for use in neo.ts
//
// Each fetch function should:
// - Accept: (client, variables, verbose) parameters
// - Return: Promise<YourQueryType | null>
// - Handle errors and rate limits gracefully
// - Log appropriately based on verbose flag

import { GraphQLClient, ClientError } from 'graphql-request';
import chalk from 'chalk';
import {
  GetRepoDataArtifactsDocument,
  GetRepoDataArtifactsQuery,
  GetRepoDataExtendedInfoDocument,
  GetRepoDataExtendedInfoQuery,
  GetOrgReposDocument,
  GetOrgReposQuery,
} from './generated/graphql';

/**
 * Creates and configures a GraphQLClient for the GitHub API.
 * @param token - The GitHub Personal Access Token.
 * @returns An initialized GraphQLClient instance.
 */
export function createApiClient(token: string): GraphQLClient {
  return new GraphQLClient('https://api.github.com/graphql', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Fetches repository artifact data (releases and assets) from the GitHub API.
 * This is a lightweight query that fetches only basic repository info and release artifacts.
 *
 * @param client - The GraphQLClient instance to use for the request.
 * @param variables - The owner and name of the repository to fetch.
 * @param verbose - A flag to enable or disable detailed logging.
 * @returns The GraphQL query result, or null if the fetch fails or the repository is not found.
 */
export async function fetchRepositoryArtifacts(
  client: GraphQLClient,
  variables: { owner: string; name: string },
  verbose: boolean
): Promise<GetRepoDataArtifactsQuery | null> {
  const repoIdentifier = `${variables.owner}/${variables.name}`;

  if (verbose) {
    console.log(chalk.gray(`[API] Fetching artifacts for ${repoIdentifier}...`));
  }

  try {
    const data = await client.request<GetRepoDataArtifactsQuery>(GetRepoDataArtifactsDocument, variables);

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

/**
 * Fetches extended repository data including workflows, security policies, and branch protection.
 * This is a more comprehensive query that includes everything from the artifacts query plus additional data.
 *
 * @param client - The GraphQLClient instance to use for the request.
 * @param variables - The owner and name of the repository to fetch.
 * @param verbose - A flag to enable or disable detailed logging.
 * @returns The GraphQL query result, or null if the fetch fails or the repository is not found.
 */
export async function fetchRepositoryExtendedInfo(
  client: GraphQLClient,
  variables: { owner: string; name: string },
  verbose: boolean
): Promise<GetRepoDataExtendedInfoQuery | null> {
  const repoIdentifier = `${variables.owner}/${variables.name}`;

  if (verbose) {
    console.log(chalk.gray(`[API] Fetching extended info for ${repoIdentifier}...`));
  }

  try {
    const data = await client.request<GetRepoDataExtendedInfoQuery>(GetRepoDataExtendedInfoDocument, variables);

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

// ---------------------------------------------------------------------------
// Org-level repo scanning
// ---------------------------------------------------------------------------

/** Non-null repo node from GetOrgRepos query */
type OrgRepoNode = NonNullable<NonNullable<NonNullable<GetOrgReposQuery['organization']>['repositories']['nodes']>[number]>;

/** Result of fetching all repos for a single org */
export interface OrgRepoResult {
  org: string;
  repos: OrgRepoNode[];
  totalCount: number;
}

/**
 * Fetches all public repositories for a GitHub organization using cursor-based pagination.
 *
 * Returns null for personal accounts (the organization query returns null for non-org logins).
 * Implements rate-limit awareness: when x-ratelimit-remaining drops below 500, sleeps until reset.
 *
 * @param client - The GraphQLClient instance to use for the request.
 * @param org - The GitHub organization login name.
 * @param verbose - A flag to enable or disable detailed logging.
 * @returns The complete list of repos for the org, or null if not an org / on error.
 */
export async function fetchOrgRepos(
  client: GraphQLClient,
  org: string,
  verbose: boolean
): Promise<OrgRepoResult | null> {
  const allRepos: OrgRepoNode[] = [];
  let cursor: string | null = null;
  let pageNum = 0;

  do {
    try {
      const result: GetOrgReposQuery = await client.request<GetOrgReposQuery>(
        GetOrgReposDocument,
        { org, cursor }
      );

      if (!result.organization) {
        if (verbose) {
          console.log(chalk.yellow(`  [ORG] ${org}: not an organization (personal account?), skipping`));
        }
        return null; // personal account, not an org
      }

      const repoNodes = result.organization.repositories.nodes ?? [];
      for (const node of repoNodes) {
        if (node) allRepos.push(node);
      }

      pageNum++;
      if (verbose) {
        const total = result.organization.repositories.totalCount;
        console.log(
          chalk.gray(`  [ORG] ${org}: fetched page ${pageNum} (${allRepos.length}/${total} repos)`)
        );
      }

      const pageInfo: { hasNextPage: boolean; endCursor: string | null } = result.organization.repositories.pageInfo;
      cursor = pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null;
    } catch (error: unknown) {
      // Check for rate limit exhaustion and retry after sleeping
      if (error instanceof ClientError) {
        const { headers } = error.response;
        if (headers && typeof (headers as Headers).get === 'function') {
          const h = headers as Headers;
          const remaining = h.get('x-ratelimit-remaining');
          if (remaining && parseInt(remaining, 10) < 500) {
            const reset = h.get('x-ratelimit-reset');
            const waitMs = reset
              ? Math.max(0, parseInt(reset, 10) * 1000 - Date.now())
              : 60_000;
            console.log(
              chalk.yellow(`  [ORG] Rate limit approaching (${remaining} left), waiting ${Math.ceil(waitMs / 1000)}s`)
            );
            await new Promise(r => setTimeout(r, waitMs));
            continue; // retry this page
          }
        }

        // Non-rate-limit error -- log details
        if (error.response.status !== undefined) {
          console.error(chalk.red(`  [ORG] ${org}: HTTP ${error.response.status}`));
        }
        if (error.response.errors) {
          console.error(
            chalk.red(`  [ORG] ${org}: GraphQL errors:`),
            JSON.stringify(error.response.errors, null, 2)
          );
        }
      } else if (error instanceof Error) {
        console.error(chalk.red(`  [ORG] ${org}: ${error.message}`));
      } else {
        console.error(chalk.red(`  [ORG] ${org}: unknown error`), error);
      }
      return null;
    }
  } while (cursor);

  if (verbose) {
    console.log(chalk.green(`  [ORG] ${org}: ${allRepos.length} repos fetched`));
  }

  return { org, repos: allRepos, totalCount: allRepos.length };
}
