#!/usr/bin/env npx ts-node

/**
 * Schema Documentation Generator
 * 
 * Reads JSON output files to extract schema and generates comprehensive documentation.
 * This script generates schema.md with field descriptions, types, and examples.
 */

import { promises as fs } from 'fs';
import path from 'path';

interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
  category: string;
  example?: unknown;
}

interface SchemaDocumentation {
  title: string;
  description: string;
  version: string;
  generatedAt: string;
  sourceFile: string;
  fields: SchemaField[];
  categories: Record<string, SchemaField[]>;
  totalFields: number;
}

/**
 * Find the most recent JSON data file or schema file
 */
async function findDataFile(): Promise<string> {
  const outputDir = 'output';
  
  try {
    const files = await fs.readdir(outputDir);
    
    // Look for schema JSON files first
    let dataFiles = files.filter(file => file.endsWith('-schema.json'));
    
    // If no schema files, look for regular JSON files
    if (dataFiles.length === 0) {
      dataFiles = files.filter(file => file.endsWith('.json') && !file.includes('parquet'));
      
      if (dataFiles.length === 0) {
        throw new Error(`No JSON data files found in output directory. Run a test first: npm run test:single`);
      }
    }
    
    // Get the most recent file
    const fileStats = await Promise.all(
      dataFiles.map(async (file: string) => {
        const filePath = path.join(outputDir, file);
        return {
          file: filePath,
          mtime: (await fs.stat(filePath)).mtime
        };
      })
    );
    
    fileStats.sort((a: { mtime: Date }, b: { mtime: Date }) => b.mtime.getTime() - a.mtime.getTime());
    return fileStats[0].file;
  } catch (error) {
    throw new Error(`Error finding JSON data files: ${error}`);
  }
}

/**
 * Extract schema from JSON data file
 */
async function extractJsonSchema(filePath: string): Promise<SchemaField[]> {
  try {
    // Try to read JSON data directly
    let jsonPath = filePath;
    
    // If it's a schema file, look for the corresponding data file
    if (filePath.endsWith('-schema.json')) {
      // Try to find corresponding .json file (not .parquet.json)
      const baseName = path.basename(filePath, '-schema.json');
      const dataPath = path.join(path.dirname(filePath), `${baseName}.json`);
      
      if (await fs.access(dataPath).then(() => true).catch(() => false)) {
        jsonPath = dataPath;
      } else {
        throw new Error(`Cannot find data file for schema ${filePath}`);
      }
    }
    
    console.log(`📖 Reading JSON data from: ${jsonPath}`);
    
    const content = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Assume data is an array of objects with a normalized structure
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Expected JSON data to be a non-empty array');
    }
    
    const sampleRow = data[0];
    const fields: SchemaField[] = [];
    
    for (const [key, value] of Object.entries(sampleRow)) {
      fields.push({
        name: key,
        type: inferTypeFromValue(value),
        nullable: value === null || value === undefined,
        description: getFieldDescription(key),
        category: categorizeField(key),
        example: value
      });
    }
    
    return fields;
  } catch (error) {
    throw new Error(`Error extracting schema from JSON: ${error}`);
  }
}

/**
 * Categorize field for documentation organization
 */
function categorizeField(fieldName: string): string {
  if (fieldName.startsWith('repository_') || fieldName.startsWith('repo_')) {
    return 'repository';
  }
  if (fieldName.startsWith('workflow_')) {
    return 'workflows';
  }
  if (fieldName.startsWith('release_')) {
    return 'releases';
  }
  if (fieldName.startsWith('artifact_')) {
    return 'artifacts';
  }
  return 'metadata';
}

/**
 * Infer TypeScript type from value
 */
function inferTypeFromValue(value: unknown): string {
  if (value === null || value === undefined) return 'string | null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
  if (typeof value === 'string') {
    // Check if it's a JSON array
    if (value.startsWith('[') && value.endsWith(']')) {
      return 'string'; // JSON-encoded array
    }
    // Check if it's a date
    if (value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
      return 'string'; // ISO date string
    }
    return 'string';
  }
  if (Array.isArray(value)) return 'string[]';
  return 'object';
}

