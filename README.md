# GitHub Supply Chain Data Collector

Welcome — this repository is a practical, opinionated tool for measuring what projects ship in their releases and CI workflows. It focuses on **presence detection**: does a repository ship SBOMs, signatures, or attestations? Does its CI invoke key security tooling?

If your team is building observability or supply-chain tooling, this repository gives you a reproducible pipeline that collects, normalizes, documents, and prepares that data for analysis. It’s designed for maintainers, researchers, and platform teams who want reliable signals about supply chain security practices across many repositories.

### Why This Matters

-   **Discover** where SBOMs and signatures are being produced and where they’re missing across your ecosystem.
-   **Understand** CI adoption of key security tools (`syft`, `cosign`, `goreleaser`, etc.).
-   **Produce** compact, queryable artifacts (Parquet + CSV) for downstream analysis and powerful dashboards.

### 🚀 Highlights

*   **Robust Data Collection**: A type-safe GraphQL client using codegen ensures API calls are maintainable and catch schema changes at compile time.
*   **Flexible & Fast**: Run in a lightweight "artifacts-only" mode or a deep "--extended" mode to inspect CI workflows. Process large datasets quickly with parallel execution.
*   **Powerful Outputs**: Generates multiple analysis-ready formats from a single run:
    *   `raw-responses.jsonl`: Preserves the full, raw API response for ultimate reproducibility.
    *   `*-analyzed.json`: A clean, enriched domain model with computed security flags.
    *   `*.csv`: A flattened, normalized table perfect for spreadsheets or quick database imports.
    *   `*-analyzed.parquet`: A highly compressed, columnar dataset with embedded schema descriptions, ideal for fast analytics with tools like DuckDB.
*   **Built-in Cost Tracking**: Each run produces a `SIZE-REPORT.md` so you can track storage growth and commit only the most efficient artifacts to your repository.
*   **Awesome Developer Experience**: Comes with a mock mode for instant local development, validation scripts, and a clear, extensible architecture.

## Get Started in 3 Steps

1.  **Clone the repo and install dependencies:**

    ```bash
    git clone https://github.com/your-org/your-repo-name.git
    cd your-repo-name
    npm install
    ```

2.  **Run a quick mock analysis (no GitHub API calls needed!):**

    This command runs against a pre-configured test file (`input/test-single.jsonl`) and generates a full set of reports in the `output/` directory.

    ```bash
    npm start -- --mock --input input/test-single.jsonl
    ```

3.  **Run against real repositories:**

    Create a `.env` file from the template and add your GitHub Personal Access Token. Then, run the analyzer against the CNCF graduated projects list.

    ```bash
    # 1. Create your .env file
    cp .env.template .env

    # 2. Edit .env and set your GITHUB_PAT

    # 3. Run the analysis!
    npm start -- --input input/graduated.jsonl --parallel
    ```

    All output will be saved to a clean, timestamped directory like `output/graduated-2025-10-10T03-33-00/`.

## Viewing and Analyzing Your Data

The real power of this tool is unlocked when you start exploring the data. We highly recommend using **DuckDB** for a fantastic analysis experience.

The project includes a helper script and guide for getting started. For a great visual experience, you can launch the DuckDB Local UI directly against your results:

```bash
# Launch the Local UI with your Parquet file loaded as a 'data' view
duckdb -cmd "CREATE VIEW data AS FROM 'output/graduated-2025-10-10T03-33-00/graduated-analyzed.parquet';" -ui
```

This opens a powerful, local-only web interface in your browser where you can write SQL, explore the schema, and visualize results.

Here are a few queries to get you started:

```sql
-- Which CNCF graduated projects ship SBOMs in their releases?
SELECT repository_name_with_owner, release_tag_name, artifact_name
FROM data
WHERE artifact_is_sbom = true;

-- Get a summary of security artifact adoption
SELECT
  repo_has_sbom_artifact,
  repo_has_signature_artifact,
  COUNT(DISTINCT repository_name_with_owner) as project_count
FROM data
GROUP BY ALL
ORDER BY project_count DESC;
```

## What the Tool Produces

Each run creates a timestamped directory with a consistent set of artifacts, giving you a complete, historical record.

-   `raw-responses.jsonl` — The raw, unmodified GraphQL responses. The ultimate source of truth for reproducibility.
-   `*-analyzed.json` — An enriched domain model with computed detection flags (e.g., `isSbom`, `isSignature`).
-   `*.csv` — Flattened rows ready for SQL, spreadsheets, or any tool that loves tables.
-   `*-schema.json` — A machine-readable schema used to embed rich metadata into the Parquet file.
-   `*-analyzed.parquet` — A compressed, columnar dataset with all field descriptions and run metadata embedded. This is the **recommended format for analytics**.
-   `SIZE-REPORT.md` — A human-readable summary of file sizes from the run. We recommend committing this to Git to track artifact growth over time!

## Diving Deeper: CLI Usage

The CLI is designed for flexibility. Here are some common patterns:

```bash
# Run against all CNCF projects sequentially
./scripts/run-cncf-all.sh

# Analyze a specific CNCF maturity level
./scripts/run-target.sh incubation

# Run the extended query to analyze GitHub Actions workflows for security tools
npm start -- --input input/sandbox.jsonl --extended --parallel

# Run against a custom list of repositories
npm start -- --input path/to/my-repos.jsonl
```

## For Developers & Contributors

This project is built to be extensible. We welcome you to join the conversation, open issues, and contribute!

-   `npm run lint` — Lint hand-written code (generated code is ignored).
-   `npm run typecheck` — Run `tsc` to validate types before you commit.
-   `npm run codegen` — Regenerate the GraphQL client and types after changing queries in `src/graphql/`.
-   `npm run validate` — A helpful script that runs a full pipeline (lint, typecheck, mock run) to ensure your environment is healthy.

### How to Contribute

1.  **Add a new detection**: Extend the regex patterns in `src/analysis.ts` to find new artifacts or CI tools.
2.  **Add new data**: Add a new GraphQL query in `src/graphql/`, run `npm run codegen`, and integrate the new data into the analysis and reporting pipeline.
3.  **Improve tooling**: Enhance the reporting, add new output formats, or create new analysis notebooks.

Open a PR or join the issue tracker to get started. We'd love to hear about your use case!

### Resources

-   [DuckDB Documentation](https://duckdb.org/docs/)
-   [GraphQL Code Generator](https://www.graphql-code-generator.com/)
-   [Apache Parquet Format](https://parquet.apache.org/docs/)

## License

This project is released under the MIT License. See the `LICENSE` file for details.