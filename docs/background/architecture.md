# Architecture: Type-Driven Normalization

## Core Philosophy

This project's architecture is built on a single, powerful principle: **Use TypeScript's type system for what it's good at—type-safe data transformation.**

Instead of building a complex, "fully generic" runtime schema introspection system, we leverage GraphQL code generation to get rich TypeScript types. We then write explicit, type-safe normalizers that are simple to write, easy to maintain, and validated at compile time.

## How It Works

The data pipeline follows a clear, three-stage process:

#### 1. GraphQL Code Generation

The process starts by generating TypeScript types directly from the GraphQL schema and our query files.

```bash
npm run codegen
```

This reads `schema/github-v15.26.0.graphql` and the queries in `src/graphql/` and produces strongly-typed interfaces (e.g., `GetRepoDataExtendedInfoQuery`) in `src/generated/graphql.ts`. These generated types are the foundation of our type-safe pipeline.

#### 2. Type-Driven Normalization

For each GraphQL query, we write a dedicated "normalizer" function. This function takes the typed GraphQL response and transforms its nested structure into a set of flat, relational tables.

**Example: `GetRepoDataArtifactsNormalizer.ts`**
```typescript
export function normalizeGetRepoDataArtifacts(
    responses: GetRepoDataArtifactsQuery[]
): GetRepoDataArtifactsNormalized {
    // Extract repositories
    const repositories = responses
        .filter(r => r.repository !== null)
        .map(r => ({
            id: r.repository!.id,
            name: r.repository!.name,
            nameWithOwner: r.repository!.nameWithOwner
        }));

    // Extract releases and inject a foreign key to the repository
    const releases = responses
        .filter(r => r.repository !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter(rel => rel !== null)
                .map(release => ({
                    id: release.id,
                    repository_id: r.repository!.id,  // Foreign Key
                    tagName: release.tagName,
                }))
        );

    // ... and so on for release_assets
    
    return { base_repositories: repositories, base_releases: releases, ... };
}
```

#### 3. Data Persistence (`ArtifactWriter.ts`)

The `ArtifactWriter` takes the normalized data and persists it to DuckDB and Parquet.

1.  A `raw_<QueryName>` table is created containing the complete, unprocessed nested JSON response for auditing and ad-hoc analysis.
2.  Each normalized array (e.g., `base_repositories`, `base_releases`) is written to its own relational table in DuckDB.
3.  Finally, all tables (both raw and normalized) are exported to compressed Parquet files.

## The Architectural Decision: Explicit vs. "Magic"

### ✅ What We Do: A Simple, Repeatable Pattern

We chose a pattern that is explicit, predictable, and leverages the power of the TypeScript compiler. It is generic not because it magically handles everything, but because the pattern is simple enough to apply to **any** GraphQL query.

**Benefits:**
- **Type-Safe:** The compiler catches errors if the GraphQL query and the normalizer logic fall out of sync.
- **Explicit:** It's immediately clear which entities are being created and how they relate to each other via foreign keys.
- **Maintainable:** A normalizer is typically 100-200 lines of straightforward, debuggable code.
- **Flexible:** Each normalizer can be customized to handle the specific structure of its query.

### ❌ What We Rejected: Runtime Schema Introspection

An alternative approach would be to build a "fully generic" system that introspects the GraphQL schema at runtime and tries to generate tables automatically.

**Problems with that approach:**
- How do you reliably detect foreign key relationships in arbitrary nested structures?
- How do you handle polymorphic types (unions/interfaces) without complex heuristics?
- How do you manage table naming and avoid collisions?
- The resulting code becomes complex, brittle, and difficult to debug.

Our conclusion: it is better to write 100 lines of explicit, type-safe code than 1000 lines of "magic" code that is hard to maintain.

## Pattern: Adding a New Query

Adding a new query is the primary extension point of this architecture. The process involves four simple, well-defined steps.

#### Step 1: Create the GraphQL Query

Create a new `.graphql` file in `src/graphql/`.

