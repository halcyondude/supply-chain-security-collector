// src/main.ts

import 'dotenv/config';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { analyzeRepositoryData } from './analysis';
import { generateReports } from './report';
import { generateSizeReport } from './sizeReport';
import { getMockApiResponse } from './mockData';
import { createApiClient, fetchRepositoryArtifacts, fetchRepositoryExtendedInfo } from './api';
import { GetRepoDataArtifactsQuery, GetRepoDataExtendedInfoQuery } from './generated/graphql';
import { appendRawResponse } from './rawResponseWriter';

// Define common types used throughout the script
type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;
type RepositoryTarget = { owner: string; name: string; maturity?: string };

const program = new Command();
program
  .name('github-supply-chain-analyzer')
  .description('Analyze GitHub repositories for supply chain security artifacts')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input JSONL file with repository list', 'input/sandbox.jsonl')
  .option('--mock', 'Run in mock mode (no GitHub API calls)', false)
  .option('--extended', 'Use extended query (includes workflows, security policies)', false)
  .option('-o, --output <dir>', 'Output directory for reports', 'output')
  .option('-v, --verbose', 'Show detailed API logging and column explanations', false)
  .option(
    '-p, --parallel [batchSize]',
    'Run fetches in parallel. Optionally set a batch size (e.g., --parallel 10). Defaults to 10.',
    false
  )
  .helpOption('-h, --help', 'Display help for command');
program.parse(process.argv);
const opts = program.opts();

// Removed cache logic

/**
 * Fetches, analyzes, and caches data for a single repository.
 * This helper function encapsulates the logic for one repo, making it reusable
 * for both sequential and parallel execution modes.
 */
async function fetchAndAnalyzeRepo(
  repo: RepositoryTarget,
  client: ReturnType<typeof createApiClient> | null,
  useMock: boolean,
  useExtended: boolean,
  verbose: boolean,
  rawResponsesPath?: string
): Promise<AnalysisResult | null> {
  const repoKey = `${repo.owner}/${repo.name}`;
  console.log(`Processing repository: ${chalk.cyan(repoKey)}`);

  let repoData: GetRepoDataArtifactsQuery | GetRepoDataExtendedInfoQuery | null = null;
  const queryType = useExtended ? 'GetRepoDataExtendedInfo' : 'GetRepoDataArtifacts';

  if (useMock) {
    try {
      // Mock data uses the old GetRepoData naming convention
      // The mock files contain extended info, so they work for both query types
      const mockResponse = getMockApiResponse('GetRepoData', repo.owner, repo.name) as {
        data: GetRepoDataExtendedInfoQuery;
      };
      repoData = mockResponse.data;
    } catch {
      console.log(chalk.yellow('⚠️  No mock data found for this repository. Skipping.'));
      return null;
    }
  } else {
    // Fetch from GitHub API using appropriate query
    if (useExtended) {
      repoData = await fetchRepositoryExtendedInfo(client!, { owner: repo.owner, name: repo.name }, verbose);
    } else {
      repoData = await fetchRepositoryArtifacts(client!, { owner: repo.owner, name: repo.name }, verbose);
    }
    
    // Save raw API response to JSONL with metadata
    if (repoData && rawResponsesPath) {
      await appendRawResponse(rawResponsesPath, {
        queryType,
        owner: repo.owner,
        repo: repo.name,
        response: repoData,
      });
    }
  }

  if (repoData && repoData.repository) {
    const analysis = analyzeRepositoryData(repoData.repository);
    // Attach maturity if available (runtime-only augmentation)
    if (analysis && typeof analysis === 'object') {
  const a = analysis as unknown as Record<string, unknown>;
  a._maturity = repo.maturity || undefined;
    }
    return analysis;
  }
  return null;
}

