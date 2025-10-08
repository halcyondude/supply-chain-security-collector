// src/report.ts
// This module handles report generation for the analyzer.
// It outputs comprehensive JSON, normalized CSV, and Parquet schema files.
// Actual Parquet file generation is handled by external tooling.

import * as fs from 'fs/promises';
import * as path from 'path';
import { json2csv } from 'json-2-csv';
import chalk from 'chalk';
import { analyzeRepositoryData } from './analysis';
import { generateParquetFiles } from './parquetWriter';

// AnalysisResult can be null, so we need to handle that.
type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;

// Type definitions for normalized data structure
type NormalizedRow = {
  repository_id: string;
  repository_owner: string;
  repository_name: string;
  repository_name_with_owner: string;
  repository_url: string;
  repository_description: string;
  repo_has_sbom_artifact: boolean;
  repo_has_signature_artifact: boolean;
  repo_has_attestation_artifact: boolean;
  repo_security_tools_json: string;
  repo_security_tools_count: number;
  workflow_count: number;
  workflow_names_json: string;
  workflow_security_tools_json: string;
  release_index: number | null;
  release_tag_name: string;
  release_name: string;
  release_created_at: string;
  release_artifact_count: number;
  release_has_container_images: boolean;
  release_has_slsa_provenance: boolean;
  release_has_in_toto_attestation: boolean;
  release_sbom_formats_json: string;
  artifact_index: number | null;
  artifact_name: string;
  artifact_download_url: string;
  artifact_size_hint: string;
  artifact_file_extension: string;
  artifact_is_sbom: boolean;
  artifact_is_signature: boolean;
  artifact_is_attestation: boolean;
  artifact_sbom_format: string;
  artifact_is_vex: boolean;
  artifact_is_slsa_provenance: boolean;
  artifact_is_in_toto_link: boolean;
  artifact_is_container_attestation: boolean;
  artifact_type: string;
  artifact_platform_hint: string;
};

type SchemaField = {
  type: string;
  description: string;
  example: unknown;
  category: string;
};

type SchemaDocumentation = {
  title: string;
  version: string;
  description: string;
  generated_at: string;
  fields: Record<string, SchemaField>;
};

/**
 * Normalizes the analysis results into a flat structure suitable for data analysis.
 * This function recursively flattens the JSON structure into individual rows.
 */
