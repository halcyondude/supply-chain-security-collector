# Architecture: Type-Driven Normalization

## Core Philosophy

**Use TypeScript's type system for what it's good at: type-safe data transformation.**

Instead of trying to build a "fully generic" runtime schema introspection system, we leverage GraphQL code generation to get rich TypeScript types, then write explicit normalizers that are simple, maintainable, and type-safe.

## How It Works

### 1. GraphQL Code Generation
```bash
npm run codegen
```

This reads your GraphQL schema and query files and generates TypeScript types:
- Input: `schema/github-v15.26.0.graphql` + `src/graphql/GetRepoDataArtifacts.graphql`
- Output: `src/generated/graphql.ts` with `GetRepoDataArtifactsQuery` type

### 2. Type-Driven Normalizer
You write a normalizer using the generated types:

```typescript
export function normalizeGetRepoDataArtifacts(
    responses: GetRepoDataArtifactsQuery[]
): GetRepoDataArtifactsNormalized {
    const repositories = responses
        .filter(r => r.repository !== null)
        .map(r => ({
            id: r.repository!.id,
            name: r.repository!.name,
            nameWithOwner: r.repository!.nameWithOwner
        }));
    
    const releases = responses
        .filter(r => r.repository !== null)
        .flatMap(r =>
            r.repository!.releases.nodes!
                .filter((rel): rel is NonNullable<typeof rel> => rel !== null)
                .map(release => ({
                    id: release.id,
                    repository_id: r.repository!.id,  // FK
                    tagName: release.tagName,
                    // ... other fields
                }))
        );
    
    // ... release_assets with double flatMap
    
    return { repositories, releases, release_assets };
}
```

**Key Benefits:**
- ✅ Type-safe: TypeScript catches errors at compile time
- ✅ Explicit: Clear what entities you're creating and their relationships
- ✅ Maintainable: ~50-100 lines of straightforward code
- ✅ Flexible: Easy to customize for each query's needs

### 3. DuckDB Persistence

The `ArtifactWriter` takes the normalized data and writes it to DuckDB:

```typescript
const normalized = normalizeGetRepoDataArtifacts(responses);

// Write to temp JSON files (DuckDB can read these reliably)
fs.writeFileSync('temp_repositories.json', JSON.stringify(normalized.repositories));

// Load into DuckDB
await con.run(`
    CREATE TABLE repositories AS 
    SELECT * FROM read_json('temp_repositories.json', format='array', auto_detect=true)
`);
```

**Result:**
- Raw table: `raw_GetRepoDataArtifacts` (complete nested JSON)
- Normalized tables: `repositories`, `releases`, `release_assets` (relational with FKs)
- Parquet files: All tables exported to `.parquet` format

## Why This Approach?

### ❌ What We Don't Do: Runtime Schema Introspection

We could try to build a "fully generic" system that:
- Introspects the GraphQL schema at runtime
- Automatically detects entities and relationships
- Generates tables dynamically

**Problems:**
- How do you detect foreign keys in arbitrary nested structures?
- How do you handle polymorphic types (unions/interfaces)?
- How do you name tables? Handle name collisions?
- The code becomes complex, brittle, and hard to debug

### ✅ What We Do: Type-Driven Pattern

We provide a **simple, repeatable pattern**:
1. Add your GraphQL query to `src/graphql/`
2. Run `npm run codegen` to generate types
3. Write a normalizer in `src/normalizers/` (~50-100 lines)
4. Wire it into `ArtifactWriter.ts`

**Benefits:**
- Explicit and predictable
- Type-safe at compile time
- Easy to understand and modify
- Works for ANY GraphQL API (just run codegen!)

## Genericity Through Simplicity

**"Generic" doesn't mean "automagically handles everything."**

It means: **The pattern is simple enough to apply to any GraphQL query.**

- ✅ Works with GitHub API
- ✅ Works with any GraphQL endpoint
- ✅ Just write a normalizer following the same pattern
- ✅ TypeScript enforces correctness

## Documentation Strategy

We **don't** need intermediate `schema-map.json` files. Users can:

1. **Inspect GraphQL Schema:** The `.graphql` file has all type definitions
2. **Query Parquet Metadata:** Parquet files are self-documenting
3. **Use DuckDB DESCRIBE:** `DESCRIBE SELECT * FROM 'file.parquet'`
4. **Read Generated Docs:** `TABLES.md` documents the output structure

## Adding Support for a New Query

1. **Create the GraphQL query:**
   ```graphql
   # src/graphql/GetRepoSecurity.graphql
   query GetRepoSecurity($owner: String!, $name: String!) {
     repository(owner: $owner, name: $name) {
       id
       securityPolicyUrl
       vulnerabilityAlerts { ... }
     }
   }
   ```

2. **Run codegen:**
   ```bash
   npm run codegen
   ```

3. **Write the normalizer:**
   ```typescript
   // src/normalizers/GetRepoSecurityNormalizer.ts
   export function normalizeGetRepoSecurity(
       responses: GetRepoSecurityQuery[]
   ): GetRepoSecurityNormalized {
       // Extract entities with FKs
   }
   ```

4. **Wire into ArtifactWriter:**
   - Import the normalizer
   - Call it in `createNormalizedTables()`

That's it! ~50-100 lines of code to support a new query.

## Philosophy

**"Make the simple things simple, make the complex things explicit."**

- Simple: The normalizer pattern is easy to follow
- Explicit: You write exactly what entities you want
- Type-Safe: TypeScript catches mistakes
- Maintainable: Future you (or others) can read and modify it

This is more maintainable than trying to build a "magic" system that "just works" for everything.