async function main() {
  const { verbose, mock, extended, input, output, parallel, help } = opts;
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

  if (help) {
    program.help();
    return;
  }

  const useMock = mock || process.env.MOCK_GITHUB === '1';
  const useExtended = extended;
  
  if (useMock) {
    console.log(chalk.magenta.bold('🧪 MOCK MODE ENABLED: Using mock GitHub data.'));
  }
  
  if (useExtended) {
    console.log(chalk.cyan.bold('🔍 EXTENDED MODE: Fetching workflows and security policies.'));
  }

  const githubPat = process.env.GITHUB_PAT;
  if (!useMock && !githubPat) {
    console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
    process.exit(1);
  }
  const client = useMock ? null : createApiClient(githubPat!);

  // Support multiple input files by allowing comma-separated values in --input
  const inputOption = String(input || '');
  const inputFiles = inputOption.split(',').map(s => s.trim()).filter(Boolean);
  if (inputFiles.length === 0) {
    console.error(chalk.red.bold('No input files provided.')); program.help(); process.exit(1);
  }

  const repositories: RepositoryTarget[] = [];
  for (const infile of inputFiles) {
    if (!fs.existsSync(infile)) {
      console.error(chalk.red.bold(`Input file not found: ${infile}`));
      program.help();
      process.exit(1);
    }

    const repoLines = fs.readFileSync(infile, 'utf-8').split('\n').filter(Boolean);
    const inferredMaturity = path.basename(infile, path.extname(infile));
    for (const line of repoLines) {
      try {
        const parsed = JSON.parse(line);
        if (!parsed.maturity) parsed.maturity = inferredMaturity;
        repositories.push(parsed as RepositoryTarget);
      } catch {
        console.error(chalk.red(`Invalid JSON in input file ${infile}: ${line}`));
        process.exit(1);
      }
    }
  }

  const allAnalysisResults: (AnalysisResult | null)[] = [];

  // Create timestamped run directory
  const inputBase = inputFiles.length === 1 ? path.basename(inputFiles[0], path.extname(inputFiles[0])) : 'combined';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // Format: 2025-10-06T22-30-15
  const runDir = path.join(output, `${inputBase}-${timestamp}`);
  
  // Create run directory
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }
  
  console.log(chalk.gray(`📁 Output directory: ${runDir}`));
  
  // Determine file paths within run directory
  const rawResponsesPath = useMock ? undefined : path.join(runDir, 'raw-responses.jsonl');

  // =============================================================================================
  // EXECUTION MODE: SEQUENTIAL VS. PARALLEL
  // =============================================================================================
  // This tool supports two modes for processing the list of repositories, controlled by the
  // `--parallel` or `-p` flag.
  //
  // 1. SEQUENTIAL (Default):
  //    - Processes one repository at a time, waiting for each request to complete before
  //      starting the next.
  //    - PROS: Excellent for debugging. The console output is ordered and easy to follow.
  //      It's also gentler on the network and the remote API.
  //    - CONS: Slower. The total execution time is the sum of all individual request times.
  //
  // 2. PARALLEL (`--parallel`):
  //    - Processes a "batch" of repositories concurrently, dramatically speeding up the run.
  //    - PROS: Much faster. Total execution time is roughly the time of the slowest batch.
  //    - CONS: Console output will be interleaved and harder to follow for a single repo.
  //    - ROBUSTNESS: To handle potential issues with a large burst of requests:
  //      - BATCHING: We don't fire all 200+ requests at once. We process them in manageable
  //        chunks (defaulting to 5) to avoid overwhelming the API and triggering
  //        secondary (abuse) rate limits.
  //      - DELAY: We wait 1 second between batches to prevent burst detection.
  //      - RESILIENT ERROR HANDLING: We use `Promise.allSettled()`, which waits for all
  //        promises in a batch to finish, regardless of whether they succeed or fail. This
  //        ensures that one failed repository request doesn't crash the entire run.
  // =============================================================================================

  if (parallel) {
    // --- PARALLEL EXECUTION ---
    const batchSize = typeof parallel === 'string' ? parseInt(parallel, 10) || 5 : 5;
    console.log(chalk.bold.yellow(`⚡ Running in PARALLEL mode with a batch size of ${batchSize}.`));

    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      console.log(
        chalk.gray(`\n-- Processing batch ${i / batchSize + 1} (${batch.length} repos) --`)
      );

      const promises = batch.map(repo => fetchAndAnalyzeRepo(repo, client, useMock, useExtended, verbose, rawResponsesPath));
      const results = await Promise.allSettled(promises);

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          allAnalysisResults.push(result.value);
        } else {
          // A specific repo fetch failed; log it and continue.
          console.error(chalk.red('A repository fetch failed:'), result.reason);
          allAnalysisResults.push(null); // Add null to signify failure.
        }
      });

      // Add a 1-second delay between batches to avoid secondary rate limits
      if (i + batchSize < repositories.length) {
        if (verbose) {
          console.log(chalk.gray('  Waiting 1 second before next batch...'));
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } else {
    // --- SEQUENTIAL EXECUTION ---
    console.log(chalk.bold.blue('🐌 Running in SEQUENTIAL mode.'));
    for (const repo of repositories) {
      const result = await fetchAndAnalyzeRepo(repo, client, useMock, useExtended, verbose, rawResponsesPath);
      allAnalysisResults.push(result);
    }
  }

  // --- REPORT GENERATION ---
  const validAnalysisResults = allAnalysisResults.filter(
    (res): res is Exclude<AnalysisResult, null> => res !== null
  );

  if (validAnalysisResults.length > 0) {
    if (verbose) {
      console.log(chalk.bold.bgWhite.black('\n  Column Legend & Detection Logic  '));
      const legendRows = [
        [chalk.bold('Column'), chalk.bold('Description'), chalk.bold('Detection Logic')],
        ['SBOM', 'SBOM artifact in release', 'Filename: sbom|spdx|cyclonedx'],
        ['Sig', 'Signature artifact in release', 'Extension: .sig, .asc, .pem, .pub'],
        ['Att', 'Attestation artifact in release', 'Filename: attestation'],
        ['SBOM CI', 'SBOM generator tool in CI', 'Regex: syft|trivy|cdxgen|spdx-sbom-generator in workflow YAML'],
        ['Sign CI', 'Signature/attestation tool in CI', 'Regex: cosign|sigstore|slsa-github-generator in workflow YAML'],
        ['GoRel CI', 'Goreleaser used in CI', 'Regex: goreleaser/goreleaser-action in workflow YAML'],
      ];
      const legendTable = new Table({
        head: legendRows[0],
        colWidths: [16, 32, 48],
        wordWrap: true,
        style: { head: [], border: [] },
      });
      for (const row of legendRows.slice(1)) legendTable.push(row);
      console.log(legendTable.toString());
    }
    
    const runMetadata = {
      queryType: useExtended ? 'GetRepoDataExtendedInfo' : 'GetRepoDataArtifacts',
      timestamp,
      totalRepos: repositories.length,
      successfulRepos: validAnalysisResults.length,
      failedRepos: repositories.length - validAnalysisResults.length,
    };
    
    await generateReports(validAnalysisResults, runDir, inputBase, runMetadata);
    
    // Generate file size report
    await generateSizeReport(runDir, runMetadata);

    const ciToolTypes = [
        { key: 'sbom', label: 'SBOM' },
        { key: 'signature', label: 'Sig' },
        { key: 'attestation', label: 'Att' },
        { key: 'sbom-generator', label: 'SBOM CI' },
        { key: 'signer', label: 'Sign CI' },
        { key: 'goreleaser', label: 'GoRel CI' },
    ];

    // --- Summary Table: One row per repo ---
    console.log(chalk.bold.bgBlueBright.white('\n  Repository Summary  '));
    const summaryTable = new Table({
      head: [chalk.bold('Repository'), chalk.bold('Releases'), ...ciToolTypes.map(t => chalk.bold(t.label)), chalk.bold('Total Artifacts')],
      colWidths: [30, 10, ...Array(ciToolTypes.length).fill(10), 16],
      style: { head: [], border: [] },
    });

    const ciToolCounts: Record<string, number> = Object.fromEntries(ciToolTypes.map(t => [t.key, 0]));
    let totalReleases = 0;
    let totalArtifacts = 0;

    for (const result of validAnalysisResults) {
      const releaseCount = result.releases?.length || 0;
      totalReleases += releaseCount;
      
      // Count total artifacts across all releases for this repo
      let repoArtifactCount = 0;
      result.releases?.forEach(release => {
        repoArtifactCount += release.artifacts.length;
      });
      totalArtifacts += repoArtifactCount;
      
      const ciTools = new Set(result.summary.sbomCiTools);
      
      const summaryRow = [
        chalk.cyan(result.repository.owner + '/' + result.repository.name),
        chalk.white(releaseCount.toString()),
        ...ciToolTypes.map(t => {
          const present = ciTools.has(t.key);
          if (present) ciToolCounts[t.key]++;
          return present ? chalk.greenBright('✔') : '';
        }),
        repoArtifactCount > 0 ? chalk.gray(repoArtifactCount.toString()) : '',
      ];
      summaryTable.push(summaryRow);
    }
    console.log(summaryTable.toString());
    
    const summaryTotals = ciToolTypes.map(t => `${chalk.bold(t.label)}: ${ciToolCounts[t.key]}`).join(' | ');
    console.log(chalk.blue.bold(`\nSummary: ${validAnalysisResults.length} repos, ${totalReleases} releases, ${totalArtifacts} artifacts | ${summaryTotals}`));

    // --- Detailed Table: One row per release ---
    console.log(chalk.bold.bgBlueBright.white('\n  Detailed Release View  '));
    const detailTable = new Table({
      head: [chalk.bold('Repo'), chalk.bold('Release'), ...ciToolTypes.map(t => chalk.bold(t.label)), chalk.bold('Artifacts')],
      colWidths: [25, 20, ...Array(ciToolTypes.length).fill(10), 12],
      style: { head: [], border: [] },
    });

    for (const result of validAnalysisResults) {
      const repoName = result.repository.name;
      
      // Show each release as a separate row
      if (result.releases && result.releases.length > 0) {
        result.releases.forEach((release, idx) => {
          // Build set of tools present in this specific release's artifacts
          const releaseTools = new Set<string>();
          let artifactCount = 0;
          
          release.artifacts.forEach(artifact => {
            artifactCount++;
            if (artifact.isSbom) releaseTools.add('sbom');
            if (artifact.isSignature) releaseTools.add('signature');
            if (artifact.isAttestation) releaseTools.add('attestation');
          });
          
          // Also check summary for CI tools (these are repo-level, not release-level)
          const ciTools = new Set(result.summary.sbomCiTools);
          
          const row = [
            idx === 0 ? chalk.cyan(repoName) : '', // Only show repo name on first release
            chalk.white(release.tagName),
            ...ciToolTypes.map(t => {
              const present = releaseTools.has(t.key) || ciTools.has(t.key);
              return present ? chalk.greenBright('✔') : '';
            }),
            artifactCount > 0 ? chalk.gray(artifactCount.toString()) : '',
          ];
          detailTable.push(row);
        });
      } else {
        // Repo with no releases
        const row = [
          chalk.cyan(repoName),
          chalk.gray('(no releases)'),
          ...Array(ciToolTypes.length).fill(''),
          '',
        ];
        detailTable.push(row);
      }
    }
    console.log(detailTable.toString());
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }

  console.log(chalk.blue.bold('\n✨ Analysis complete.'));
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});