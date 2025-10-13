# Adding New GraphQL Queries

This guide explains how to add new GraphQL queries to the data collector while maintaining the multi-query architecture.

## Quick Start

The system is designed to support multiple GraphQL queries, each producing its own set of normalized tables and Parquet files. Adding a new query involves 5 steps:

1. Create the GraphQL query file
2. Generate TypeScript types
3. Add a fetch function
4. Create a normalizer
5. Wire it all together

## Step-by-Step Guide

### Step 1: Create the GraphQL Query File

Create a new `.graphql` file in `src/graphql/`:

```bash
touch src/graphql/GetRepoDataMetrics.graphql
```

Example query structure:

```graphql
query GetRepoDataMetrics($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    __typename
    id
    name
    nameWithOwner
    # Add your fields here
    stargazerCount
    forkCount
    primaryLanguage {
      name
    }
  }
}
```

**Naming Convention:** Use `GetRepoData[YourFeature]` format for consistency.

### Step 2: Generate TypeScript Types

Run the code generator to create TypeScript types from your GraphQL query:

```bash
npm run codegen
```

This will generate types in `src/generated/graphql.ts`:
- `GetRepoDataMetricsDocument` - The query document
- `GetRepoDataMetricsQuery` - The response type

### Step 3: Add a Fetch Function

Add a fetch function to `src/api.ts`:

```typescript
// 1. Import the generated types at the top of the file
import {
  GetRepoDataMetricsDocument,
  GetRepoDataMetricsQuery,
  // ... existing imports
} from './generated/graphql';

// 2. Create your fetch function
export async function fetchRepositoryMetrics(
  client: GraphQLClient,
  variables: { owner: string; name: string },
  verbose: boolean
): Promise<GetRepoDataMetricsQuery | null> {
  const repoIdentifier = `${variables.owner}/${variables.name}`;

  if (verbose) {
    console.log(chalk.gray(`[API] Fetching metrics for ${repoIdentifier}...`));
  }

  try {
    const data = await client.request<GetRepoDataMetricsQuery>(
      GetRepoDataMetricsDocument, 
      variables
    );

    if (verbose) {
      console.log(chalk.green(`[API] Success for ${repoIdentifier}.`));
    }

    if (data.repository === null) {
      console.log(chalk.yellow(`[API] Repository not found for ${repoIdentifier}. Skipping.`));
      return null;
    }

    return data;
  } catch (error: unknown) {
    console.error(chalk.red.bold(`[API] Request failed for ${repoIdentifier}.`));
    
    if (error instanceof ClientError) {
      if (error.response.status !== undefined) {
        console.error(chalk.red('  HTTP Status:'), error.response.status);
      }
      if (error.response.errors) {
        console.error(chalk.red('  GraphQL Errors:'), JSON.stringify(error.response.errors, null, 2));
      }
    } else {
      console.error(chalk.red('  Error:'), error);
    }
    
    return null;
  }
}
```

### Step 4: Create a Normalizer

Create a normalizer in `src/normalizers/GetRepoDataMetricsNormalizer.ts`:

```typescript
import type { GetRepoDataMetricsQuery } from '../generated/graphql';

// Define your normalized table structures
export interface GetRepoDataMetricsNormalized {
    base_repositories: Array<{
        id: string;
        name: string;
        name_with_owner: string;
        star_count: number;
        fork_count: number;
        primary_language: string | null;
    }>;
}

/**
 * Normalize GetRepoDataMetrics responses into relational tables
 */
export function normalizeGetRepoDataMetrics(
    responses: GetRepoDataMetricsQuery[]
): GetRepoDataMetricsNormalized {
    const repositories = [];

    for (const response of responses) {
        const repo = response.repository;
        if (!repo) continue;

        repositories.push({
            id: repo.id,
            name: repo.name,
            name_with_owner: repo.nameWithOwner,
            star_count: repo.stargazerCount,
            fork_count: repo.forkCount,
            primary_language: repo.primaryLanguage?.name ?? null,
        });
    }

    return { base_repositories: repositories };
}

/**
 * Get normalization statistics for logging
 */
export function getNormalizationStats(normalized: GetRepoDataMetricsNormalized): string {
    return `  Normalized: ${normalized.base_repositories.length} repositories`;
}
```

