# supply chain security collector

discover what supply chain security practices are visible across open source projects.

point it at any set of GitHub repos (or the entire CNCF landscape) and get back:
- which projects publish SBOMs, signatures, and attestations in their releases
- which CI pipelines reference cosign, syft, trivy, codeql, and 20+ other security tools
- per-repo and per-project summaries, queryable in SQL

the output is a DuckDB database + Parquet files. query it, graph it, or feed it to anything.

## quick start

```bash
npm install
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
npm test
```

that's it. runs against 3 CNCF projects (Kubernetes, Harbor, Jaeger), produces a DuckDB database + Parquet files + analysis tables.

then look at what you got:

```bash
# query the database directly
duckdb output/test-three-projects/current/database.db \
  -c "SELECT nameWithOwner, has_sbom_artifact, uses_cosign, uses_codeql FROM agg_repo_summary"

# generate a markdown report
npm run report -- --database output/test-three-projects/current/database.db
```

### what you get

```
output/test-three-projects/current/
├── database.db                                    # DuckDB database with all tables
├── parquet/                                       # all tables as Parquet files
│   ├── base_repositories.parquet                  # normalized entities
│   ├── base_releases.parquet
│   ├── base_release_assets.parquet
│   ├── base_workflows.parquet
│   ├── agg_repo_summary.parquet                   # analysis results
│   ├── agg_workflow_tools.parquet
│   ├── agg_artifact_patterns.parquet
│   └── ...
├── raw-responses.GetRepoDataExtendedInfo.jsonl    # API audit trail
├── security-insights-sboms.csv                    # extracted SBOM declarations
└── security-insights-attestations.csv             # extracted attestations
```

### generate a report

```bash
npm run report -- --database output/test-three-projects/current/database.db
```

Produces a structured markdown report with executive summary, tool adoption landscape, SBOM/signing coverage, and maturity-based recommendations.

### run the full CNCF landscape

```bash
npm run fetch:landscape    # download latest CNCF landscape metadata
npm start                  # collect + analyze ~230 projects
```

## how it works

```
GitHub GraphQL API → TypeScript normalizers → DuckDB (base_* tables) → SQL models → analysis (agg_* tables)
```

**Stage 1 — Collection & Normalization** (`src/neo.ts`): Fetches from GitHub's GraphQL API, transforms nested responses into flat relational `base_*` tables using typed normalizers, writes to DuckDB + Parquet.

**Stage 2 — Analysis** (`src/analyze.ts`): Runs numbered SQL models against `base_*` tables to produce `agg_*` aggregation tables detecting security patterns.

## what it detects

| Category | Examples |
|----------|----------|
| SBOM artifacts | SPDX, CycloneDX in release assets |
| Signing artifacts | `.sig`, `.asc`, cosign signatures |
| Attestations | SLSA provenance, in-toto, VEX, sigstore bundles |
| CI/CD security tools | cosign, syft, trivy, codeql, snyk, grype, docker-scout, fossa, dependabot, renovate |
| Security Insights | SECURITY-INSIGHTS.yml parsing (SBOMs, attestations declared) |

See [`docs/detection-reference.md`](docs/detection-reference.md) for the full pattern catalog.

## input formats

Two formats, auto-detected:

**Simple** — just repos:
```json
[
  {"owner": "sigstore", "name": "cosign"},
  {"owner": "anchore", "name": "syft"}
]
```

**Rich** — with CNCF project metadata (generated from landscape.yml):
```json
[
  {
    "project_name": "Kubernetes",
    "repos": [{"owner": "kubernetes", "name": "kubernetes", "primary": true}],
    "maturity": "graduated",
    "category": "Orchestration & Management",
    "has_security_audits": true
  }
]
```

Test files in `input/`:

| File | Content |
|------|---------|
| `test-single-project.json` | Kubernetes (1 repo) |
| `test-three-projects.json` | Kubernetes, Harbor, Jaeger (3 maturities) |
| `test-simple-format.json` | cosign, syft (simple format, no metadata) |
| `cncf-full-landscape.json` | Full CNCF landscape (~230 projects) |

## table layers

- **`base_*`** — normalized entities from GraphQL (repositories, releases, release_assets, workflows, branch_protection_rules, cncf_projects, cncf_project_repos, security_md, si_documents, si_sboms)
- **`agg_*`** — analysis output (repo_summary, workflow_tools, artifact_patterns, cncf_project_summary, executive_summary, tool_summary, and more)
- **`raw_*`** — full GraphQL responses preserved in database

## analyzing data

