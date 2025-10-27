# Supply Chain Security Collector

collect data from {github api, static files} → schema driven normalization to relational tables → {duckdb, ladybugdb}

currently configured for github supply chain security analysis with optional cncf project metadata enrichment.

## what it does

1. **collects**: fetches data from graphql api (GitHub presently) with parallel execution & batching
2. **normalizes**: uses typeded SDK (created via GraphQL codegen) to create normalized tables (base_*)
3. **stores**: base_* tables (GraphQL responses + CNCF landscape metadata)  → to duckdb database
4. **analyzes**: runs sql models to build aggregation tables (agg_*) and analyze release artifacts and CI workflows 
## quick start

```bash
# install
npm install

# set your github token
export GITHUB_PAT=ghp_your_token_here

# run a quick test (3 projects)
npm test
```

**that's it!** test files are included in the repo.

### running the full cncf landscape

```bash
# (optional) fetch and update the CNCF landscape metadata
npm run fetch:landscape

# then run the full collection (~230 projects)
npm start landscape

# check the output
ls output/
```

### other test options

```bash
npm run test:single      # 1 project (Jaeger)
npm run test:three       # 3 projects - same as npm test
npm run test:simple      # simple (legacy) input format (2 repos, no metadata)
```

output structure:
```text
output/test-single-project-2025-10-13T06-15-42/
├── raw-responses.jsonl              # Audit trail of all API calls
└── GetRepoDataExtendedInfo/
    ├── database.db                  # DuckDB database with all tables
    └── parquet/
        ├── raw_GetRepoDataExtendedInfo.parquet  # Raw GraphQL responses
        ├── base_repositories.parquet
        ├── base_branch_protection_rules.parquet
        ├── base_releases.parquet
        ├── base_release_assets.parquet
        ├── base_workflows.parquet
        ├── base_cncf_projects.parquet        # (if CNCF input format)
        ├── base_cncf_project_repos.parquet   # (if CNCF input format)
        ├── agg_artifact_patterns.parquet
        ├── agg_workflow_tools.parquet
        ├── agg_repo_summary.parquet
        └── agg_cncf_project_summary.parquet  # (if CNCF input format)
```

## input formats

the toolkit supports two input formats:

1. **simple format** (backward compatible):

   ```json
   [
     {"owner": "kubernetes", "name": "kubernetes"},
     {"owner": "prometheus", "name": "prometheus"}
   ]
   ```

1. **rich format** (with cncf project metadata generated from CNCF curated landscape.yml):

   ```json
   [
     {
       "project_name": "Kubernetes",
       "display_name": "Kubernetes",
       "description": "...",
       "repos": [
         {"owner": "kubernetes", "name": "kubernetes", "primary": true}
       ],
       "maturity": "graduated",
       "category": "Orchestration & Management",
       "has_security_audits": true
     }
   ]
   ```

**test files**:

- `input/test-single-project.json` - kubernetes (1 repo)
- `input/test-three-projects.json` - kubernetes, harbor, atlantis (3 maturities)
- `input/test-simple-format.json` - simple format (2 repos, no metadata)

## documentation

- 📚 **[Query Reference](docs/QUERY-REFERENCE.md)** - Available queries and usage
- 🔧 **[Adding New Queries](docs/adding-new-queries.md)** - Step-by-step guide for experimentation
- 🔍 **[Detection Reference](docs/detection-reference.md)** - Supply chain security detection catalog
- 📝 **[Cleanup Summary](docs/CLEANUP-QUERIES.md)** - Recent architecture changes

## table layers

tables are prefixed by layer:

- **base_*** - normalized entities from GraphQL responses (repositories, releases, workflows, etc.)
- **agg_*** - analysis/aggregation tables (security patterns, tool detection, summary metrics)

**Note:** Raw GraphQL responses are preserved in `raw-responses.jsonl` (JSONL file), not in database tables.

```sql
-- query the normalized data
SELECT repository_name, total_releases FROM base_repositories;

-- query the analysis
SELECT repository_name, uses_cosign, uses_syft, has_sbom_artifact
FROM agg_repo_summary 
ORDER BY repository_name;
```

## analyzing data

use duckdb cli or any tool that reads parquet:

```bash
# Query a specific run's database
duckdb database.db

# Quick queries
duckdb database.db -c "SELECT * FROM agg_repo_summary"

# Export to CSV
npm run analyze -- --database database.db --export-csv summary.csv

# Run custom queries
npm run analyze -- --database database.db --query sql/queries/top_tools.sql
```