### Step 5: Wire It All Together

#### 5a. Register the Query in `neo.ts`

Add your query to the query functions map:

```typescript
// Import your fetch function
import { 
  fetchRepositoryMetrics,  // Add this
  // ... existing imports
} from './api';

// Add to the queryFunctions map
const queryFunctions: Record<string, QueryFunction> = {
  'GetRepoDataExtendedInfo': fetchRepositoryExtendedInfo,
  'GetRepoDataArtifacts': fetchRepositoryArtifacts,
  'GetRepoDataMetrics': fetchRepositoryMetrics,  // Add this
};
```

#### 5b. Add Normalization Logic in `ArtifactWriter.ts`

Update the `createNormalizedTables` function:

```typescript
// 1. Import your types and normalizer at the top
import type { GetRepoDataMetricsQuery } from './generated/graphql';
import { 
    normalizeGetRepoDataMetrics,
    getNormalizationStats as getMetricsStats 
} from './normalizers/GetRepoDataMetricsNormalizer';

// 2. Add an else-if branch in createNormalizedTables()
async function createNormalizedTables(
    con: DuckDBConnection, 
    responses: unknown[], 
    queryName: string,
    outputDir: string
) {
    console.log(`  Query type: ${queryName}`);
    
    if (queryName === 'GetRepoDataExtendedInfo') {
        await createTablesForExtendedInfoQuery(con, responses as GetRepoDataExtendedInfoQuery[], outputDir);
    } else if (queryName === 'GetRepoDataArtifacts') {
        await createTablesForArtifactsQuery(con, responses as GetRepoDataArtifactsQuery[], outputDir);
    } else if (queryName === 'GetRepoDataMetrics') {  // Add this
        await createTablesForMetrics(con, responses as GetRepoDataMetricsQuery[], outputDir);
    } else {
        console.warn(`  ⚠️  Unknown query type: ${queryName}. Skipping normalization.`);
    }
}

// 3. Create the table creation function
async function createTablesForMetrics(
    con: DuckDBConnection,
    responses: GetRepoDataMetricsQuery[],
    outputDir: string
) {
    const normalized = normalizeGetRepoDataMetrics(responses);
    console.log(getMetricsStats(normalized));

    if (normalized.base_repositories.length > 0) {
        const tempFile = path.join(outputDir, 'temp_repositories.json');
        fs.writeFileSync(tempFile, JSON.stringify(normalized.base_repositories, null, 2));

        await con.run(`
            CREATE TABLE base_repositories AS 
            SELECT * FROM read_json('${tempFile}')
        `);

        fs.unlinkSync(tempFile);
        console.log('  ✓ base_repositories');
    }
}
```

## Running Your New Query

Once everything is wired up, you can run your query:

```bash
# Run just your new query
npm start -- --input input/test-single.jsonl --queries GetRepoDataMetrics

# Run multiple queries including yours
npm start -- --input input/repos.jsonl --queries GetRepoDataExtendedInfo GetRepoDataMetrics

# With other options
npm start -- --input input/repos.jsonl --queries GetRepoDataMetrics --parallel --analyze
```

## Output Structure

Each query produces its own isolated output:

```
output/
└── repos-2025-01-15T10-30-00/
    ├── raw-responses.jsonl          # Audit trail for all queries
    ├── GetRepoDataMetrics/
    │   ├── database.db               # DuckDB database
    │   └── parquet/
    │       ├── raw_GetRepoDataMetrics.parquet
    │       └── base_repositories.parquet
    └── GetRepoDataExtendedInfo/
        ├── database.db
        └── parquet/
            └── ...
```

