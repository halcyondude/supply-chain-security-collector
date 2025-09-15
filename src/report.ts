// src/report.ts
// This module handles report generation for the analyzer.
// It outputs both a comprehensive JSON file and a flattened CSV for easy review.

import * as fs from 'fs/promises';
import * as path from 'path';
import { json2csv } from 'json-2-csv';
import chalk from 'chalk';
import { analyzeRepositoryData } from './analysis';

// AnalysisResult can be null, so we need to handle that.
type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;

/**
 * Generate JSON and CSV reports from the analysis results.
 * @param analysisResults - Array of per-repository analysis objects (see analysis.ts)
 * @param outputDir - Output directory for reports (optional, defaults to 'output')
 */
export async function generateReports(analysisResults: AnalysisResult[], outputDir?: string) {
  // Output directory for reports (created if missing)
  outputDir = outputDir ? path.resolve(outputDir) : path.join(process.cwd(), 'output');

  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // FIX: Filter out any null results before processing
    const validAnalysisResults = analysisResults.filter(
      (res): res is Exclude<AnalysisResult, null> => res !== null
    );

    // --- JSON Report ---
    // Full, structured data for all analyzed repositories
    const jsonPath = path.join(outputDir, 'report.json');
    // FIX: Use validAnalysisResults for JSON report
    await fs.writeFile(jsonPath, JSON.stringify(validAnalysisResults, null, 2));
    console.log(chalk.green(`✅ Comprehensive JSON report saved to: ${jsonPath}`));

    // --- CSV Report ---
    // Flattened, row-based summary for spreadsheet review
    // FIX: Use validAnalysisResults for CSV report
    const flattenedData = validAnalysisResults.map(res => {
      // Use the latest release for summary columns (if any)
      const latestRelease = res.releases?.[0] || {};
      return {
        // Repository metadata
        repository_name: res.repository.name,
        repository_url: res.repository.url,
        // Security artifact flags
        has_sbom_artifact: res.summary.hasSbomArtifact,
        has_signature_artifact: res.summary.hasSignatureArtifact,
        has_attestation_artifact: res.summary.hasAttestationArtifact,
        // CI tool detection (comma-separated list)
        // FIX: sbomCiTools is now guaranteed to be string[] from analysis.ts
        sbom_ci_tools_detected: (res.summary.sbomCiTools || []).join(','),
        // Latest release info
        latest_release_tag: latestRelease.tagName || 'N/A',
        latest_release_analyzed_at: latestRelease.createdAt || 'N/A',
      };
    });

    const csvPath = path.join(outputDir, 'report.csv');
    const csv = await json2csv(flattenedData);
    await fs.writeFile(csvPath, csv);
    console.log(chalk.green(`✅ CSV report saved to: ${csvPath}`));

  } catch (error) {
    // Log and fail gracefully if report generation fails
    console.error(chalk.red('Failed to generate reports:'), error);
  }
}