See package.json for how to run scripts directly :)

## adding new queries

1. create a new `.graphql` file in `src/graphql/`
2. run `npm run codegen` to generate types
3. add to `--queries` parameter: `--queries Query1,Query2`
4. normalizers auto-create base_* tables from typed responses

## adding new analysis

analysis happens in sql models (`sql/models/`). Data shaping should always be done in SQL or CYPHER, not typescript.

```sql
-- sql/models/04_my_analysis.sql
CREATE OR REPLACE TABLE agg_my_analysis AS
SELECT 
    repository_id,
    -- your analysis logic here
FROM base_repositories r
JOIN base_releases rel ON r.id = rel.repository_id;
```

then update `SecurityAnalyzer.ts` to run it.

## advanced usage

for custom input files or options, use the `collect` command:

```bash
# Run data collection with custom options
npm run collect -- \
  --input your-repos.json \              # required: json file with repos or projects
  --queries GetRepoDataExtendedInfo \    # required: which graphql queries to run
  --parallel \                           # optional: fetch repos in parallel
  --analyze                              # optional: run sql analysis after collection

# Note: 'collect' is an alias for 'ts-node src/neo.ts'
```

**examples**:

```bash
# simple format (backward compatible)
npm run collect -- --input input/test-three-projects.json --queries GetRepoDataExtendedInfo --analyze

# parallel execution
npm run collect -- --input input/test-three-projects.json --queries GetRepoDataExtendedInfo --parallel --analyze
```

## npm scripts reference

**standard commands**:

- `npm test` - quick test (3 projects)
- `npm start` - process full cncf landscape (~230 projects)

**testing** (for development):

- `npm run test:single` - test with kubernetes (1 project)
- `npm run test:three` - test with kubernetes, harbor, atlantis (3 projects, same as npm test)
- `npm run test:simple` - test with simple format (2 repos, no metadata)

**data operations**:

- `npm run landscape` - alias for npm start (full landscape)
- `npm run collect` - shorthand for `ts-node src/neo.ts` with custom options
- `npm run analyze` - run sql analysis on existing database
- `npm run fetch:landscape` - download cncf landscape and generate input files

**code quality**:

- `npm run lint` - check code style
- `npm run lint:fix` - auto-fix code style issues
- `npm run format` - alias for lint:fix
- `npm run typecheck` - check typescript types

**maintenance**:

- `npm run codegen` - generate typescript types from graphql schema
- `npm run clean` - remove generated artifacts (output, cache, generated files)

## environment setup

```bash
cp .env.template .env
# edit .env and add your GITHUB_PAT
```

## current analysis (supply chain security)

the included sql models detect:

- sbom formats (spdx, cyclonedx)
- signature artifacts (.sig, .asc)
- attestations, vex, slsa provenance
- ci/cd security tools (cosign, syft, trivy, codeql, etc)
- security maturity scoring

see `sql/models/` for details.

## extending to other graphql apis

the collection layer is generic and can work with any graphql api. to adapt:

1. update `src/api.ts` with your endpoint and authentication
2. create `.graphql` query files for your api in `src/graphql/`
3. run `npm run codegen` to generate typescript types
4. **write a custom normalizer** in `src/normalizers/YourQueryNormalizer.ts`
5. register your normalizer in `ArtifactWriter.ts`
6. write domain-specific sql models in `sql/models/`

**note:** normalizers are not auto-generated. each query requires a hand-written typescript normalizer to transform nested graphql responses into flat relational arrays.

## project structure

```
src/
├── neo.ts                      # main cli entry point
├── analyze.ts                  # analysis cli
├── api.ts                      # graphql client
├── ArtifactWriter.ts           # writes duckdb + parquet
├── SecurityAnalyzer.ts         # runs sql analysis models
├── normalizers/                # extract typed entities from responses
└── graphql/                    # query definitions

sql/
├── models/                     # sql analysis models (run in order)
└── queries/                    # example queries

input/                          # sample input files
output/                         # timestamped output directories
```

## scripts

```bash
npm start                       # run full landscape collection
npm test                        # quick test with 3 projects
npm run analyze                 # run analysis on existing database
npm run codegen                 # regenerate graphql types
npm run lint                    # check code style
npm run typecheck               # check typescript types
```

## requirements

- node 18+
- typescript
- github personal access token (for github api)

## license

Apache 2.0
