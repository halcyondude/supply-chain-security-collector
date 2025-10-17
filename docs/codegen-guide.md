# Developer Guide: A Modern Approach to GraphQL Code Generation

This guide documents the principles and practices for using `graphql-codegen` to create a robust, maintainable, and type-safe data access layer for the GitHub API.

### The Core Philosophy: Operations are the Source of Truth

The most critical principle of type-safe GraphQL is this: **The shape of the data you receive is defined by your query, not the server's entire schema.**

Therefore, we **always** generate TypeScript types based on the specific `.graphql` documents our application actually uses. This ensures a perfect, compile-time match between the code and the data, eliminating an entire class of runtime errors.

---

### The Modern Stack: `client-preset`

We use the `client-preset` from GraphQL Code Generator. It is the modern, canonical way to set up codegen for any application that *consumes* a GraphQL API (like this CLI).

**Why the `client-preset` is superior:**

* **Simplicity:** It bundles the best plugins (`typescript`, `typescript-operations`) with an optimal configuration out of the box.
* **TypedDocumentNode:** Instead of just generating types, it produces a `TypedDocumentNode` for each operation. This is a highly optimized object that bundles the query string, its result type, and its variable types together.
* **Efficiency:** It prevents the need to parse GraphQL query strings at runtime.

---

### Our Configuration: `codegen.ts`

Our configuration is centralized in `codegen.ts`. It is designed to be simple and powerful.

```typescript
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  // The schema is our single source of truth for what's possible.
  schema: 'schema/github-v15.26.0.graphql',
  // We tell codegen to find all our operations in this directory.
  documents: ['src/graphql/**/*.graphql'],
  prune: true,
  generates: {
    // We generate a single, cohesive set of artifacts here.
    'src/generated/': {
      preset: 'client',
      plugins: [
        {
          add: { content: '/* eslint-disable */' },
        },
      ],
      // All plugin configurations go under the 'config' key.
      config: {
        avoidOptionals: true,
        strictScalars: true,
        enumsAsTypes: true,
        // Map custom GraphQL scalars to simple TypeScript types.
        scalars: {
          DateTime: 'string',
          Date: 'string',
          URI: 'string',
          // ... and other custom GitHub scalars
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
```

---

### The Development Workflow

Follow this process to add or modify data fetching logic.

#### 1. Define Your Operation in a `.graphql` File

Your work starts here. All GraphQL queries, mutations, or fragments **must** be defined in `.graphql` files inside the `src/graphql/` directory.

**Example: `src/graphql/GetRepoData.graphql`**

```graphql
query GetRepoData($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name
    url
    description
    # ... other fields
  }
}
```

#### 2. Regenerate the SDK

After saving your `.graphql` file, run the codegen script. This will read your new operation and generate all the necessary types and the `TypedDocumentNode`.

```bash
npm run codegen
```

For an optimal developer experience, run it in watch mode during development:

```bash
npm run codegen -- --watch
```

#### 3. Integrate the Generated Code

This is the most important step. **Do not write GraphQL strings in your application code.** Instead, import the generated `TypedDocumentNode` and pass it directly to the GraphQL client.

**Correct Usage (`src/main.ts`):**

```typescript
// 1. Import the generated DocumentNode and any necessary types.
import { GetRepoDataDocument, GetRepoDataQuery } from './generated/graphql';
import { GraphQLClient } from 'graphql-request';

// 2. Initialize your client.
const client = new GraphQLClient('https://api.github.com/graphql', { /* ... */ });

// 3. Use the imported document directly in your API call.
//    The client understands this object and will infer all types automatically.
const variables = { owner: 'sigstore', name: 'cosign' };
const response = await client.request(GetRepoDataDocument, variables);

// `response` is now fully typed as GetRepoDataQuery!
// No manual typing is needed.
console.log(response.repository?.name);
```

By following this pattern, we guarantee that our application's data access is always synchronized with our GraphQL operations, which are in turn validated against the official GitHub schema.

---

## Real-World Usage Patterns from Our Codebase

### Pattern 1: Fetch Function (`src/api.ts`)

This shows how we use generated types in our API layer:

```typescript
import { GetRepoDataExtendedInfoDocument, GetRepoDataExtendedInfoQuery } from './generated/graphql';
import { GraphQLClient } from 'graphql-request';

export async function fetchRepositoryExtendedInfo(
  client: GraphQLClient,
  variables: { owner: string; name: string },
  verbose: boolean
): Promise<GetRepoDataExtendedInfoQuery | null> {
  try {
    const data = await client.request<GetRepoDataExtendedInfoQuery>(
      GetRepoDataExtendedInfoDocument,
      variables
    );
    
    if (data.repository === null) {
      console.log(`Repository not found: ${variables.owner}/${variables.name}`);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Failed to fetch repository data:`, error);
    return null;
  }
}
```

**Key Points:**
- Import both the `Document` (query) and `Query` (return type)
- Use the `Document` constant directly with the client
- TypeScript infers all types automatically
- Handle null repository case (GitHub returns this for missing repos)

### Pattern 2: Normalizer (`src/normalizers/GetRepoDataExtendedInfoNormalizer.ts`)

This shows how we transform typed GraphQL responses into flat relational arrays:

```typescript
import type { GetRepoDataExtendedInfoQuery } from '../generated/graphql';