## Testing Your Query

1. **Start small:** Test with a single repository first:
   ```bash
   echo '{"owner":"octocat","name":"Hello-World"}' > test-single.jsonl
   npm start -- --input test-single.jsonl --queries GetRepoDataMetrics --verbose
   ```

2. **Verify the output:**
   ```bash
   # Check the database
   duckdb output/test-single-*/GetRepoDataMetrics/database.db
   
   D SHOW TABLES;
   D SELECT * FROM base_repositories;
   D .exit
   ```

3. **Inspect Parquet files:**
   ```bash
   npm run view-parquet -- output/test-single-*/GetRepoDataMetrics/parquet/base_repositories.parquet
   ```

## Best Practices

### GraphQL Query Design

1. **Always include `__typename`** on objects for debugging
2. **Request only what you need** to minimize API costs
3. **Use pagination** for lists that might be large
4. **Test against real repos** to ensure your query works

### Normalizer Design

1. **Use snake_case** for table column names (DuckDB/SQL convention)
2. **Handle nulls explicitly** with `?? null` or `?? ''`
3. **Generate proper IDs** for join tables (e.g., `${repo_id}_${release_id}`)
4. **Log statistics** to help debugging

### Type Safety

1. **Use TypeScript's type system** - let the generated types guide you
2. **Cast properly** when passing to normalizers
3. **Handle null repositories** - GitHub returns `{ repository: null }` for missing repos

## Common Patterns

### Handling One-to-Many Relationships

```typescript
// Example: Repository -> Releases -> Assets
const releases = [];
const assets = [];

for (const response of responses) {
    const repo = response.repository;
    if (!repo?.releases?.nodes) continue;

    for (const release of repo.releases.nodes) {
        if (!release) continue;

        releases.push({
            id: release.id,
            repository_id: repo.id,  // FK back to repo
            name: release.name,
        });

        if (release.releaseAssets?.nodes) {
            for (const asset of release.releaseAssets.nodes) {
                if (!asset) continue;

                assets.push({
                    id: asset.id,
                    release_id: release.id,  // FK back to release
                    name: asset.name,
                });
            }
        }
    }
}

return { repositories, releases, assets };
```

### Handling Optional Fields

```typescript
// Use nullish coalescing for optional fields
primaryLanguage: repo.primaryLanguage?.name ?? null,

// Or provide defaults
description: repo.description ?? '',
```

### Handling Lists of Primitives

```typescript
// Convert array to JSON string for storage
topics: JSON.stringify(repo.repositoryTopics?.nodes?.map(t => t.topic.name) ?? []),

// Later in SQL you can query with DuckDB's JSON functions:
// SELECT name, json_extract_string(topics, '$[0]') as first_topic FROM repositories;
```

## Troubleshooting

### "Unknown query type" warning

- Check that you added your query to the `queryFunctions` map in `neo.ts`
- Verify the query name matches exactly (case-sensitive)

### TypeScript errors in normalizer

- Run `npm run codegen` again
- Check that your GraphQL query syntax is valid
- Ensure you're accessing fields that exist in your query

### Empty tables in DuckDB

- Add `--verbose` flag to see detailed logging
- Check the raw JSON responses in `raw-responses.jsonl`
- Verify your normalizer is handling null checks properly

### Rate limit errors

- Use `--parallel` flag cautiously (default is sequential)
- Check your GitHub token has sufficient rate limit
- Consider adding delays between requests for large datasets

## Examples

See existing implementations for reference:
- **Simple query:** `GetRepoDataArtifacts` (basic repo + releases)
- **Complex query:** `GetRepoDataExtendedInfo` (workflows, security, branch protection)

## Need Help?

- Check the generated types in `src/generated/graphql.ts`
- Look at existing normalizers for patterns
- Test your GraphQL query in GitHub's GraphQL Explorer: https://docs.github.com/en/graphql/overview/explorer
