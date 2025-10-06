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
- `src/report.ts` - Normalized data output generation

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
- **SPDX/CycloneDX SBOMs** - Software Bill of Materials
- **SLSA Provenance** - Build attestations
- **in-toto Attestations** - Supply chain integrity
- **VEX Documents** - Vulnerability exchange
- **Security Policies** - GitHub security configurations

### CI/CD Security Tool Detection
Identifies security tools in CI pipelines:
- Vulnerability scanners (Snyk, CodeQL, Semgrep)
- Dependency scanners (Dependabot, Renovate)
- Container scanners (Trivy, Clair)
- SAST/DAST tools

### Data Output Formats
- **JSON** - Raw structured data
- **CSV** - Normalized tabular format
- **Parquet** - Optimized for data analysis

## Architecture Decisions

### Normalized Data Structure
We use a flat, normalized structure to enable data analysis:
- One row per repository (not per release/artifact)
- Consistent field naming and typing
- Array fields serialized as JSON strings
- Boolean flags for feature presence

### Type Safety
- GraphQL Code Generator ensures API type safety
- Strict TypeScript configuration
- Runtime validation for critical paths

### Extensibility
- Modular artifact detection patterns
- Configurable CI tool recognition
- Pluggable output formats

## Contributing Guidelines

1. **Schema Changes**: Always run `npm run docs:schema` after modifications
2. **Type Safety**: Maintain strict TypeScript compliance
3. **Testing**: Add test cases for new detection patterns
4. **Documentation**: Keep HACKING.md current with architectural changes

## Troubleshooting

### GraphQL Type Errors
```bash
# Regenerate types after schema changes
npm run codegen
```

### Missing Dependencies
```bash
# Install dependencies including data analysis packages
npm install
```

### Schema Documentation Stale
```bash
# Force regeneration
npm run docs:schema --force
```

## Performance Considerations

- GraphQL queries are batched for efficiency
- Artifact detection uses efficient pattern matching
- Parquet output optimized for large datasets
- Memory usage scales with repository count

## Security Notes

- API tokens should be scoped to minimum required permissions
- Rate limiting respects GitHub API guidelines
- No sensitive data is logged or cached

## Future Enhancements

- Full Parquet implementation with compression
- Streaming processing for large datasets
- Real-time monitoring capabilities
- Integration with security scanning platforms