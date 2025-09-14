import * as fs from 'fs/promises';
import * as path from 'path';
import { json2csv } from 'json-2-csv';
import chalk from 'chalk';

export async function generateReports(analysisResults: any[]) {
  const outputDir = path.join(process.cwd(), 'output');

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // 1. Generate JSON Report
    const jsonPath = path.join(outputDir, 'report.json');
    await fs.writeFile(jsonPath, JSON.stringify(analysisResults, null, 2));
    console.log(chalk.green(`✅ Comprehensive JSON report saved to: ${jsonPath}`));

    // 2. Flatten data and generate CSV Report
    const flattenedData = analysisResults.map(res => {
      const latestRelease = res.releases?.[0] || {};
      return {
        repository_name: res.repository.name,
        repository_url: res.repository.url,
        has_sbom_artifact: res.summary.hasSbomArtifact,
        has_signature_artifact: res.summary.hasSignatureArtifact,
        has_attestation_artifact: res.summary.hasAttestationArtifact,
        sbom_ci_tools_detected: (res.summary.sbomCiTools || []).join(','),
        latest_release_tag: latestRelease.tagName || 'N/A',
        latest_release_analyzed_at: latestRelease.createdAt || 'N/A',
      };
    });

    const csvPath = path.join(outputDir, 'report.csv');
    const csv = await json2csv(flattenedData);
    await fs.writeFile(csvPath, csv);
    console.log(chalk.green(`✅ CSV report saved to: ${csvPath}`));

  } catch (error) {
    console.error(chalk.red('Failed to generate reports:'), error);
  }
}