function normalizeAnalysisResults(analysisResults: Exclude<AnalysisResult, null>[]): NormalizedRow[] {
  const flattenedData: NormalizedRow[] = [];
  
  analysisResults.forEach(res => {
    const baseRepoData = {
      // Repository metadata
      repository_id: res.repository.id,
      repository_owner: res.repository.owner,
      repository_name: res.repository.name,
      repository_name_with_owner: `${res.repository.owner}/${res.repository.name}`,
      repository_url: res.repository.url,
      repository_description: res.repository.description || '',
      
      // Repository-level security summary flags
      repo_has_sbom_artifact: res.summary.hasSbomArtifact,
      repo_has_signature_artifact: res.summary.hasSignatureArtifact,
      repo_has_attestation_artifact: res.summary.hasAttestationArtifact,
      
      // CI/CD security tools detected (as JSON string for complex data)
      repo_security_tools_json: JSON.stringify(res.summary.sbomCiTools || []),
      repo_security_tools_count: (res.summary.sbomCiTools || []).length,
      
      // Workflow information
      workflow_count: res.workflows.length,
      workflow_names_json: JSON.stringify(res.workflows.map(w => w.name)),
      
      // Aggregated workflow security tools
      workflow_security_tools_json: JSON.stringify(
        res.workflows.flatMap(w => w.detectedSbomTools)
      ),
    };

    // If repository has releases, create rows for each release-artifact combination
    if (res.releases && res.releases.length > 0) {
      res.releases.forEach((release, releaseIndex) => {
        const baseReleaseData = {
          ...baseRepoData,
          
          // Release metadata
          release_index: releaseIndex,
          release_tag_name: release.tagName,
          release_name: release.name || '',
          release_created_at: release.createdAt,
          release_artifact_count: release.artifacts.length,
          
          // Detect container images in release
          release_has_container_images: release.artifacts.some(a => 
            /\.(tar|tar\.gz|oci|docker)$/i.test(a.name) || 
            /container|image|docker/i.test(a.name)
          ),
          
          // SLSA compliance indicators
          release_has_slsa_provenance: release.artifacts.some(a => a.isSlsaProvenance),
          release_has_in_toto_attestation: release.artifacts.some(a => a.isInTotoLink),
          
          // Aggregate artifact types for this release
          release_sbom_formats_json: JSON.stringify(
            [...new Set(release.artifacts
              .filter(a => a.sbomFormat)
              .map(a => a.sbomFormat)
            )]
          ),
        };

        // If release has artifacts, create one row per artifact
        if (release.artifacts && release.artifacts.length > 0) {
          release.artifacts.forEach((artifact, artifactIndex) => {
            flattenedData.push({
              ...baseReleaseData,
              
              // Artifact metadata
              artifact_index: artifactIndex,
              artifact_name: artifact.name,
              artifact_download_url: artifact.downloadUrl || '',
              artifact_size_hint: extractSizeHint(artifact.name),
              artifact_file_extension: path.extname(artifact.name).toLowerCase(),
              
              // Artifact security classification
              artifact_is_sbom: artifact.isSbom,
              artifact_is_signature: artifact.isSignature,
              artifact_is_attestation: artifact.isAttestation,
              artifact_sbom_format: artifact.sbomFormat,
              artifact_is_vex: artifact.isVex,
              artifact_is_slsa_provenance: artifact.isSlsaProvenance,
              artifact_is_in_toto_link: artifact.isInTotoLink,
              artifact_is_container_attestation: artifact.isContainerAttestation,
              
              // Artifact type classification
              artifact_type: classifyArtifactType(artifact),
              artifact_platform_hint: extractPlatformHint(artifact.name),
            });
          });
        } else {
          // Release has no artifacts, create one row for the release
          flattenedData.push({
            ...baseReleaseData,
            artifact_index: null,
            artifact_name: '',
            artifact_download_url: '',
            artifact_size_hint: '',
            artifact_file_extension: '',
            artifact_is_sbom: false,
            artifact_is_signature: false,
            artifact_is_attestation: false,
            artifact_sbom_format: '',
            artifact_is_vex: false,
            artifact_is_slsa_provenance: false,
            artifact_is_in_toto_link: false,
            artifact_is_container_attestation: false,
            artifact_type: 'none',
            artifact_platform_hint: '',
          });
        }
      });
    } else {
      // Repository has no releases, create one row for the repository
      flattenedData.push({
        ...baseRepoData,
        release_index: null,
        release_tag_name: '',
        release_name: '',
        release_created_at: '',
        release_artifact_count: 0,
        release_has_container_images: false,
        release_has_slsa_provenance: false,
        release_has_in_toto_attestation: false,
        release_sbom_formats_json: '[]',
        artifact_index: null,
        artifact_name: '',
        artifact_download_url: '',
        artifact_size_hint: '',
        artifact_file_extension: '',
        artifact_is_sbom: false,
        artifact_is_signature: false,
        artifact_is_attestation: false,
        artifact_sbom_format: '',
        artifact_is_vex: false,
        artifact_is_slsa_provenance: false,
        artifact_is_in_toto_link: false,
        artifact_is_container_attestation: false,
        artifact_type: 'none',
        artifact_platform_hint: '',
      });
    }
  });

  return flattenedData;
}

/**
 * Extract size hints from artifact names (e.g., file sizes, architecture)
 */
function extractSizeHint(filename: string): string {
  const sizeMatch = filename.match(/([0-9]+(?:\.[0-9]+)?[KMGT]?B)/i);
  return sizeMatch ? sizeMatch[1] : '';
}