/**
 * Get field description based on name
 */
function getFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    // Repository Identity
    'repository_id': 'Unique repository identifier (GitHub URL)',
    'repository_owner': 'GitHub organization or user name',
    'repository_name': 'Repository name without owner',
    'repository_name_with_owner': 'Full repository path (owner/name)',
    'repository_url': 'GitHub repository URL',
    'repository_description': 'Repository description text',
    
    // Security Artifacts
    'repo_has_sbom_artifact': 'Repository contains SBOM (Software Bill of Materials) files',
    'repo_has_signature_artifact': 'Repository contains cryptographic signature files',
    'repo_has_attestation_artifact': 'Repository contains attestation files',
    'artifact_is_sbom': 'This artifact is an SBOM file',
    'artifact_is_signature': 'This artifact is a cryptographic signature',
    'artifact_is_attestation': 'This artifact is an attestation document',
    'artifact_is_vex': 'This artifact is a VEX (Vulnerability Exchange) document',
    'artifact_is_slsa_provenance': 'This artifact contains SLSA provenance information',
    'artifact_is_in_toto_link': 'This artifact is an in-toto link metadata file',
    'artifact_is_container_attestation': 'This artifact is a container attestation',
    
    // CI/CD Security Tools
    'repo_security_tools_json': 'JSON array of detected security tools across the repository',
    'repo_security_tools_count': 'Total count of unique security tool types',
    'workflow_security_tools_json': 'JSON array of security tools found in each workflow',
    'workflow_count': 'Total number of CI/CD workflow files',
    'workflow_names_json': 'JSON array of workflow file names',
    
    // Release Information
    'release_index': 'Zero-based index of this release (0 = latest)',
    'release_tag_name': 'Git tag name for this release',
    'release_name': 'Display name of the release',
    'release_created_at': 'ISO timestamp of release creation',
    'release_artifact_count': 'Total number of artifacts in this release',
    'release_has_container_images': 'Release contains container images',
    'release_has_slsa_provenance': 'Release contains SLSA provenance documents',
    'release_has_in_toto_attestation': 'Release contains in-toto attestations',
    'release_sbom_formats_json': 'JSON array of SBOM formats found in release',
    
    // Artifact Details
    'artifact_index': 'Zero-based index of this artifact within the release',
    'artifact_name': 'Filename of the artifact',
    'artifact_download_url': 'Direct download URL for the artifact',
    'artifact_size_hint': 'Estimated size of the artifact',
    'artifact_file_extension': 'File extension extracted from artifact name',
    'artifact_type': 'Classified type of artifact (signature, sbom, etc.)',
    'artifact_platform_hint': 'Detected platform/architecture hints',
    'artifact_sbom_format': 'Specific SBOM format if this is an SBOM file'
  };
  
  return descriptions[fieldName] || 'Supply chain security metadata field';
}



/**
 * Generate comprehensive schema documentation
 */
async function generateSchemaDocumentation(fields: SchemaField[], sourceFile: string): Promise<SchemaDocumentation> {
  // Group fields by category
  const categories: Record<string, SchemaField[]> = {};
  for (const field of fields) {
    if (!categories[field.category]) {
      categories[field.category] = [];
    }
    categories[field.category].push(field);
  }
  
  return {
    title: 'GitHub Supply Chain Security Analysis Schema',
    description: 'Normalized data schema for supply chain security analysis of GitHub repositories',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(sourceFile),
    fields,
    categories,
    totalFields: fields.length
  };
}

/**
 * Write Markdown documentation
 */
