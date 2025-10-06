# HACKING.md - Development Guide

## Quick Start for Contributors

This repository analyzes GitHub repositories for supply chain security metadata. The tool fetches data via GraphQL, processes it through enhanced detection patterns, and outputs normalized data for analysis.

## Schema Documentation Management

### Automatic Schema Documentation

We maintain automated documentation of our data schema to ensure consistency and enable data analysis workflows:

```bash
# Generate schema documentation
npm run docs:schema

# Or run directly
./scripts/generate-schema-docs.sh
```

This will:
1. Generate `SCHEMA.md` with field definitions and types
2. Create `schema.json` for programmatic access
3. Update data dictionary for analysts

### When to Update Schema Documentation

Run schema documentation generation whenever you modify:
- GraphQL queries (`src/graphql/GetRepoData.graphql`)
- Analysis logic (`src/analysis.ts`) 
- Report structure (`src/report.ts`)
- Artifact detection patterns

## Development Workflow

### 1. Setup
```bash
npm install
npm run codegen  # Generate GraphQL types
```

### 2. Making Changes

**GraphQL Schema Updates:**
1. Modify `src/graphql/GetRepoData.graphql`
2. Run `npm run codegen`
3. Update TypeScript types as needed
4. Run `npm run docs:schema`

**Analysis Enhancement:**
1. Update detection patterns in `src/analysis.ts`
2. Add test cases for new patterns
3. Run `npm run docs:schema`

**Output Format Changes:**
1. Modify `src/report.ts`
2. Update `NormalizedRow` type definition
3. Run `npm run docs:schema`

### 3. Testing
```bash
# Test with single repository
npm run test:single

# Test with multiple repositories  
npm run test:three

# Test with all CNCF data
npm run test:all
```

### 4. Documentation
```bash
# Update schema documentation
npm run docs:schema

# Verify README is current
npm run docs:verify
```

## Key Files and Their Roles

### Core Application

- `src/main.ts` - CLI entry point and orchestration
- `src/api.ts` - GitHub GraphQL API client
- `src/analysis.ts` - Artifact detection and classification
- `src/report.ts` - Report generation (analyzed JSON, CSV, Parquet schema)
- `src/rawResponseWriter.ts` - Raw API response logging to JSONL with metadata

### Data Schema

- `src/graphql/GetRepoData.graphql` - GraphQL query definition
- `src/generated/` - Auto-generated TypeScript types
- `schema/` - GraphQL schema files

### Configuration

- `src/config.ts` - Application configuration
- `.env` - Environment variables (create from .env.example)

## Supply Chain Security Features

### Enhanced Artifact Detection

The tool detects modern supply chain security artifacts:

```typescript
// Regex patterns to identify potential SBOM/security artifacts in release asset names
const ARTIFACT_KEYWORDS = {
  // Legacy patterns for backward compatibility
  SBOM: /\b(sbom|spdx|cyclonedx)\b/i,
  SIGNATURE: /\.(sig|asc|pem|pub)$/i,
  ATTESTATION: /attestation/i,
  
  // Enhanced supply chain security patterns
  SPDX_SBOM: /\b(spdx|\.spdx)\b/i,
  CYCLONEDX_SBOM: /\b(cyclonedx|cdx|\.cdx)\b/i,
  VEX_DOCUMENT: /\b(vex|\.vex)\b/i,
  SLSA_PROVENANCE: /\b(provenance|slsa|\.intoto\.jsonl)\b/i,
  IN_TOTO_LINK: /\b(link|\.link)\b/i,
  IN_TOTO_LAYOUT: /\b(layout|\.layout)\b/i,
  CONTAINER_ATTESTATION: /\b(cosign|rekor|fulcio)\b/i,
  LICENSE_FILE: /\b(license|copying|notice)\b/i,
};
```

### CI/CD Security Tool Detection

Identifies security tools in CI pipelines:


```typescript
// Regex patterns to identify security tools in GitHub Actions workflow YAML content
const CI_TOOL_KEYWORDS = {
  SBOM_GENERATORS: /\b(syft|trivy|cdxgen|spdx-sbom-generator)\b/i,
  SIGNERS: /\b(cosign|sigstore|slsa-github-generator)\b/i,
  GORELEASER: /\b(goreleaser\/goreleaser-action)\b/i, // Goreleaser can generate SBOMs
  
  // Enhanced security tool detection
  VULNERABILITY_SCANNERS: /\b(snyk|anchore|twistlock|aqua|clair)\b/i,
  DEPENDENCY_SCANNERS: /\b(dependabot|renovate|whitesource|fossa)\b/i,
  CODE_SCANNERS: /\b(codeql|semgrep|bandit|eslint-security)\b/i,
  CONTAINER_SCANNERS: /\b(docker-scout|grype|trivy)\b/i,
};
```

## Contributing Guidelines

1. Always run `npm run docs:schema` after modifications to queries
2. Maintain strict TypeScript compliance - no warnings!
3. Add test cases for new detection patterns
4. Keep HACKING.md current

## Troubleshooting

```bash
npm install 
```

```bash
# Regenerate types after .graphql schema changes
npm run codegen
```

```bash
# Force regeneration
npm run docs:schema --force
```

## Security Notes

- API tokens should be scoped to minimum required permissions
- .env file should not be committed to version control
