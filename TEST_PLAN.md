# Test Plan: GitHub Supply Chain Security Analyzer

This document outlines a comprehensive test plan for the **GitHub Supply Chain Security Analyzer**. Its purpose is to guide an AI agent, acting as a Quality Assurance Engineer, through a series of validation steps to ensure the tool's functionality, accuracy, and robustness. The plan covers environment setup, core feature validation, edge case handling, and output verification, moving the project from a "bootstrap and untested" state to "fully working."

---

## 1. Introduction

The GitHub Supply Chain Security Analyzer is a Node.js-based command-line tool designed to collect and analyze software supply chain security metadata from GitHub repositories. This test plan will validate the following core aspects:

* Correct setup and execution of the tool.
* Accurate data fetching from the GitHub GraphQL API.
* Correct identification and flagging of SBOMs, signatures, and attestations in release artifacts.
* Accurate detection of security-related tools within GitHub Actions CI workflows.
* Effective caching of API responses.
* Graceful handling of various error conditions and edge cases.
* Correct generation and content of JSON and CSV reports.

---

## 2. Test Environment Setup

### 2.3. Mock Mode for Development and Testing

To avoid GitHub API rate limits and enable rapid development/testing, the tool supports a **mock mode**. When the environment variable `MOCK_GITHUB=1` is set, the analyzer will use local mock data (from `src/mockData.ts`) instead of making real API calls. This allows you to:

* Run all core analysis and reporting logic without a GitHub PAT or network access.
* Test most features and edge cases instantly, without waiting for API responses or risking rate limits.
* Safely develop and debug the tool before using a real PAT.

**How to use mock mode:**

1. In your shell, run:

    ```bash
    export MOCK_GITHUB=1
    npm start
    ```

2. The tool will print a message indicating mock mode is enabled. All repository data will be loaded from `src/mockData.ts`.
3. Reports will be generated as usual in `output/`.

**Limitations:**
* Only repositories present in `src/mockData.ts` will return data; others will be skipped with a warning.
* No real API calls are made, so this mode cannot test live error handling (e.g., rate limits, real network failures).
* To test with real GitHub data, unset `MOCK_GITHUB` and ensure `GITHUB_PAT` is set.

---

Before executing any test cases, ensure the environment is correctly configured.

### 2.1. Prerequisites