/**
 * Extract platform/architecture hints from artifact names
 */
function extractPlatformHint(filename: string): string {
  const platforms = [
    'linux', 'windows', 'darwin', 'macos',
    'amd64', 'x86_64', 'arm64', 'armv7', 'i386',
    'alpine', 'ubuntu', 'debian'
  ];
  
  const found = platforms.filter(platform => 
    new RegExp(`\\b${platform}\\b`, 'i').test(filename)
  );
  
  return found.join(',');
}

/**
 * Classify artifact type based on name patterns
 */
function classifyArtifactType(artifact: { 
  isSbom: boolean; 
  isSignature: boolean; 
  isAttestation: boolean;
  isSlsaProvenance: boolean;
  isVex: boolean;
  isInTotoLink: boolean;
  isContainerAttestation: boolean;
  name: string;
}): string {
  if (artifact.isSbom) return 'sbom';
  if (artifact.isSignature) return 'signature';
  if (artifact.isAttestation) return 'attestation';
  if (artifact.isSlsaProvenance) return 'slsa-provenance';
  if (artifact.isVex) return 'vex';
  if (artifact.isInTotoLink) return 'in-toto-link';
  if (artifact.isContainerAttestation) return 'container-attestation';
  
  const name = artifact.name.toLowerCase();
  if (/\.(tar|tar\.gz|zip|7z)$/.test(name)) return 'archive';
  if (/\.(exe|msi|dmg|pkg|deb|rpm)$/.test(name)) return 'installer';
  if (/\.(dll|so|dylib)$/.test(name)) return 'library';
  if (/\.(json|yaml|yml|xml|toml)$/.test(name)) return 'config';
  if (/\.(md|txt|pdf)$/.test(name)) return 'documentation';
  if (/checksum|hash|sha|md5/.test(name)) return 'checksum';
  
  return 'binary';
}



/**
 * Generate comprehensive reports from the analysis results.
 * @param analysisResults - Array of per-repository analysis objects
 * @param outputDir - Output directory for reports (run-specific directory)
 * @param baseName - Base name for output files (dataset name without extension)
 * @param runMetadata - Metadata about this run for Parquet KV metadata
 */
export async function generateReports(
  analysisResults: AnalysisResult[], 
  outputDir: string,
  baseName: string,
  runMetadata?: {
    queryType: string;
    timestamp: string;
    totalRepos: number;
    successfulRepos: number;
    failedRepos: number;
  }
) {

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Filter out any null results before processing
    const validAnalysisResults = analysisResults.filter(
      (res): res is Exclude<AnalysisResult, null> => res !== null
    );

    if (validAnalysisResults.length === 0) {
      console.log(chalk.yellow('No valid analysis results to generate reports.'));
      return;
    }

    // --- JSON Report (Analyzed Domain Model) ---
    const jsonPath = path.join(outputDir, `${baseName}-analyzed.json`);
    await fs.writeFile(jsonPath, JSON.stringify(validAnalysisResults, null, 2));
    console.log(chalk.green(`✅ Analyzed JSON report saved to: ${jsonPath}`));

    // --- Normalized Data ---
    const normalizedData = normalizeAnalysisResults(validAnalysisResults);

    // --- CSV Report (Normalized) ---
    const csvPath = path.join(outputDir, `${baseName}.csv`);
    const csv = await json2csv(normalizedData);
    await fs.writeFile(csvPath, csv);
    console.log(chalk.green(`✅ Normalized CSV report saved to: ${csvPath}`));

    // --- Parquet Schema (For External Conversion) ---
    const schemaPath = path.join(outputDir, `${baseName}-schema.json`);
    const schema = generateSchemaDocumentation(normalizedData[0] || {});
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
    console.log(chalk.green(`✅ Schema documentation saved to: ${schemaPath}`));

    // --- Parquet Files (DuckDB-based with metadata) ---
    if (runMetadata) {
      const basePathForParquet = path.join(outputDir, baseName);
      await generateParquetFiles(
        basePathForParquet,
        jsonPath,
        schemaPath,
        runMetadata
      );
    }

  } catch (error) {
    console.error(chalk.red('Failed to generate reports:'), error);
  }
}