```bash
# DuckDB CLI
duckdb output/test-three-projects/current/database.db \
  -c "SELECT nameWithOwner, uses_cosign, uses_codeql, has_sbom_artifact FROM agg_repo_summary"

# Run analysis on an existing database
npm run analyze -- --database output/test-three-projects/current/database.db

# Generate markdown report
npm run report -- --database output/test-three-projects/current/database.db

# Build property graph (LadybugDB) for Cypher queries
npm run graph -- --database output/test-three-projects/current/database.db
npm run graph:list                 # list available Cypher queries
npm run graph:query -- graduated-no-signing   # run a specific query
```

Any tool that reads Parquet works too — the `parquet/` directory has every table.

## npm scripts

| Command | Description |
|---------|-------------|
| `npm test` | Quick test (3 CNCF projects) |
| `npm start` | Full CNCF landscape (~230 projects) |
| `npm run test:single` | Single project (Kubernetes) |
| `npm run test:simple` | Simple format (2 repos, no metadata) |
| `npm run collect` | Custom collection (`ts-node src/neo.ts` with flags) |
| `npm run analyze` | Run SQL analysis on existing database |
| `npm run report` | Generate markdown report from database |
| `npm run graph` | Build LadybugDB property graph |
| `npm run graph:query` | Run Cypher queries against graph |
| `npm run fetch:landscape` | Download latest CNCF landscape data |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |
| `npm run codegen` | Regenerate types from GraphQL schema |
| `npm run clean` | Remove output/, cache, generated files |

## advanced usage

```bash
npm run collect -- \
  --input your-repos.json \
  --queries GetRepoDataExtendedInfo \
  --parallel \
  --analyze
```

CLI flags: `--input <file>`, `--queries <name>`, `--parallel`, `--analyze`, `--maturity <graduated|incubating|sandbox>`, `--repo-scope <primary|all>`

## extending

**New GraphQL query:** Create `.graphql` → `npm run codegen` → write normalizer in `src/normalizers/` → register in `ArtifactWriter.ts`. See [`docs/adding-new-queries.md`](docs/adding-new-queries.md).

**New analysis:** Add numbered SQL file in `sql/models/` → register in `SecurityAnalyzer.ts`. See [`sql/README.md`](sql/README.md).

**Other GraphQL APIs:** The collection layer is generic. Swap `src/api.ts` endpoint, write new queries and normalizers. Normalizers are hand-written (not auto-generated) — each transforms nested GraphQL responses into flat relational arrays.

## interactive explorer

browse the full CNCF landscape data in your browser — no backend required:

**[Live Explorer →](https://halcyondude.github.io/supply-chain-security-collector/)**

DuckDB-WASM loads Parquet files directly in the browser. Write SQL, see charts, explore 236 projects interactively. Includes a 15-query pre-built library and an exploration journal.

## presentation

this tool was built to support a CNCF TAG Security presentation (April 2026). all materials are in the repo:

- [Presentation materials](docs/presentations/2026-04-08-tag-sc/) — deck, findings report, strategy docs, diagrams
- [Project history](docs/PROJECT-HISTORY.md) — full timeline with annotated Mermaid charts
- [Key findings](docs/presentations/2026-04-08-tag-sc/cncf-supply-chain-findings.md) — what we found across 236 projects

## documentation

- [Adding New Queries](docs/adding-new-queries.md) — step-by-step extension guide
- [Detection Reference](docs/detection-reference.md) — supply chain security pattern catalog
- [Data Model](docs/data-model.md) — table schemas and relationships
- [Output Architecture](docs/output-architecture.md) — output format and directory structure
- [SQL Analysis](sql/README.md) — SQL model architecture
- [Codegen Guide](docs/codegen-guide.md) — GraphQL code generation
- [Project Milestones](docs/milestones/README.md) — project history and evolution

## project structure

```
src/
├── neo.ts                  # CLI entry point, collection orchestrator
├── analyze.ts              # Analysis CLI
├── api.ts                  # GitHub GraphQL client
├── ArtifactWriter.ts       # DuckDB + Parquet writer
├── SecurityAnalyzer.ts     # SQL model execution engine
├── ReportGenerator.ts      # Markdown report generator
├── report-cli.ts           # Report CLI
├── normalizers/            # Query-specific normalizers (hand-written)
├── graphql/                # GraphQL query definitions
├── graph/                  # LadybugDB property graph integration
└── generated/              # GraphQL codegen output (git-ignored)

sql/models/                 # Numbered SQL analysis models (00-05)
input/                      # Test and input data files
cypher/                     # Standalone Cypher query files
```

## requirements

- Node 18+
- GitHub Personal Access Token (set `GITHUB_PERSONAL_ACCESS_TOKEN`)
- Python 3.12 (only for Jupyter notebooks)

## license

MIT
