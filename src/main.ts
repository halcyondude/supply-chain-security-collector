import 'dotenv/config';
import { GraphQLClient } from 'graphql-request';
import NodeCache from 'node-cache';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeRepositoryData } from './analysis';
import { generateReports } from './report';
import { mockRepoData } from './mockData';

import { GetRepoDataDocument, GetRepoDataQuery } from './generated/graphql';

// FIX: Define a type for the result of our analysis function.
// This uses TypeScript's `ReturnType` to automatically infer the type.
type AnalysisResult = ReturnType<typeof analyzeRepositoryData>;

const program = new Command();
program
  .name('github-supply-chain-analyzer')
  .description('Analyze GitHub repositories for supply chain security artifacts')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input JSONL file with repository list', 'input/sandbox.jsonl')
  .option('--mock', 'Run in mock mode (no GitHub API calls)', false)
  .option('-o, --output <dir>', 'Output directory for reports', 'output')
  .option('-v, --verbose', 'Show detailed column explanations and artifact details', false)
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

  let client: GraphQLClient | null = null;
  if (!useMock) {
    const githubPat = process.env.GITHUB_PAT;
    if (!githubPat) {
      console.error(chalk.red.bold('Error: GITHUB_PAT environment variable not set.'));
      process.exit(1);
    }
    client = new GraphQLClient('https://api.github.com/graphql', {
      headers: {
        Authorization: `Bearer ${githubPat}`,
      },
    });
  }

  // FIX: Explicitly type the array during initialization.
  const allAnalysisResults: AnalysisResult[] = [];

  type Repository = GetRepoDataQuery['repository'];
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

    let repoData: { repository: Repository } | null = null;
    if (useMock) {
      const mockKey = `${repo.owner}_${repo.name}`.replace(/-/g, '_') as keyof typeof mockRepoData;
      repoData = mockRepoData[mockKey] || null;
      if (!repoData) {
        console.log(chalk.yellow('⚠️ No mock data found for this repository. Skipping.'));
        continue;
      }
    } else {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log(chalk.green('✅ Found data in cache.'));
        repoData = cachedData as { repository: Repository };
      } else {
        console.log(chalk.yellow('🔄 Fetching data from GitHub API...'));
        try {
          repoData = await client!.request(GetRepoDataDocument, { owner: repo.owner, name: repo.name });
          cache.set(cacheKey, repoData);
          console.log(chalk.green('👍 Data fetched and cached successfully.'));
        } catch (error) {
          console.error(chalk.red(`Failed to fetch data for ${cacheKey}:`), error);
          continue;
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
      console.log(chalk.bold.bgWhite.black('\n  Column Legend & Detection Logic  '));
      const legendRows = [
        [chalk.bold('Column'), chalk.bold('Description'), chalk.bold('Detection Logic')],
        ['Repo', 'Repository name', 'From input file'],
        ['SBOM Gen', 'SBOM generator tool in CI', 'Regex: syft|trivy|cdxgen|spdx-sbom-generator in workflow YAML'],
        ['Signer', 'Signature/attestation tool in CI', 'Regex: cosign|sigstore|slsa-github-generator in workflow YAML'],
        ['Goreleaser', 'Goreleaser used in CI', 'Regex: goreleaser/goreleaser-action in workflow YAML'],
        ['SBOM', 'SBOM artifact in release', 'Filename: sbom|spdx|cyclonedx'],
        ['Signature', 'Signature artifact in release', 'Extension: .sig, .asc, .pem, .pub'],
        ['Attestation', 'Attestation artifact in release', 'Filename: attestation'],
        ['Latest Release', 'Most recent release tag', 'GitHub Releases API'],
        ['Release Date', 'Date of latest release', 'GitHub Releases API'],
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
    await generateReports(allAnalysisResults, outputDir);

    console.log(chalk.bold.bgBlueBright.white('\n  GitHub Supply Chain Security Summary  '));

    const ciToolTypes = [
      { key: 'sbom-generator', label: 'SBOM Gen' },
      { key: 'signer', label: 'Signer' },
      { key: 'goreleaser', label: 'Goreleaser' },
      { key: 'sbom', label: 'SBOM' },
      { key: 'signature', label: 'Signature' },
      { key: 'attestation', label: 'Attestation' },
    ];

    const table = new Table({
      head: [
        chalk.bold('Repo'),
        ...ciToolTypes.map(t => chalk.bold(t.label)),
        chalk.bold('Latest Release'),
        chalk.bold('Release Date'),
      ],
      colWidths: [18, ...Array(ciToolTypes.length).fill(12), 16, 18],
      wordWrap: true,
      style: { head: [], border: [] },
    });

    let total = 0;
    const ciToolCounts: Record<string, number> = Object.fromEntries(ciToolTypes.map(t => [t.key, 0]));

    for (const result of validAnalysisResults) {
      total++;
      const repo = result.repository;
      const summary = result.summary;
      const release = result.releases?.[0];
      const ciTools = summary.sbomCiTools;
      const row = [
        chalk.cyan(repo.name || ''),
        ...ciToolTypes.map(t => {
          const present = ciTools.includes(t.key);
          if (present) ciToolCounts[t.key]++;
          return present ? chalk.greenBright('✔') : '';
        }),
        release ? chalk.white(release.tagName) : chalk.gray('-'),
        release && release.createdAt ? chalk.white(new Date(release.createdAt).toISOString().slice(0, 10)) : chalk.gray('-'),
      ];
      table.push(row);
    }

    console.log(table.toString());

    if (verbose) {
      console.log(chalk.bold.bgWhite.black('\n  Artifact Details by Repository  '));
      for (const result of validAnalysisResults) {
        const repo = result.repository;
        let orgRepo = repo.url && typeof repo.url === 'string' ? repo.url.replace('https://github.com/', '') : repo.name;
        if (!orgRepo) orgRepo = repo.name;
        for (const release of result.releases || []) {
          if (release.artifacts && release.artifacts.length > 0) {
            const artTable = new Table({
              head: [chalk.bold('Repo'), chalk.bold('Artifact'), chalk.bold('Type(s)'), chalk.bold('Download URL')],
              style: { head: [], border: [] },
            });
            for (const art of release.artifacts) {
              const types = [];
              if (art.isSbom) types.push(chalk.greenBright('SBOM'));
              if (art.isSignature) types.push(chalk.greenBright('Signature'));
              if (art.isAttestation) types.push(chalk.greenBright('Attestation'));
              artTable.push([
                chalk.white(orgRepo),
                chalk.white(art.name),
                types.join(', '),
                art.downloadUrl ? chalk.blue.underline(art.downloadUrl) : chalk.gray('-'),
              ]);
            }
            console.log(artTable.toString());
          } else {
            console.log(chalk.bold.underline(`\n${orgRepo}`));
            if (repo.description) console.log(chalk.gray(repo.description));
            console.log(chalk.bold(`  Release: `) + chalk.white(release.tagName) + chalk.gray(` (${release.createdAt ? new Date(release.createdAt).toISOString().slice(0, 10) : '-'})`));
            console.log(chalk.gray('    No artifacts found.'));
          }
        }
      }
    }

    console.log('\n' + chalk.bold('Legend:') + ' ' + chalk.greenBright('✔ = present') + ', ' + chalk.gray('- = none'));
    console.log(
      chalk.bold('Totals: ') +
      `Repos: ${total}  ` +
      ciToolTypes.map(t => chalk.greenBright(`${t.label}: ${ciToolCounts[t.key]}`)).join('  ')
    );
    console.log(chalk.blue.bold('\n✨ Analysis complete.'));
  } else {
    console.log(chalk.yellow('No data was analyzed. Reports will not be generated.'));
  }
}

main().catch((error) => {
  console.error(chalk.red.bold('An unexpected error occurred:'), error);
});