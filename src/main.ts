
import 'dotenv/config';
import { GraphQLClient } from 'graphql-request';
import NodeCache from 'node-cache';
import chalk from 'chalk';
import { Command } from 'commander';
import { gql } from './generated/gql';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeRepositoryData } from './analysis';
import { GetRepoDataQuery } from './generated/graphql';
import { generateReports } from './report';
import { mockRepoData } from './mockData';

const program = new Command();
program
  .name('github-supply-chain-analyzer')
  .description('Analyze GitHub repositories for supply chain security artifacts')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input JSONL file with repository list', 'input/sandbox.jsonl')
  .option('--mock', 'Run in mock mode (no GitHub API calls)', false)
  .option('-o, --output <dir>', 'Output directory for reports', 'output')
  .helpOption('-h, --help', 'Display help for command');
program.parse(process.argv);
const opts = program.opts();

// Initialize cache with a 24-hour TTL (used only in real API mode)
const cache = new NodeCache({ stdTTL: 86400 });


/**
 * Main entry point for the CLI tool.
 * Handles environment setup, repository iteration, data fetching (mock or real),
 * analysis, and report generation.
 */
async function main() {
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

  // Use CLI options or environment variables
  const useMock = opts.mock || process.env.MOCK_GITHUB === '1';
  const inputFile = opts.input || process.env.REPO_INPUT || path.join(__dirname, '../input/sandbox.jsonl');
  const outputDir = opts.output || 'output';

  if (opts.help) {
    program.help();
    return;
  }

  if (useMock) {
    console.log(chalk.magenta.bold('🧪 MOCK MODE ENABLED: Using mock GitHub data.'));
  }

  // Initialize GraphQL client for real API mode
  let client: GraphQLClient | null = null;
  if (!useMock) {
    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      // Fail fast if no PAT is set
      console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
      process.exit(1);
    }
    client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${githubPat}`,
      },
    });
  }

  // Collect all analysis results for reporting
  const allAnalysisResults = [];

  // The Repository type matches the GraphQL schema for type safety
  type Repository = GetRepoDataQuery['repository'];
  type RepositoryTarget = { owner: string; name: string };

  if (!fs.existsSync(inputFile)) {
    console.error(chalk.red.bold(`Input file not found: ${inputFile}`));
    program.help();
    process.exit(1);
  }
  // Read and parse the input file (expects JSONL: one {owner, name} per line)
  const repoLines = fs.readFileSync(inputFile, 'utf-8').split('\n').filter(Boolean);
  const repositories: RepositoryTarget[] = repoLines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.error(chalk.red(`Invalid JSON in input file: ${line}`));
      process.exit(1);
    }
  });

  for (const repo of repositories) {
    // Each repo is identified by owner/name (e.g., sigstore/cosign)
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    // repoData will hold the GraphQL response for this repo
    let repoData: { repository: Repository } | null = null;
    if (useMock) {
      // In mock mode, look up static data by key (owner_name)
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_') as keyof typeof mockRepoData;
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        // Warn and skip if no mock data is available
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      // In real mode, check cache first to avoid redundant API calls
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData as { repository: Repository };
      } else {
        // Build and execute the GraphQL query for this repo
        console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
        try {
          // The query is defined in src/graphql/GetRepoData.graphql and codegen'd
          const document = gql(`query GetRepoData($owner: String!, $name: String!) {\n  repository(owner: $owner, name: $name) {\n    name\n    url\n    description\n    releases(last: 3, orderBy: { field: CREATED_AT, direction: DESC }) {\n      nodes {\n        name\n        tagName\n        url\n        createdAt\n        releaseAssets(first: 50) {\n          nodes {\n            name\n            downloadUrl\n          }\n        }\n      }\n    }\n    workflows: object(expression: \"HEAD:.github/workflows\") {\n      ... on Tree {\n        entries {\n          name\n          object {\n            ... on Blob {\n              text\n            }\n          }\n        }\n      }\n    }\n  }\n}\n`);
          repoData = await client!.request(document as any, { owner: repo.owner, name: repo.name });
          cache.set(cacheKey, repoData);
          console.log(chalk.green('👍 Data fetched and cached successfully.'));
        } catch (error) {
          // Log and skip on API/network errors
          console.error(chalk.red(`Failed to fetch data for ${cacheKey}:`), error);
          continue;
        }
      }
    }

    // Only analyze if data is present (mock or real)
    if (repoData && repoData.repository) {
      // Analyze the repository for supply chain security signals
      const analysisResult = analyzeRepositoryData(repoData.repository as any);
      allAnalysisResults.push(analysisResult);
    }
  }

  // Generate reports if any repositories were successfully analyzed
  if (allAnalysisResults.length > 0) {
    await generateReports(allAnalysisResults, outputDir);

    // --- Modern CLI Compact Table Summary ---
    console.log(chalk.bold.bgBlueBright.white('\n  GitHub Supply Chain Security Summary  '));

    // Table header
    const header = [
      chalk.bold('Repo'),
      chalk.bold('SBOM'),
      chalk.bold('Signature'),
      chalk.bold('Attestation'),
      chalk.bold('CI Tools'),
      chalk.bold('Latest Release'),
    ];
    console.log(header.join('  |  '));
    console.log('-'.repeat(90));

    // Aggregate stats
    let sbomCount = 0, sigCount = 0, attCount = 0, ciCount = 0, total = 0;

    for (const result of allAnalysisResults) {
      if (!result) continue;
      total++;
      const repo = result.repository;
      const summary = result.summary;
      const release = result.releases?.[0];
      const ciTools = Array.isArray(summary.sbomCiTools) ? summary.sbomCiTools : Array.from(summary.sbomCiTools || []);
      // Flags
      const sbom = summary.hasSbomArtifact ? chalk.greenBright('✔') : chalk.gray('✗');
      const sig = summary.hasSignatureArtifact ? chalk.greenBright('✔') : chalk.gray('✗');
      const att = summary.hasAttestationArtifact ? chalk.greenBright('✔') : chalk.gray('✗');
      if (summary.hasSbomArtifact) sbomCount++;
      if (summary.hasSignatureArtifact) sigCount++;
      if (summary.hasAttestationArtifact) attCount++;
      if (ciTools.length > 0) ciCount++;
      // Table row
      console.log([
        chalk.cyan(repo.name),
        sbom,
        sig,
        att,
        ciTools.length > 0 ? chalk.white(ciTools.join(',')) : chalk.gray('-'),
        release ? chalk.white(release.tagName) : chalk.gray('-'),
      ].join('  |  '));
    }

    // Legend and totals
    console.log('\n' + chalk.bold('Legend:') + ' ' + chalk.greenBright('✔ = present') + ', ' + chalk.gray('✗ = absent') + ', ' + chalk.gray('- = none'));
    console.log(
      chalk.bold('Totals: ') +
      `Repos: ${total}  ` +
      chalk.greenBright(`SBOM: ${sbomCount}`) + '  ' +
      chalk.greenBright(`Signature: ${sigCount}`) + '  ' +
      chalk.greenBright(`Attestation: ${attCount}`) + '  ' +
      chalk.magenta(`CI Tools: ${ciCount}`)
    );
    console.log(chalk.blue.bold('\n✨ Analysis complete.'));
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }
}

// Start the CLI tool and handle any unexpected errors
main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});
