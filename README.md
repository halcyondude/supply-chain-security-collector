# GitHub Supply Chain Security Analyzer

A powerful command-line tool for analyzing release artifacts and CI/CD workflows in GitHub repositories to identify software supply chain security metadata like SBOMs.

## Features

- **Comprehensive Data Collection**: Fetches repository details, descriptions, and links.
- **Release Analysis**: Gathers the last 3 releases and inspects all associated artifacts.
- **Artifact Identification**: Automatically flags potential SBOMs (SPDX, CycloneDX), signatures (`.sig`, `.asc`), and other attestations.
- **CI/CD Workflow Inspection**: Enumerates all GitHub Actions workflows and analyzes their content for common SBOM generation tools (e.g., `syft`, `trivy`, `cdxgen`).
- **Type-Safe API Calls**: Uses GraphQL Code Generator to create a fully-typed TypeScript SDK for the GitHub API.
- **Smart Caching**: Caches API responses to speed up subsequent runs and reduce API usage.
- **Dual-Format Reporting**: Generates a detailed `report.json` and an easy-to-use `report.csv`.

## Prerequisites

- **Node.js**: Version 18.x or later.
- **npm**: Comes bundled with Node.js.
- **GitHub Personal Access Token (PAT)**: You need a PAT with the `repo` scope to query repository data.
  - Go to [GitHub Developer Settings](https://github.com/settings/tokens) to generate a new token (classic).
  - Ensure it has `repo` scope to access public and private repository data.

## Installation & Setup

1. **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd <project_root>
    ```

2. **Install dependencies:**

    ```s
    <project_root>/
    ├── .env                  # For storing your GitHub PAT (not committed)
    ├── .gitignore
    ├── codegen.ts            # Configuration for GraphQL Code Generator
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── main.ts           # Main script entry point
    │   ├── analysis.ts       # Logic for analyzing artifacts and workflows
    │   ├── config.ts         # Repository list configuration
    │   ├── report.ts         # Logic for generating JSON and CSV reports
    │   ├── generated/        # Auto-generated GraphQL SDK
    │   └── graphql/
    │       └── GetRepoData.graphql  # The GraphQL query file
    ├── output/               # Generated reports (gitignored)
    │   ├── report.json
    │   └── report.csv
    └── .cache/               # Cached API responses
    ```
    ```

5. **Generate the GraphQL SDK:**
    This step introspects the GitHub GraphQL schema and generates a typed SDK based on your queries.

    ```bash
    npm run codegen
    ```

    You only need to re-run this if you change the GraphQL queries in `src/graphql/`.

## Running the Analysis

Execute the main script from the project root:

```bash

## Usage

### 1. Install dependencies

```bash
npm install
```

### 2. Generate GraphQL types

```bash
npm run codegen
```

### 3. Prepare repository input files

The tool now reads repository targets from input files (JSONL format, one `{ "owner": ..., "name": ... }` per line).

To generate input files for CNCF Sandbox, Incubation, and Graduated projects:

```bash
chmod +x scripts/fetch-cncf-landscape.sh
./scripts/fetch-cncf-landscape.sh
```

This will create:
- `input/sandbox.jsonl`
- `input/incubation.jsonl`
- `input/graduated.jsonl`

You can also create your own input file in the same format.


## CLI Usage

The CLI supports the following options:

| Option                | Description                                              |
|-----------------------|----------------------------------------------------------|
| `-h, --help`          | Show help and usage information                          |
| `-i, --input <file>`  | Input JSONL file with repository list (default: sandbox) |
| `--mock`              | Run in mock mode (no GitHub API calls)                  |
| `-o, --output <dir>`  | Output directory for reports (default: output)           |
| `-V, --version`       | Show CLI version                                         |

### Show help

```bash
npx ts-node src/main.ts --help
```

### Run in mock mode (no GitHub API required)

```bash
npx ts-node src/main.ts --mock --input input/test-single.jsonl --output output
```

### Run with real GitHub data

Ensure you have a `.env` file with your `GITHUB_PAT` set.

```bash
npx ts-node src/main.ts --input input/graduated.jsonl --output output
```

### Example output

```
🚀 Starting GitHub Supply Chain Security Analysis...
🧪 MOCK MODE ENABLED: Using mock GitHub data.

Processing repository: sigstore/cosign
✅ Comprehensive JSON report saved to: .../output/report.json
✅ CSV report saved to: .../output/report.csv

    GitHub Supply Chain Security Summary  
┌────────────────────┬───────┬────────────┬───────────────┬────────────────────────────────────────┬────────────────┐
│ Repo               │ SBOM  │ Signature  │ Attestation   │ CI Tools                               │ Latest Release │
├────────────────────┼───────┼────────────┼───────────────┼────────────────────────────────────────┼────────────────┤
│ cosign             │ ✔     │ ✔          │ ✔             │ sbom,signature,attestation,sbom-gen... │ v2.2.1         │
└────────────────────┴───────┴────────────┴───────────────┴────────────────────────────────────────┴────────────────┘

Legend: ✔ = present, ✗ = absent, - = none
Totals: Repos: 1  SBOM: 1  Signature: 1  Attestation: 1  CI Tools: 1

✨ Analysis complete.
```


### 6. View reports

- JSON: `output/report.json`
- CSV: `output/report.csv`

## Validation & CI

To validate your environment, code quality, and a basic mock run, use the provided validation script:

```bash
chmod +x validate.sh
./validate.sh
```

This will:
- Run ESLint (if available)
- Type-check the codebase
- Run tests (if defined)
- Run the CLI in mock mode with a test input file

All steps must pass for a successful validation.