export interface GetRepoDataExtendedInfoNormalized {
    base_repositories: RepositoryRow[];
    base_releases: ReleaseRow[];
    base_release_assets: ReleaseAssetRow[];
    base_workflows: WorkflowRow[];
}

export function normalizeGetRepoDataExtendedInfo(
    responses: GetRepoDataExtendedInfoQuery[]
): GetRepoDataExtendedInfoNormalized {
    const repositories: RepositoryRow[] = [];
    const releases: ReleaseRow[] = [];
    const releaseAssets: ReleaseAssetRow[] = [];
    const workflows: WorkflowRow[] = [];

    for (const response of responses) {
        const repo = response.repository;
        if (!repo) continue;

        // Extract repository data
        repositories.push({
            id: repo.id,
            __typename: repo.__typename,
            name: repo.name,
            nameWithOwner: repo.nameWithOwner,
            url: repo.url,
            description: repo.description ?? null,
            // ... more fields
        });

        // Extract nested releases
        if (repo.releases?.nodes) {
            for (const release of repo.releases.nodes) {
                if (!release) continue;
                
                releases.push({
                    id: release.id,
                    repository_id: repo.id,
                    tagName: release.tagName,
                    name: release.name ?? null,
                    // ... more fields
                });

                // Extract nested release assets
                if (release.releaseAssets?.nodes) {
                    for (const asset of release.releaseAssets.nodes) {
                        if (!asset) continue;
                        
                        releaseAssets.push({
                            id: asset.id,
                            repository_id: repo.id,
                            release_id: release.id,
                            name: asset.name,
                            // ... more fields
                        });
                    }
                }
            }
        }
    }

    return { base_repositories: repositories, base_releases: releases, 
             base_release_assets: releaseAssets, base_workflows: workflows };
}
```

**Key Points:**
- Import the `Query` type to get full type safety
- Use nullish coalescing (`??`) for optional fields
- Check for null/undefined at each nesting level
- Transform nested GraphQL structure into flat arrays
- Preserve foreign key relationships (repository_id, release_id)

### Pattern 3: Type-Safe Variable Construction

When building variables for queries, TypeScript ensures you provide correct types:

```typescript
import type { GetRepoDataExtendedInfoQueryVariables } from './generated/graphql';

// This is type-checked at compile time
const variables: GetRepoDataExtendedInfoQueryVariables = {
  owner: 'kubernetes',
  name: 'kubernetes'
};

// TypeScript will error if you forget a required variable or use wrong type
const invalidVariables: GetRepoDataExtendedInfoQueryVariables = {
  owner: 'kubernetes'
  // Error: Property 'name' is missing
};
```

### Pattern 4: Response Type Narrowing

Handle different response scenarios with type guards:

```typescript
import type { GetRepoDataExtendedInfoQuery } from './generated/graphql';

function processResponse(response: GetRepoDataExtendedInfoQuery) {
  // Check if repository exists
  if (!response.repository) {
    console.log('Repository not found or inaccessible');
    return;
  }
  
  const repo = response.repository;
  
  // Now TypeScript knows repo is not null
  console.log(`Repository: ${repo.nameWithOwner}`);
  
  // Check nested optional fields
  if (repo.releases?.nodes) {
    const releaseCount = repo.releases.nodes.length;
    console.log(`Found ${releaseCount} releases`);
  }
}
```

### Complete Data Flow Example

Here's how the generated types flow through the entire system:

```typescript
// 1. Define query in .graphql file
// src/graphql/GetRepoDataExtendedInfo.graphql

// 2. Run codegen (npm run codegen) generates:
//    - GetRepoDataExtendedInfoDocument
//    - GetRepoDataExtendedInfoQuery
//    - GetRepoDataExtendedInfoQueryVariables

// 3. Use in API layer (src/api.ts)
import { GetRepoDataExtendedInfoDocument, GetRepoDataExtendedInfoQuery } 
  from './generated/graphql';

const data = await client.request<GetRepoDataExtendedInfoQuery>(
  GetRepoDataExtendedInfoDocument,
  { owner: 'sigstore', name: 'cosign' }
);

// 4. Transform in normalizer (src/normalizers/)
import type { GetRepoDataExtendedInfoQuery } from './generated/graphql';

function normalize(responses: GetRepoDataExtendedInfoQuery[]) {
  // TypeScript ensures we handle all fields correctly
  return transformToFlatArrays(responses);
}

// 5. Load into DuckDB (src/ArtifactWriter.ts)
const normalized = normalize([data]);
await createTableFromArray(con, 'base_repositories', normalized.base_repositories);
```

This pattern ensures type safety from GraphQL query → API call → normalization → database, catching errors at compile time rather than runtime.

````