async function writeMarkdownDocs(schema: SchemaDocumentation): Promise<void> {
  const docsDir = 'docs';
  await fs.mkdir(docsDir, { recursive: true });
  
  const markdown = `# ${schema.title}

## Overview

${schema.description}

**Generated from:** \`${schema.sourceFile}\`  
**Generated at:** ${new Date(schema.generatedAt).toLocaleString()}  
**Total fields:** ${schema.totalFields}

## Schema Fields

| Field | Type | Nullable | Category | Description |
|-------|------|----------|----------|-------------|
${schema.fields.map(field => 
  `| \`${field.name}\` | \`${field.type}\` | ${field.nullable ? '✓' : ''} | ${field.category} | ${field.description} |`
).join('\n')}

## Field Categories

${Object.entries(schema.categories).map(([category, categoryFields]) => `
### ${category}

${categoryFields.map(field => 
  `- **\`${field.name}\`** (\`${field.type}\`): ${field.description}`
).join('\n')}
`).join('')}

## Usage Examples

### Loading in Python (Pandas)

\`\`\`python
import pandas as pd

# Load CSV data
df = pd.read_csv('output/analysis.csv')

# Load Parquet data (more efficient)
df = pd.read_parquet('output/analysis.parquet')

# Display schema info
print(df.info())
print(f"Total rows: {len(df)}")
print(f"Total repositories: {df['repository_name'].nunique()}")
\`\`\`

### Loading in R

\`\`\`r
library(arrow)
library(dplyr)

# Load Parquet data
df <- read_parquet("output/analysis.parquet")

# Display schema
glimpse(df)

# Summary statistics
df %>% 
  group_by(repository_name) %>% 
  summarise(
    total_artifacts = n(),
    has_sbom = any(artifact_is_sbom),
    has_signatures = any(artifact_is_signature)
  )
\`\`\`

### Loading in JavaScript/Node.js

\`\`\`javascript
// Load JSON data
const data = require('./output/analysis.json');

// Load using Apache Arrow (for Parquet)
const { tableFromIPC } = require('apache-arrow');
const fs = require('fs');

// Process data
const repositories = [...new Set(data.map(row => row.repository_name))];
console.log(\`Found \${repositories.length} repositories\`);
\`\`\`

## Data Quality Notes

- All timestamps are in ISO 8601 format
- JSON array fields are stored as JSON-encoded strings in CSV format
- Boolean fields use \`true\`/\`false\` values
- Missing values are represented as \`null\`
- Platform hints are comma-separated values (e.g., "linux,amd64")

## Schema Evolution

This schema follows semantic versioning principles:
- **Major version**: Breaking changes to field names or types
- **Minor version**: New fields added
- **Patch version**: Documentation updates or bug fixes

Current version: ${schema.version}
`;

  await fs.writeFile(path.join(docsDir, 'schema.md'), markdown);
  console.log('✅ Markdown documentation saved to: docs/schema.md');
}

/**
 * Write JSON schema
 */
async function writeJSONSchema(schema: SchemaDocumentation): Promise<void> {
  const docsDir = 'docs';
  const jsonPath = path.join(docsDir, 'schema.json');
  
  await fs.writeFile(jsonPath, JSON.stringify(schema, null, 2));
  console.log('✅ JSON schema saved to: docs/schema.json');
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    console.log('🔄 Generating schema documentation from JSON data files...');
    
    // Find the most recent data file
    const dataFile = await findDataFile();
    console.log(`✅ Found data file: ${dataFile}`);
    
    // Extract schema
    const fields = await extractJsonSchema(dataFile);
    
    // Generate documentation
    const schema = await generateSchemaDocumentation(fields, dataFile);
    
    // Write documentation files
    await writeMarkdownDocs(schema);
    await writeJSONSchema(schema);
    
    console.log('🎉 Schema documentation generated successfully!');
    console.log(`📁 Files created:`);
    console.log(`   - docs/schema.md`);
    console.log(`   - docs/schema.json`);
    
  } catch (error) {
    console.error('❌ Error generating schema documentation:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { main as generateSchemaDocs };