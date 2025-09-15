// src/main.ts

import 'dotenv/config';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import * as fs from 'fs';

import { analyzeRepositoryData } from './analysis';
import { generateReports } from './report';
import { getMockApiResponse } from './mockData';
import { createApiClient, fetchRepositoryData } from './api';
import { GetRepoDataQuery } from './generated/graphql';

// Define common types used throughout the script
type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;
type RepositoryTarget = { owner: string; name: string };

const program = new Command();
program
  .name('github-supply-chain-analyzer')
  .description('Analyze GitHub repositories for supply chain security artifacts')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input JSONL file with repository list', 'input/sandbox.jsonl')
  .option('--mock', 'Run in mock mode (no GitHub API calls)', false)
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
  verbose: boolean
): Promise<AnalysisResult | null> {
  const repoKey = `${repo.owner}/${repo.name}`;
  console.log(`\nProcessing repository: ${chalk.cyan(repoKey)}`);

  let repoData: GetRepoDataQuery | null = null;

  if (useMock) {
    try {
      // Always use the real API response shape: { data: { repository: ... } }
      const mockResponse = getMockApiResponse('GetRepoData', repo.owner, repo.name) as { data: GetRepoDataQuery };
      repoData = mockResponse.data;
    } catch {
      console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
      return null;
    }
  } else {
    repoData = await fetchRepositoryData(client!, { owner: repo.owner, name: repo.name }, verbose);
  }

  if (repoData && repoData.repository) {
    return analyzeRepositoryData(repoData.repository);
  }
  return null;
}

async function main() {
  const { verbose, mock, input, output, parallel, help } = opts;
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

  if (help) {
    program.help();
    return;
  }

  const useMock = mock || process.env.MOCK_GITHUB === '1';
  if (useMock) {
    console.log(chalk.magenta.bold('🧪 MOCK MODE ENABLED: Using mock GitHub data.'));
  }

  const githubPat = process.env.GITHUB_PAT;
  if (!useMock && !githubPat) {
    console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
    process.exit(1);
  }
  const client = useMock ? null : createApiClient(githubPat!);

  if (!fs.existsSync(input)) {
    console.error(chalk.red.bold(`Input file not found: ${input}`));
    program.help();
    process.exit(1);
  }
  const repoLines = fs.readFileSync(input, 'utf-8').split('\n').filter(Boolean);
  const repositories: RepositoryTarget[] = repoLines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(chalk.red(`Invalid JSON in input file: ${line}`));
      process.exit(1);
    }
  });

  const allAnalysisResults: (AnalysisResult | null)[] = [];

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
  //        chunks (defaulting to 10) to avoid overwhelming the API and triggering
  //        secondary (abuse) rate limits.
  //      - RESILIENT ERROR HANDLING: We use `Promise.allSettled()`, which waits for all
  //        promises in a batch to finish, regardless of whether they succeed or fail. This
  //        ensures that one failed repository request doesn't crash the entire run.
  // =============================================================================================

  if (parallel) {
    // --- PARALLEL EXECUTION ---
    const batchSize = typeof parallel === 'string' ? parseInt(parallel, 10) || 10 : 10;
    console.log(chalk.bold.yellow(`⚡ Running in PARALLEL mode with a batch size of ${batchSize}.`));

    for (let i = 0; i < repositories.length; i += batchSize) {
      const batch = repositories.slice(i, i + batchSize);
      console.log(
        chalk.gray(`\n-- Processing batch ${i / batchSize + 1} (${batch.length} repos) --`)
      );

      const promises = batch.map(repo => fetchAndAnalyzeRepo(repo, client, useMock, verbose));
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
    }
  } else {
    // --- SEQUENTIAL EXECUTION ---
    console.log(chalk.bold.blue('🐌 Running in SEQUENTIAL mode.'));
    for (const repo of repositories) {
      const result = await fetchAndAnalyzeRepo(repo, client, useMock, verbose);
      allAnalysisResults.push(result);
    }
  }

  // --- REPORT GENERATION ---
  const validAnalysisResults = allAnalysisResults.filter(
    (res): res is Exclude<AnalysisResult, null> => res !== null
  );

  if (validAnalysisResults.length > 0) {
    if (verbose) {
      // ... (verbose legend output remains the same)
    }
    await generateReports(validAnalysisResults, output);

    console.log(chalk.bold.bgBlueBright.white('\n  GitHub Supply Chain Security Summary  '));
    const ciToolTypes = [
        { key: 'sbom', label: 'SBOM Art.' },
        { key: 'signature', label: 'Sig Art.' },
        { key: 'attestation', label: 'Att Art.' },
        { key: 'sbom-generator', label: 'SBOM Gen CI' },
        { key: 'signer', label: 'Signer CI' },
        { key: 'goreleaser', label: 'Goreleaser CI' },
    ];

    const table = new Table({
      head: [chalk.bold('Repo'), ...ciToolTypes.map(t => chalk.bold(t.label)), chalk.bold('Latest Release')],
      colWidths: [20, ...Array(ciToolTypes.length).fill(14), 18],
      style: { head: [], border: [] },
    });

    const ciToolCounts: Record<string, number> = Object.fromEntries(ciToolTypes.map(t => [t.key, 0]));

    for (const result of validAnalysisResults) {
        const ciTools = new Set(result.summary.sbomCiTools);
    const row = [
      chalk.cyan(result.repository.name),
      ...ciToolTypes.map(t => {
        const present = ciTools.has(t.key);
        if (present) ciToolCounts[t.key]++;
        return present ? chalk.greenBright('✔') : '';
      }),
      result.releases?.[0] ? chalk.white(result.releases[0].tagName) : '',
    ];
    table.push(row);
    }
    console.log(table.toString());

    const totalsSummary = ciToolTypes.map(t => `${chalk.bold(t.label)}: ${ciToolCounts[t.key]}`).join(' | ');
    console.log(chalk.blue.bold(`\nTotals: Repos: ${validAnalysisResults.length} | ${totalsSummary}`));
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }

  console.log(chalk.blue.bold('\n✨ Analysis complete.'));
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});