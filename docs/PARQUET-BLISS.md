# Regeneration Plan: The Generic "GraphQL to Parquet" Engine

This document outlines the comprehensive, step-by-step process to refactor the `github-supply-chain-analyzer` into a generic, high-performance, type-driven data engineering toolkit.

## Vision

The final tool will be a CLI that takes a GraphQL endpoint, a query, and a set of variables, and produces a set of fully relational, self-documenting, analytics-ready artifacts:

1. A directory of **Parquet files**, one for each entity, with rich metadata embedded in their headers.
2. A single, portable **DuckDB database file (`.db`)** containing all data and schema comments.
3. A `hydrate_metadata.sql` script to document the schema in any DuckDB instance.
4. A `raw-responses.jsonl` file for a complete audit trail.
5. A `schema.md` for human-readable documentation.

The entire transformation process will be executed in-memory for maximum performance.

---

## Phase 1: Radical Simplification & Project Scaffolding

**Objective:** Remove all hardcoded, domain-specific logic and restructure the project for its new generic purpose.

1. **Delete Obsolete Modules:**
    * Delete `src/analysis.ts`.
    * Delete `src/mockData.ts` and the entire `src/mockdata/` directory.
    * Delete all standalone `.sql` scripts in `scripts/` (e.g., `ingest-raw-data.sql`, `load-raw-responses-duckdb.sql`). Utility shell scripts can remain.

2. **Clean Up Dependencies (`package.json`):**
    * Review dependencies and remove any that were specific to the old analysis logic (e.g., `cli-table3` if the new console output is simpler). Ensure `apache-arrow`, `duckdb`, and `@graphql-tools/load` are added.

3. **Refactor the CLI Entrypoint (`src/main.ts`):**
    * Replace the existing `commander` options with the new, generic interface:
        * `--endpoint <url>`: The GraphQL API endpoint. (Required)
        * `--query <file>`: Path to the `.graphql` file. (Required)
        * `--input <file>`: Path to the JSONL file of variables. (Required)
        * `--output-dir <dir>`: The directory to save all artifacts. (Default: `output/`)
        * `--run-name <name>`: A specific name for this run's subdirectory. (Default: generated from query name and timestamp)
    * Remove all logic related to the `--mock` and `--extended` flags.

4. **Create New Module Stubs:**
    * Create empty files for the new modules we will build:
        * `src/SchemaMapGenerator.ts`
        * `src/GraphQLObjectToArrowTransformer.ts`
        * `src/ArtifactWriter.ts`

---

## Phase 2: The Type-Driven Foundation (`SchemaMapGenerator.ts`)

**Objective:** Create the `schema-map.json`, our runtime source of truth for the GraphQL schema's structure and semantics.

1. **Implement `SchemaMapGenerator.ts`:**
    * This module will export a single function: `generateSchemaMap(schemaPath: string, outputPath: string)`.
    * Use the `@graphql-tools/load` and `graphql` packages to load the GraphQL schema from the provided path (e.g., `schema/github-v15.26.0.graphql`).
    * Traverse the parsed schema AST.
    * For each Object Type, extract its name and description.
    * For each field within a type, extract its name, description, and detailed type information (e.g., `String!`, `[Release]`).
    * Write this structured data to the `outputPath` as `schema-map.json`.

2. **Integrate into Build Process (`package.json`):**
    * Create a new `npm` script: `"build:schema-map": "ts-node src/SchemaMapGenerator.ts"`.
    * Modify the existing `codegen` script to run this after the standard codegen: `"codegen": "graphql-codegen --config codegen.ts && npm run build:schema-map"`.

---

## Phase 3: The In-Memory Transformation Engine (`GraphQLObjectToArrowTransformer.ts`)

**Objective:** Implement the core logic that transforms nested GraphQL objects into a set of relational, in-memory Apache Arrow tables.

1. **Implement `GraphQLObjectToArrowTransformer.ts`:**
    * Export a primary function: `transform(responses: any[], schemaMap: any): Map<string, arrow.Table>`.
    * The function will initialize a set of Arrow `Table.new()` builders based on the entity types discovered in the `schemaMap`.
    * Implement the recursive `walk(object, parentId, parentType)` function:
        * It determines the object's type and looks it up in the `schemaMap`.
        * It extracts all scalar fields and appends them to the appropriate Arrow column builders.
        * It handles relationships by adding foreign key columns (e.g., `parentId`) to the child records.
        * It recursively calls itself for all nested objects/arrays.
    * The function will return a `Map` where keys are table names and values are the completed Arrow `Table` objects.

---

## Phase 4: Artifact Generation (`ArtifactWriter.ts`)

**Objective:** Write all final artifacts (`.parquet`, `.db`, `.sql`) from the in-memory data structures.

1. **Implement `ArtifactWriter.ts`:**
    * Export a main function: `writeArtifacts(arrowTables: Map<string, arrow.Table>, schemaMap: any, outputDir: string)`.

2. **Write Parquet Files:**
    * Iterate through the `arrowTables` map.
    * For each table, construct the Parquet `kvMetadata` object by pulling descriptions from the `schemaMap`.
    * Use the `apache-arrow` library to write each Arrow Table to its own `.parquet` file with the embedded metadata.

3. **Write DuckDB Database File:**
    * Initialize an in-memory DuckDB instance.
    * For each Arrow Table, register it with the in-memory database. DuckDB's Node.js client has highly efficient methods for this (`db.registerArrow()`).
    * Execute the `EXPORT DATABASE 'path/to/database.db'` command to serialize the entire in-memory instance to a single file.

4. **Generate `hydrate_metadata.sql`:**
    * Read the `schemaMap`.
    * Programmatically generate a SQL string containing all the `COMMENT ON TABLE ...` and `COMMENT ON COLUMN ...` statements.
    * Write this string to `hydrate_metadata.sql` in the output directory.

5. **Generate `schema.md`:**
    * Read the `schemaMap`.
    * Generate a human-readable markdown document describing the tables, columns, and relationships.

---

## Phase 5: Final Orchestration (`main.ts`)

**Objective:** Tie all the new modules together into a single, coherent, in-memory pipeline.

1. **Rewrite `main.ts` Core Logic:**
    * Parse the new CLI arguments.
    * Load the `schema-map.json` file.
    * Initialize the GraphQL client and fetch all data, storing the typed response objects in an in-memory array.
    * **Asynchronously** begin writing the `raw-responses.jsonl` audit log. This must not block the main pipeline.
    * Call the `GraphQLObjectToArrowTransformer` to convert the response objects into Arrow tables.
    * Call the `ArtifactWriter` to generate all the final Parquet, DuckDB, and SQL/Markdown artifacts from the in-memory Arrow tables.
    * Log success messages pointing to the output directory.
