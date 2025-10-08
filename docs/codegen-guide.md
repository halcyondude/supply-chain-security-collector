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