* **Node.js**: Version 18.x or later installed.
* **npm**: Latest version installed (comes with Node.js).
* **Git**: Installed for cloning the repository.
* **GitHub Personal Access Token (PAT)**: A PAT with `repo` scope (for public and private repository access) is required. This should be obtained from [GitHub Developer Settings](https://github.com/settings/tokens).

### 2.2. Project Installation

The AI agent should perform the following shell commands to set up the project.

1. **Clone the repository:**

    ```bash
    git clone <repository_url> # Replace <repository_url> with the actual repo URL
    cd <project_root>
    ```

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Configure Environment Variables (`.env`):**
    * Create a file named `.env` in the root of the project directory.

    * Add your GitHub PAT to this file (skip if using mock mode):

        ```env
        GITHUB_PAT=ghp_YourPersonalAccessTokenHere
        ```

        **Note:** Replace `ghp_YourPersonalAccessTokenHere` with your actual GitHub PAT. If you are using mock mode, you do not need to set this variable.
4. **Define Target Repositories (`src/config.ts`):**
    * Ensure `src/config.ts` contains the desired list of repositories to analyze. For testing, it's recommended to start with a diverse set including:
        * If using mock mode, only repositories present in `src/mockData.ts` will return data.
        * A repository known to have SBOMs/signatures (e.g., `sigstore/cosign`).
        * A repository with identifiable CI security tools (e.g., `anchore/syft`).
        * A simple repository with no explicit SBOMs or security workflows.
        * A non-existent repository (for error handling tests).

        ```typescript
        // Example for src/config.ts for testing
        export const repositories: RepositoryTarget[] = [
            { owner: 'sigstore', name: 'cosign' },
            { owner: 'anchore', name: 'syft' },
            { owner: 'github', name: 'docs' }, // A large repo, unlikely to have direct SBOMs/signatures in releases, might have basic workflows
            { owner: 'nonexistent-org', name: 'nonexistent-repo-123' }, // For error testing
        ];
        // In mock mode, only the first three will return data (see src/mockData.ts)
        ```

5. **Generate the GraphQL SDK:**

    ```bash
    npm run codegen
    ```

    Confirm that `src/generated/graphql.ts` is created or updated.

---

## 3. Testing Strategy

The testing strategy will focus on **End-to-End (E2E) and Integration tests**. Given the nature of the tool (CLI utility interacting with external APIs and generating reports), these types of tests are most effective for validating the overall workflow.

### 3.1. General Validation Steps for Each Test Case

**Mock Mode Applicability:**
* All test cases except those specifically requiring real API/network errors (e.g., rate limit handling, real non-existent repo errors) can be run in mock mode.
* For most development, set `MOCK_GITHUB=1` to avoid using your PAT and to iterate quickly.

For each test case, the agent should:

1. **Execute the `npm start` command.**
2. **Monitor console output:** Look for success messages, error messages, and caching indications.
3. **Inspect generated files:** Verify the existence and content of `output/report.json` and `output/report.csv`.
4. **Analyze file content:**
    * For `report.json`: Check the overall structure, presence of expected data points (repository info, releases, artifacts, workflows), and the accuracy of `summary` flags (`hasSbomArtifact`, `hasSignatureArtifact`, `sbomCiTools`).
    * For `report.csv`: Check column headers, row counts, and the accuracy of boolean flags and comma-separated lists for detected tools.

---

## 4. Detailed Test Cases

### Category A: Core Functionality (Happy Path)

#### Test Case A.1: Successful Analysis of Multiple Repositories

* **Objective:** Verify the tool can successfully fetch data for multiple valid repositories and produce reports without errors.
* **Preconditions:** `src/config.ts` contains at least two *valid, accessible* GitHub repositories (e.g., `sigstore/cosign`, `anchore/syft`). GitHub PAT is correctly configured.
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * Console output indicates successful fetching and analysis for each configured repository.
  * `output/report.json` and `output/report.csv` are created.
  * Reports contain entries for all configured repositories.

#### Test Case A.2: Artifact Detection (SBOM, Signature, Attestation)

* **Objective:** Verify the tool correctly identifies and flags SBOMs, signatures, and attestations within release assets.
* **Preconditions:** `src/config.ts` includes `sigstore/cosign` (known to have signed releases and potentially SBOMs).
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * In `output/report.json`, for `sigstore/cosign`, `analysis.summary.hasSbomArtifact` and `analysis.summary.hasSignatureArtifact` should be `true`. Inspect `releases[].artifacts` for specific names matching SBOM/signature patterns.
  * In `output/report.csv`, for `sigstore/cosign`, `has_sbom_artifact` and `has_signature_artifact` columns should show `TRUE`.

#### Test Case A.3: CI Workflow Tool Detection

* **Objective:** Verify the tool correctly detects security-related tools within GitHub Actions workflow files.
* **Preconditions:** `src/config.ts` includes `anchore/syft` (known to use `syft` or similar SBOM generators in CI) and potentially `sigstore/cosign` (known to use `goreleaser` which can generate SBOMs).
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * In `output/report.json`:
    * For `anchore/syft`, `analysis.summary.sbomCiTools` should contain relevant keywords (e.g., `'sbom-generator'`, `'goreleaser'`).
    * For `sigstore/cosign`, `analysis.summary.sbomCiTools` should contain `'goreleaser'` and potentially `'signer'`.
  * In `output/report.csv`:
    * `sbom_ci_tools_detected` column for `anchore/syft` and `sigstore/cosign` should list the detected tools.

#### Test Case A.4: Caching Mechanism Validation

* **Objective:** Verify that API responses are cached and subsequent runs for the same repositories use cached data.
* **Preconditions:** `src/config.ts` contains valid repositories.
* **Execution:**
    1. Run `npm start` once.
    2. Wait for completion.
    3. Run `npm start` a second time *immediately* (within the cache TTL, which is 24 hours by default).
* **Expected Outcome:**
  * First run: Console output should show "🔄 Fetching data from GitHub API..." and "👍 Data fetched and cached successfully." for each repository.
  * Second run: Console output should show "✅ Found data in cache." for each repository, indicating no new API calls were made for cached data.
  * Reports should be identical to the first run.

### Category B: Edge Cases & Error Handling

#### Test Case B.1: Missing GitHub PAT

**Note:** In mock mode, the tool does not require a GitHub PAT and will not error if it is missing. To test this case, ensure `MOCK_GITHUB` is unset.

* **Objective:** Verify the tool gracefully handles the absence of the `GITHUB_PAT` environment variable.
* **Preconditions:** Comment out or delete the `GITHUB_PAT` line in `.env`.
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * The script should exit with an error.
  * Console output should display a clear error message: "Error: GITHUB_PAT environment variable not set."
  * No report files should be generated.

#### Test Case B.2: Non-Existent Repository

**Note:** In mock mode, only repositories present in `src/mockData.ts` will return data. Others will be skipped with a warning, not a real API error. To test real error handling, unset `MOCK_GITHUB` and use a real PAT.

* **Objective:** Verify the tool handles requests for non-existent repositories gracefully, skipping them and continuing with others.
* **Preconditions:** `src/config.ts` contains at least one *valid* repository and one *non-existent* repository (e.g., `{ owner: 'nonexistent-org', name: 'nonexistent-repo-123' }`). GitHub PAT is configured.
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * Console output should show an error message for the non-existent repository (e.g., "Failed to fetch data for nonexistent-org/nonexistent-repo-123").
  * The tool should continue processing other valid repositories.
  * `output/report.json` and `output/report.csv` should be generated, but they should *not* contain an entry for the non-existent repository.

#### Test Case B.3: Repository with No Releases/Workflows

* **Objective:** Verify the tool handles repositories that might lack releases or GitHub Actions workflows without crashing.
* **Preconditions:** `src/config.ts` includes a repository known to have no releases or no `.github/workflows` directory (e.g., a very new, empty, or non-CI-driven repository).
* **Execution:**

    ```bash
    npm start
    ```

* **Expected Outcome:**
  * The tool should process the repository without errors.
  * In `output/report.json`, for this repository, the `releases` array or `workflows` array should be empty, and corresponding `summary` flags (`hasSbomArtifact`, `hasSignatureArtifact`, `sbomCiTools`) should be `false` or empty.
  * In `output/report.csv`, the relevant columns should reflect 'N/A' or `FALSE`.

#### Test Case B.4: API Rate Limit Handling (Conceptual)

**Note:** Mock mode does not simulate real API rate limits. This test must be performed with real API calls.

* **Objective:** Understand and document the tool's behavior when GitHub API rate limits are encountered.
* **Preconditions:** This is difficult to replicate programmatically. It requires making many requests in a short period to exceed GitHub's rate limits.
* **Execution:** The agent should *not* explicitly attempt to trigger rate limits unless specifically instructed. Instead, it should document the expected behavior.
* **Expected Outcome (Conceptual):**
  * If a rate limit is hit, the `graphql-request` client would typically throw an error. The `main.ts` script's `try-catch` block for `sdk.GetRepoData` should log this error, and the tool should gracefully skip the affected repository (as currently implemented).
  * The tool does not currently have explicit retry logic or rate limit awareness beyond basic error catching. This could be a future enhancement.

### Category C: Report Validation

#### Test Case C.1: JSON Report Structure and Content

* **Objective:** Validate the structure, completeness, and accuracy of `output/report.json`.
* **Preconditions:** Successful run with a diverse set of repositories (from Test Cases A.1, A.2, A.3).
* **Execution:** Open `output/report.json` and perform a manual/programmatic review.
* **Expected Outcome:**
  * The file should be a valid JSON array.
  * Each array element should correspond to a analyzed repository.
  * Each repository object should contain `name`, `url`, `description`, `releases`, `workflows`, and `summary` properties.
  * `releases` should be an array of objects, each containing `tagName`, `name`, `createdAt`, and an `artifacts` array.
  * `artifacts` should contain `name`, `isSbom`, `isSignature`, `isAttestation`.
  * `workflows` should be an array of objects, each containing `name` and `detectedSbomTools`.
  * `summary` should accurately reflect the `hasSbomArtifact`, `hasSignatureArtifact`, `hasAttestationArtifact` (booleans), and `sbomCiTools` (array of strings) based on the detailed data.

#### Test Case C.2: CSV Report Structure and Content

* **Objective:** Validate the structure, readability, and data integrity of `output/report.csv`.
* **Preconditions:** Successful run with a diverse set of repositories (from Test Cases A.1, A.2, A.3).
* **Execution:** Open `output/report.csv` using a spreadsheet viewer or text editor and perform a manual/programmatic review.
* **Expected Outcome:**
  * The first row should contain correct, human-readable column headers (e.g., `repository_name`, `has_sbom_artifact`, `sbom_ci_tools_detected`).
  * Each subsequent row should correspond to a analyzed repository.
  * Data types should be appropriate (e.g., booleans as `TRUE`/`FALSE`, lists as comma-separated strings).
  * Repository descriptions should be sanitized (newlines removed) for single-cell readability.
  * The number of rows (excluding header) should match the number of successfully analyzed repositories.

---

## 5. Agent Instructions for Execution and Reporting

1. **Prioritize `FIXNOW.md`:** Before executing any tests, apply all changes specified in `FIXNOW.md`. Confirm these changes have been made in the respective files.
2. **Follow Setup:** Execute all steps under "2. Test Environment Setup". Document any issues encountered during setup.
3. **Execute Test Cases:** Proceed through "4. Detailed Test Cases" sequentially. For each test case:
    * Clearly state the test case being executed (e.g., "Executing Test Case A.1: Successful Analysis of Multiple Repositories").
    * Perform the "Execution" steps.
    * Record the actual outcome (console output, file existence, partial file contents, specific flag values).
    * Compare the "Actual Outcome" against the "Expected Outcome."
    * Mark the test case as **PASS** or **FAIL**. If **FAIL**, provide detailed steps to reproduce and observed discrepancies.
4. **Consolidate Findings:** After all test cases are executed, summarize the results:
    * Total number of test cases run.
    * Number of passed, failed, and skipped test cases.
    * List all failed test cases with a brief description of the failure.
5. **Final Recommendation:** Based on the test results, provide a recommendation on the project's readiness:
    * **Ready for Production:** All critical tests passed.
    * **Needs Further Development/Fixes:** Identified failures need addressing.
    * **Requires More Investigation:** Ambiguous results or unhandled edge cases.
