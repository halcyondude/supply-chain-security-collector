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
npm start
```
