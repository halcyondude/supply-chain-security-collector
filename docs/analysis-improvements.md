# Analysis Improvements - October 12, 2025

## Summary

Enhanced the analysis and reporting system to provide comprehensive security tool detection statistics and enable iterative development without re-fetching data.

## Changes Made

### 1. Enhanced Console Output (`SecurityAnalyzer.ts`)

**Before:**
```
Summary:
  Total repositories: 32
  With SBOMs: 0 (0%)
  With signatures: 3 (9%)
  Using Cosign: 9
  Using Syft: 1
  Average maturity score: 1/10
```

**After:**
```
Repository Artifacts:
  Total repositories: 32
  With SBOM artifacts: 0 (0%)
  With signature artifacts: 3 (9%)
  With attestation artifacts: 0 (0%)

CI/CD Security Tools Detected:
  Code Scanner: 22 repos, 2 unique tools, 49 workflow detections
  Dependency Scanner: 12 repos, 3 unique tools, 54 workflow detections
  Signer: 11 repos, 2 unique tools, 22 workflow detections
  Sbom Generator: 6 repos, 3 unique tools, 8 workflow detections
  Container Scanner: 4 repos, 1 unique tools, 6 workflow detections
  Vulnerability Scanner: 4 repos, 2 unique tools, 6 workflow detections
  Goreleaser: 2 repos, 1 unique tools, 2 workflow detections

Most Common Tools (≥3 repos):
  codeql                    22 repos
  cosign                    9 repos
  dependabot                7 repos
  fossa                     6 repos
  trivy                     4 repos
  renovate                  3 repos
  snyk                      3 repos
  slsa-github-generator     3 repos
```

### 2. Removed "Maturity Score" Concept

Eliminated the security maturity score metric from:
- `sql/models/03_repository_security_summary.sql` - Removed column calculation and index
- `src/SecurityAnalyzer.ts` - Removed from summary output
- `src/report.ts` - Removed from all report sections
  - Executive Summary
  - Repository Summary table
  - Detailed Findings

The maturity score was an opinionated metric that didn't add value to the analysis.

### 3. Added `--recreate` Flag

Enables iterative development without re-fetching data from GitHub API:

```bash
# Drop and recreate aggregate tables from existing base_ tables
npm run analyze -- --database path/to/database.db --recreate

# Or use the convenience script
npm run analyze:recreate -- --database path/to/database.db
```

**Implementation:**
- Added `--recreate` CLI option to `analyze.ts`
- Implemented `dropAggregateTables()` method in `SecurityAnalyzer.ts`
- Drops all `agg_*` tables before running analysis models
- Preserves `base_*` tables (the source data)

### 4. Fixed Column Reference Errors

Fixed remaining `repository_name` references in `report.ts`:
- Changed to use `nameWithOwner` column (matches the SQL schema)
- Affected functions:
  - `generateRepositorySummary()`
  - `generateDetailedFindings()`

### 5. Updated Report Sorting

Changed report sorting from "maturity score DESC" to:
```sql
ORDER BY 
  (CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END + 
   CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) DESC,
  nameWithOwner
```

This groups repositories by their artifact presence rather than an opinionated score.

## Benefits

1. **Comprehensive Tool Visibility**: Now shows all detected tool categories and specific tools with usage statistics
2. **Faster Iteration**: Can re-run analysis on existing data without API calls
3. **Cleaner Reports**: Removed opinionated metrics, focusing on factual artifact and tool detection
4. **Better Developer Experience**: Clear, actionable output showing what tools are actually being used

## Tool Categories Detected

The system now detects and reports on 7 tool categories:

1. **SBOM Generators**: syft, trivy, cdxgen, spdx-sbom-generator, tern
2. **Signers**: cosign, sigstore, slsa-github-generator, notation
3. **GoReleaser**: goreleaser
4. **Vulnerability Scanners**: snyk, anchore, twistlock, aqua, clair
5. **Dependency Scanners**: dependabot, renovate, whitesource, fossa
6. **Code Scanners**: codeql, semgrep, bandit, eslint-security
7. **Container Scanners**: docker-scout, grype, trivy

## Usage Examples

### Full Pipeline (Fetch + Analyze + Report)
```bash
npm start -- --input input/graduated.jsonl
npm run analyze -- --database output/graduated-*/GetRepoDataExtendedInfo/database.db
npm run report -- --database output/graduated-*/GetRepoDataExtendedInfo/database.db \
  --output output/graduated-*/GetRepoDataExtendedInfo/report.md
```

### Iterative Analysis (Skip Fetch)
```bash
# Modify SQL models in sql/models/
npm run analyze:recreate -- --database output/graduated-*/GetRepoDataExtendedInfo/database.db
npm run report -- --database output/graduated-*/GetRepoDataExtendedInfo/database.db \
  --output output/graduated-*/GetRepoDataExtendedInfo/report.md
```

## Code Quality

- ✅ ESLint: Zero warnings, zero errors
- ✅ All changes maintain type safety
- ✅ Backward compatible (existing databases work with new code)
