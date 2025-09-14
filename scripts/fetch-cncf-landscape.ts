// This script fetches the CNCF landscape YAML and generates input files for Sandbox, Incubation, and Graduated projects.
// It is intended to be run with: npx ts-node scripts/fetch-cncf-landscape.ts
// Requires: node-fetch and yaml (install with npm install node-fetch@2 yaml)

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// URL of the CNCF landscape YAML file
const CNCF_YML_URL = 'https://raw.githubusercontent.com/cncf/landscape/refs/heads/master/landscape.yml';
const OUTPUT_DIR = path.join(__dirname, '../input');
const YML_FILE = path.join(__dirname, 'landscape.yml');

// Helper type for a repo entry
interface RepoTarget {
  owner: string;
  name: string;
}

// Helper function to recursively find all items with a repo_url and project maturity
function findRepos(obj: any, maturity: string, results: RepoTarget[] = []): RepoTarget[] {
  if (obj && typeof obj === 'object') {
    // If this object has a repo_url and project field, check maturity
    if (obj.repo_url && obj.project && typeof obj.repo_url === 'string' && typeof obj.project === 'string') {
      // Normalize maturity field (incubating vs incubation)
      const normalized = obj.project.toLowerCase().replace('incubating', 'incubation');
      if (normalized === maturity) {
        // Extract owner and name from the repo_url
        const match = obj.repo_url.match(/github.com\/([^/]+)\/([^/]+)$/);
        if (match) {
          results.push({ owner: match[1], name: match[2] });
        }
      }
    }
    // Recurse into all properties
    for (const key of Object.keys(obj)) {
      findRepos(obj[key], maturity, results);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      findRepos(item, maturity, results);
    }
  }
  return results;
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Download the YAML file
  console.log('Downloading CNCF landscape.yml...');
  const res = await fetch(CNCF_YML_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch YAML: ${res.statusText}`);
  }
  const ymlText = await res.text();
  fs.writeFileSync(YML_FILE, ymlText);

  // Parse YAML
  const doc = yaml.parse(ymlText);

  // For each maturity, extract repos and write to JSONL
  for (const maturity of ['sandbox', 'incubation', 'graduated']) {
    console.log(`Extracting ${maturity} projects...`);
    const repos = findRepos(doc, maturity);
    const outPath = path.join(OUTPUT_DIR, `${maturity}.jsonl`);
    const lines = repos.map(r => JSON.stringify(r)).join('\n');
    fs.writeFileSync(outPath, lines + (lines ? '\n' : ''));
    console.log(`  Wrote ${repos.length} repos to ${outPath}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