```graphql
# src/graphql/GetRepoSecurity.graphql
query GetRepoSecurity($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    id
    securityPolicyUrl
    vulnerabilityAlerts(first: 10) { /* ... */ }
  }
}
```

#### Step 2: Run Code Generation

Generate the TypeScript types for your new query.

```bash
npm run codegen
```

This creates the `GetRepoSecurityQuery` interface in `src/generated/graphql.ts`.

#### Step 3: Write the Normalizer

Create a new file in `src/normalizers/` and write the normalization logic using the generated types.

```typescript
// src/normalizers/GetRepoSecurityNormalizer.ts
import type { GetRepoSecurityQuery } from '../generated/graphql';

export function normalizeGetRepoSecurity(
    responses: GetRepoSecurityQuery[]
): GetRepoSecurityNormalized {
    const repositories = responses
        .map(r => ({
            id: r.repository!.id,
            security_policy_url: r.repository!.securityPolicyUrl
        }));
    
    const vulnerability_alerts = responses
        .flatMap(r =>
            r.repository!.vulnerabilityAlerts.nodes!.map(v => ({
                id: v!.id,
                repository_id: r.repository!.id,  // Foreign Key
                severity: v!.severity,
            }))
        );
    
    return { base_repositories: repositories, base_vulnerability_alerts: vulnerability_alerts };
}
```

#### Step 4: Wire into `ArtifactWriter.ts`

Add a new `else if` branch in the `createNormalizedTables` function to dispatch to your new normalizer.

```typescript
// src/ArtifactWriter.ts
// ...
} else if (queryName === 'GetRepoSecurity') {
    await createTablesForSecurityQuery(con, responses as GetRepoSecurityQuery[], outputDir);
}
// ...
```

That's it. The new query is now fully integrated into the pipeline.

## Normalizer Best Practices

When writing normalizers, follow these patterns for robust and type-safe code.

-   **Handle Nulls:** Always filter out null parent objects before attempting to access nested fields. Use type guards for arrays.
    ```typescript
    .filter(r => r.repository !== null) // Filter null repos
    .flatMap(r => r.repository!.releases.nodes!
        .filter((rel): rel is NonNullable<typeof rel> => rel !== null) // Type guard
        .map(release => ({ ... }))
    )
    ```

-   **Inject Foreign Keys:** Create relationships by injecting the parent's ID into the child object during mapping.
    ```typescript
    .map(release => ({
        id: release.id,
        repository_id: r.repository!.id, // Foreign key back to parent
        tagName: release.tagName,
    }))
    ```
-   **Handle Polymorphism:** Use the `__typename` field to safely handle GraphQL union types.
    ```typescript
    if (workflowsObj && workflowsObj.__typename === 'Tree') {
        // Safe to access Tree-specific fields
        workflowsObj.entries.forEach(...);
    }
    ```

## Final Output Structure

Each run of the tool for a specific query produces a dedicated output directory containing:

```
output/<run-name>/<QueryName>/
├── database.db                  # DuckDB database with all tables
└── parquet/
    ├── raw_<QueryName>.parquet         # Raw, nested data
    ├── base_repositories.parquet       # Normalized tables
    ├── base_releases.parquet
    └── ... (other normalized tables)
```

-   **`raw_*` Tables:** Contain the complete, nested JSON structure directly from the GraphQL response. Ideal for auditing, debugging, and complex ad-hoc queries using DuckDB's JSON functions.
-   **`base_*` Tables:** Contain clean, relational data with foreign keys. Ideal for standard SQL `JOIN`s, analytics, and connecting to BI tools.

## Philosophy

> **"Make the simple things simple, make the complex things explicit."**

-   **Simple:** The normalizer pattern is easy to follow.
-   **Explicit:** You write exactly the entities and relationships you want.
-   **Type-Safe:** TypeScript catches mistakes for you at compile time.
-   **Maintainable:** The code is straightforward and easy for other developers to understand and modify.