/**
 * Generate schema documentation from the normalized data structure
 */
function generateSchemaDocumentation(sampleRow: Record<string, unknown>): SchemaDocumentation {
  const schema: SchemaDocumentation = {
    title: "GitHub Supply Chain Security Analysis Schema",
    version: "1.0.0",
    description: "Normalized dataset schema for GitHub repository supply chain security analysis",
    generated_at: new Date().toISOString(),
    fields: {}
  };

  Object.keys(sampleRow).forEach(key => {
    const value = sampleRow[key];
    const type = typeof value;
    
    schema.fields[key] = {
      type: value === null ? 'nullable' : type,
      description: generateFieldDescription(key),
      example: value,
      category: categorizeField(key)
    };
  });

  return schema;
}

/**
 * Generate human-readable descriptions for schema fields
 */
function generateFieldDescription(fieldName: string): string {
  const descriptions: Record<string, string> = {
    repository_id: "Unique identifier for the repository (GraphQL node ID)",
    repository_owner: "GitHub username/organization that owns the repository", 
    repository_name: "Name of the repository",
    repository_name_with_owner: "Full repository name in owner/repo format",
    repository_url: "GitHub URL of the repository",
    repository_description: "Repository description from GitHub",
    repo_has_sbom_artifact: "Boolean indicating if repository has SBOM artifacts in releases",
    repo_has_signature_artifact: "Boolean indicating if repository has signature artifacts in releases",
    repo_has_attestation_artifact: "Boolean indicating if repository has attestation artifacts in releases",
    repo_security_tools_json: "JSON array of security tools detected in CI/CD workflows",
    repo_security_tools_count: "Count of unique security tools detected",
    workflow_count: "Number of GitHub Actions workflows in the repository",
    workflow_names_json: "JSON array of workflow filenames",
    workflow_security_tools_json: "JSON array of security tools found in all workflows",
    release_index: "Index of the release (0 = latest, 1 = second latest, etc.)",
    release_tag_name: "Git tag name for the release",
    release_name: "Display name of the release",
    release_created_at: "ISO timestamp when the release was created",
    release_artifact_count: "Number of artifacts attached to this release",
    release_has_container_images: "Boolean indicating if release contains container images",
    release_has_slsa_provenance: "Boolean indicating if release has SLSA provenance attestations",
    release_has_in_toto_attestation: "Boolean indicating if release has in-toto attestations",
    release_sbom_formats_json: "JSON array of SBOM formats detected in this release",
    artifact_index: "Index of the artifact within the release",
    artifact_name: "Filename of the release artifact",
    artifact_download_url: "Direct download URL for the artifact",
    artifact_size_hint: "Extracted size information from filename",
    artifact_file_extension: "File extension of the artifact",
    artifact_is_sbom: "Boolean indicating if artifact is a Software Bill of Materials",
    artifact_is_signature: "Boolean indicating if artifact is a cryptographic signature",
    artifact_is_attestation: "Boolean indicating if artifact is an attestation",
    artifact_sbom_format: "Specific SBOM format (spdx, cyclonedx, unknown, or empty)",
    artifact_is_vex: "Boolean indicating if artifact is a VEX (Vulnerability Exploitability eXchange) document",
    artifact_is_slsa_provenance: "Boolean indicating if artifact is SLSA provenance",
    artifact_is_in_toto_link: "Boolean indicating if artifact is an in-toto link file",
    artifact_is_container_attestation: "Boolean indicating if artifact is a container attestation",
    artifact_type: "Classified type of artifact (sbom, signature, binary, etc.)",
    artifact_platform_hint: "Extracted platform/architecture information from filename"
  };

  return descriptions[fieldName] || `Field: ${fieldName}`;
}

/**
 * Categorize fields for documentation organization
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