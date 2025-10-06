#!/bin/bash

# generate-schema-docs.sh
# Generates comprehensive schema documentation from JSON data files and schema definitions

set -e

echo "🔄 Generating schema documentation from output files..."

# Run the TypeScript schema generator
npx ts-node scripts/generate-schema-docs.ts

echo "✨ Schema documentation generation complete!"

This document describes the data schema for the GitHub Repository Supply Chain Security Analyzer. The tool outputs normalized data in JSON and CSV formats, along with Parquet schema files for downstream conversion.

## Generated Schema

*This documentation is automatically generated. Do not edit manually.*
*Last updated: $(date)*

EOF

# Extract schema from TypeScript types
echo "📊 Extracting schema from TypeScript definitions..."

# Get the NormalizedRow type definition
node -e "
const fs = require('fs');
const reportContent = fs.readFileSync('src/report.ts', 'utf8');

// Extract NormalizedRow interface
const normalizedRowMatch = reportContent.match(/interface NormalizedRow \{([^}]+)\}/s);
if (!normalizedRowMatch) {
  console.error('Could not find NormalizedRow interface');
  process.exit(1);
}

const fields = normalizedRowMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'))
  .map(line => {
    const match = line.match(/(\w+)\??\s*:\s*([^;]+);?/);
    if (match) {
      const [, name, type] = match;
      const isOptional = line.includes('?');
      return {
        name,
        type: type.replace(/\s*\/\/.*$/, '').trim(),
        optional: isOptional,
        description: ''
      };
    }
    return null;
  })
  .filter(Boolean);

console.log('## Fields\n');
console.log('| Field | Type | Optional | Description |');
console.log('|-------|------|----------|-------------|');

fields.forEach(field => {
  const optional = field.optional ? '✓' : '';
  console.log(\`| \${field.name} | \\\`\${field.type}\\\` | \${optional} | TODO: Add description |\`);
});

console.log('\n## Field Categories\n');

// Categorize fields
const categories = {
  'Repository Identity': ['id', 'nodeId', 'name', 'owner', 'fullName', 'url'],
  'Repository Metadata': ['description', 'primaryLanguage', 'languages', 'topics', 'isPrivate', 'isFork', 'isArchived'],
  'Repository Statistics': ['starCount', 'forkCount', 'watcherCount', 'issueCount', 'pullRequestCount'],
  'Licensing & Security': ['license', 'hasVulnerabilityAlerts', 'hasSecurityPolicy', 'hasDependabot'],
  'Release Information': ['latestReleaseTag', 'latestReleaseDate', 'releaseCount'],
  'Artifact Detection': ['artifactTypes', 'artifactCount', 'hasSBOM', 'hasSLSA', 'hasInToto', 'hasVEX'],
  'CI/CD Analysis': ['ciTools', 'ciToolCount', 'hasGitHubActions', 'hasOtherCI'],
  'Quality Metrics': ['hasReadme', 'hasContributing', 'hasCodeOfConduct', 'hasLicense'],
  'Branch Protection': ['hasProtectedBranches', 'branchProtectionRules'],
  'Timestamps': ['createdAt', 'updatedAt', 'pushedAt', 'analysisDate']
};

Object.entries(categories).forEach(([category, fieldNames]) => {
  console.log(\`### \${category}\n\`);
  const categoryFields = fields.filter(f => fieldNames.includes(f.name));
  if (categoryFields.length > 0) {
    categoryFields.forEach(field => {
      console.log(\`- **\${field.name}** (\\\`\${field.type}\\\`): TODO: Add description\`);
    });
    console.log('');
  }
});
" >> docs/SCHEMA.md

# Generate JSON schema
echo "📄 Creating JSON schema..."
node -e "
const fs = require('fs');
const reportContent = fs.readFileSync('src/report.ts', 'utf8');

// Extract field information for JSON schema
const normalizedRowMatch = reportContent.match(/interface NormalizedRow \{([^}]+)\}/s);
if (!normalizedRowMatch) {
  console.error('Could not find NormalizedRow interface');
  process.exit(1);
}

const schema = {
  '\$schema': 'http://json-schema.org/draft-07/schema#',
  title: 'GitHub Repository Supply Chain Security Analysis',
  description: 'Schema for normalized repository analysis data',
  type: 'object',
  properties: {},
  required: []
};

const fields = normalizedRowMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('//') && !line.startsWith('/*'))
  .map(line => {
    const match = line.match(/(\w+)\??\s*:\s*([^;]+);?/);
    if (match) {
      const [, name, type] = match;
      const isOptional = line.includes('?');
      
      let jsonType = 'string';
      if (type.includes('number')) jsonType = 'number';
      else if (type.includes('boolean')) jsonType = 'boolean';
      else if (type.includes('Date')) jsonType = 'string';
      else if (type.includes('[]')) jsonType = 'array';
      
      return { name, type: jsonType, optional: isOptional };
    }
    return null;
  })
  .filter(Boolean);

fields.forEach(field => {
  schema.properties[field.name] = { type: field.type };
  if (!field.optional) {
    schema.required.push(field.name);
  }
});

fs.writeFileSync('docs/schema.json', JSON.stringify(schema, null, 2));
console.log('✅ JSON schema generated: docs/schema.json');
" 2>/dev/null || echo "⚠️  Could not generate JSON schema"

# Add usage examples to schema documentation
cat >> docs/SCHEMA.md << 'EOF'

## Usage Examples

### Loading Data in Python

```python
import pandas as pd
import json

# Load CSV data
df = pd.read_csv('output/analysis.csv')

# Load JSON data  
with open('output/analysis.json', 'r') as f:
    data = json.load(f)

# Convert to DataFrame
df = pd.json_normalize(data)
```

### Loading Data in R

```r
library(jsonlite)
library(readr)

# Load CSV data
df <- read_csv("output/analysis.csv")

# Load JSON data
data <- fromJSON("output/analysis.json")
df <- as.data.frame(data)
```

### Loading Parquet Data

```python
import pandas as pd

# Load Parquet data (when available)
df = pd.read_parquet('output/analysis.parquet')
```

## Data Quality Notes

- All timestamps are in ISO 8601 format
- Array fields in CSV are JSON-encoded strings
- Missing values are represented as null/NULL/NA depending on format
- Boolean fields use true/false values

## Schema Versioning

This schema follows semantic versioning:
- Major version: Breaking changes to field names or types
- Minor version: New fields added
- Patch version: Documentation or validation updates

Current version: 0.0.0

EOF

echo "✅ Schema documentation generated successfully!"
echo "📁 Files created:"
echo "   - docs/SCHEMA.md"
echo "   - docs/schema.json"

# Validate the generated files
if [ -f "docs/SCHEMA.md" ] && [ -f "docs/schema.json" ]; then
    echo "🎉 All schema documentation files generated successfully!"
else
    echo "❌ Some files failed to generate"
    exit 1
fi