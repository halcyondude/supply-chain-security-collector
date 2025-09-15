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



## About npx

This project uses `npx` to run the CLI directly from your local dependencies, without requiring a global install. `npx` is a package runner that comes with npm (since version 5.2.0+). It allows you to execute binaries from your project's `node_modules/.bin` or fetch and run packages from the npm registry on demand.

When you run a command like:

```bash
npx ts-node src/main.ts --help
```

`npx` ensures that the correct version of `ts-node` (and all dependencies) are used from your project, so you don't need to install anything globally. This makes it easy to run scripts and CLIs in a reproducible, project-local way.

---

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


## Validation, Cleaning, and Common Scripts

This project provides convenient npm scripts for all common development and validation tasks:

| Script              | Description                                                      |
|---------------------|------------------------------------------------------------------|
| `npm run validate`  | Runs the full trust-building validation script (`validate-with-mocks.sh`). Checks lint, type, CLI mock run, and report output. |
| `npm run lint`      | Runs ESLint on all hand-written code in `src/`                   |
| `npm run typecheck` | Runs TypeScript type checking (`tsc --noEmit`)                   |
| `npm run codegen`   | Regenerates GraphQL types and SDK from schema and queries         |
| `npm run clean`     | Removes build, output, cache, and generated directories           |

### Example: Full Validation

```bash
npm run validate
```

This will:
- Install dependencies
- Run codegen
- Lint the codebase (if ESLint is installed)
- Type-check the codebase
- Run tests (if defined)
- Run the CLI in mock mode with a test input file
- Check for generated report files

All steps must pass for a successful validation.

### Example: Clean the Project

```bash
npm run clean
```

This will remove all build artifacts, output, cache, and generated code. Use before a fresh build or troubleshooting.

---

## GraphQL Code Generation: Best Practices (Exemplar)

This project uses [GraphQL Code Generator](https://www.graphql-code-generator.com/) to create a fully-typed TypeScript SDK for the GitHub GraphQL API. The following practices make this a robust, maintainable, and lint-free codegen setup:


### Why Use GraphQL Codegen?

- **Type Safety**: All API calls are type-checked end-to-end, reducing runtime errors.
- **Productivity**: No need to hand-write types for queries or responses.
- **Maintainability**: Schema or query changes are automatically reflected in generated types.



### How We Integrate Codegen

- **Config File**: All codegen options are in `codegen.ts` for transparency and reproducibility.
- **Versioned Schema**: The GraphQL schema is checked in and versioned, ensuring CI reproducibility and provenance.
- **Pre-Scripts**: `npm run codegen` is run before builds/tests to ensure types are always up to date.
- **Generated Directory**: All generated files are placed in `src/generated/` and excluded from linting (see ESLint config).
- **Strict Linting**: Hand-written code is always ESLint clean. Generated files are allowed to use `any` if required by the codegen tool, but you can further tune codegen plugins to minimize this.
- **Watch Mode**: For rapid development, you can use codegen in watch mode to regenerate types on every schema or query change.



### Lint-Free Codegen Tips

- **Tune Plugins**: Use the latest `@graphql-codegen/typescript` and related plugins, and enable strict options to minimize `any` in generated code.
- **Disable Lint for Generated Files**: Add `/* eslint-disable */` to the top of generated files, or exclude them in your ESLint config, to avoid polluting lint results.
- **Schema Provenance**: Always check in the exact schema used for codegen, and document how to update it.
- **CI Integration**: Run codegen and lint as part of your CI pipeline to catch schema/query drift early.


### Example: Running Codegen

```bash
npm run codegen
```

This will generate or update all TypeScript types and SDKs in `src/generated/` based on your current schema and queries.

### Example: codegen.ts

```ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './src/graphql/schema.graphql',
  documents: ['./src/graphql/**/*.graphql'],
  generates: {
    './src/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-graphql-request',
      ],
    },
  },
  hooks: {
    afterAllFileWrite: ['prettier --write'],
  },
};
export default config;
```

---

For more, see the [GraphQL Code Generator docs](https://www.graphql-code-generator.com/) and this repo's `codegen.ts` for a real-world, production-ready example.

---

## Linting and Generated Code

### Why are there ESLint warnings in `src/generated/`?

The TypeScript GraphQL Code Generator may produce code that triggers strict ESLint rules (e.g., `no-explicit-any`, `no-unused-vars`). This is a known and accepted limitation of codegen tools, as they must support a wide range of schemas and queries.

**Best Practices in this Project:**
- All generated files are placed in `src/generated/`.
- The codegen config adds `/* eslint-disable */` to the top of every generated file.
- `.eslintignore` includes `src/generated/` to ensure ESLint does not report or fail on generated code.
- Only hand-written code is required to be 100% ESLint clean.

**You should:**
- Never manually edit files in `src/generated/`.
- If you see lint errors in generated files, they can be safely ignored.
- If you see lint errors in your own code, fix them before committing or merging.

This approach is recommended by the GraphQL Code Generator maintainers and is standard in the TypeScript ecosystem.
