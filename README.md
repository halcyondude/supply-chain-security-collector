# GraphQL Data Engineering Toolkit

collect data from any graphql api → normalize to relational tables → analyze with sql → export to duckdb + parquet

currently configured for github supply chain security analysis, but the collection/normalization layers are fully generic.

## what it does

1. **collects**: fetches data from graphql apis with parallel execution
2. **normalizes**: extracts typed entities into relational tables (base_*)
3. **stores**: writes to duckdb database + parquet files
4. **analyzes**: runs sql models to detect patterns (agg_*)

## quick start

```bash
# install
npm install

# run against 3 test repos
npm start -- --input input/test-three-repos.jsonl --queries GetRepoDataExtendedInfo --analyze --parallel

# check the output
ls output/test-three-repos-*/GetRepoDataExtendedInfo/
```

output structure:
```
output/test-three-repos-2025-10-12T05-38-10/
├── raw-responses.jsonl              # audit trail of all api calls
└── GetRepoDataExtendedInfo/
    ├── database.db                  # duckdb with all tables
    └── parquet/                     # individual parquet files
        ├── base_repositories.parquet
        ├── base_releases.parquet
        ├── base_release_assets.parquet
        ├── base_workflows.parquet
        ├── agg_artifact_patterns.parquet
        ├── agg_workflow_tools.parquet
        └── agg_repo_summary.parquet
```

## table layers

tables are prefixed by layer:

- **raw_*** - original graphql responses (json blob)
- **base_*** - normalized entities from graphql types (repositories, releases, etc)
- **agg_*** - analysis/aggregation tables (security patterns, metrics)

```sql
-- query the normalized data
SELECT repository_name, total_releases FROM base_repositories;

-- query the analysis
SELECT repository_name, security_maturity_score, uses_cosign, uses_syft 
FROM agg_repo_summary 
ORDER BY security_maturity_score DESC;
```

## analyzing data

use duckdb cli or any tool that reads parquet:

```bash
# interactive sql
duckdb output/.../GetRepoDataExtendedInfo/database.db

# quick queries
duckdb database.db -c "SELECT * FROM agg_repo_summary"

# export to csv
npm run analyze -- --database database.db --export-csv summary.csv

# run custom queries
npm run analyze -- --database database.db --query sql/queries/top_tools.sql
```

## adding new queries

1. create a new `.graphql` file in `src/graphql/`
2. run `npm run codegen` to generate types
3. add to `--queries` parameter: `--queries Query1,Query2`
4. normalizers auto-create base_* tables from typed responses

## adding new analysis

analysis happens in sql models (`sql/models/`):

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

## cli options

```bash
npm start -- \
  --input repos.jsonl \              # required: list of {owner, name}
  --queries GetRepoData \            # required: which graphql queries to run
  --parallel \                       # optional: fetch repos in parallel
  --analyze                          # optional: run sql analysis after collection
```

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

## extending to other apis

the collection and normalization layers are generic. to use with a different graphql api:

1. update `src/api.ts` with your endpoint/auth
2. create `.graphql` queries for your api
3. run `npm run codegen`
4. the normalizers will auto-generate base_* tables
5. write domain-specific sql models in `sql/models/`

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
npm start                       # run data collection
npm run analyze                 # run analysis on existing database
npm run codegen                 # regenerate graphql types
npm run build                   # compile typescript
npm run lint                    # check code
npm run typecheck               # check types
```

## requirements

- node 18+
- typescript
- github personal access token (for github api)

## license

MIT
