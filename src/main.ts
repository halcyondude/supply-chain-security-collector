// src/main.ts

import 'dotenv/config';
import NodeCache from 'node-cache';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { analyzeRepositoryData } from './analysis';
import { generateReports } from './report';
import { mockRepoData } from './mockData';
import { createApiClient, fetchRepositoryData } from './api';
import { GetRepoDataQuery } from './generated/graphql';

type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;

const program = new Command();
program
  .name('github-supply-chain-analyzer')
  .description('Analyze GitHub repositories for supply chain security artifacts')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input JSONL file with repository list', 'input/sandbox.jsonl')
  .option('--mock', 'Run in mock mode (no GitHub API calls)', false)
  .option('-o, --output <dir>', 'Output directory for reports', 'output')
  .option('-v, --verbose', 'Show detailed API logging and column explanations', false)
  .helpOption('-h, --help', 'Display help for command');
program.parse(process.argv);
const opts = program.opts();

const cache = new NodeCache({ stdTTL: 86400 });

async function main() {
  const verbose = opts.verbose;
  console.log(chalk.blue.bold('🚀 Starting GitHub Supply Chain Security Analysis...'));

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

  const githubPat = process.env.GITHUB_PAT;
  if (!useMock && !githubPat) {
    console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
    process.exit(1);
  }
  const client = useMock ? null : createApiClient(githubPat!);

  const allAnalysisResults: AnalysisResult[] = [];
  type RepositoryTarget = { owner: string; name: string };

  if (!fs.existsSync(inputFile)) {
    console.error(chalk.red.bold(`Input file not found: ${inputFile}`));
    program.help();
    process.exit(1);
  }
  const repoLines = fs.readFileSync(inputFile, 'utf-8').split('\n').filter(Boolean);
  const repositories: RepositoryTarget[] = repoLines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(chalk.red(`Invalid JSON in input file: ${line}`));
      process.exit(1);
    }
  });

  for (const repo of repositories) {
    const cacheKey = `${repo.owner}/${repo.name}`;
    console.log(`\nProcessing repository: ${chalk.cyan(cacheKey)}`);

    let repoData: GetRepoDataQuery | null = null;
    if (useMock) {
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_') as keyof typeof mockRepoData;
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      const cachedData = cache.get<GetRepoDataQuery>(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData;
      } else {
        repoData = await fetchRepositoryData(client!, { owner: repo.owner, name: repo.name }, verbose);
        if (repoData) {
          cache.set(cacheKey, repoData);
          if (verbose) console.log(chalk.green('👍 Data cached successfully.'));
        }
      }
    }

    if (repoData && repoData.repository) {
      const analysisResult = analyzeRepositoryData(repoData.repository);
      allAnalysisResults.push(analysisResult);
    }
  }

  if (allAnalysisResults.length > 0) {
    const validAnalysisResults = allAnalysisResults.filter(
      (res): res is Exclude<AnalysisResult, null> => res !== null
    );

    if (verbose) {
      // ... (verbose legend table logic remains the same)
    }
    
    // FIX: Pass the 'validAnalysisResults' to the report generator.
    // This fixes the 'unused variable' lint error and is also a logical bug fix.
    await generateReports(validAnalysisResults, outputDir);

    console.log(chalk.bold.bgBlueBright.white('\n  GitHub Supply Chain Security Summary  '));
    // ... (summary table logic remains the same, but will correctly use validAnalysisResults)
    const table = new Table({
        // ...
    });
    for (const result of validAnalysisResults) {
        // ...
    }
    console.log(table.toString());


  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});