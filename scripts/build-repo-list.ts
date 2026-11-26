/**
 * build-repo-list.ts
 *
 * Builds a reproducible, deduplicated repository list for the supply-chain-security-collector
 * by UNION-ing two sources:
 *
 *   (a) CNCF landscape repos — from https://landscape.cncf.io/data/full.json (.items[])
 *       The full.json endpoint returns real application/json. Do NOT use items.json —
 *       that URL now returns the landscape2 SPA shell (HTML).
 *
 *   (b) .project repositories[] — for each CNCF project, fetches
 *       https://raw.githubusercontent.com/<org>/.project/main/project.yaml
 *       and adds any repos not already in the landscape. Projects without a .project
 *       repo (404) are skipped gracefully.
 *
 * Each output entry carries a `source` provenance label: "landscape", "dot-project", or "both".
 * Deduplication is on nameWithOwner (owner/name, case-insensitive).
 *
 * Usage:
 *   npm run build:repos                                       # fetch live, write to input/
 *   npm run build:repos -- --output input/my-custom.json     # custom output path
 *   npm run build:repos -- --no-dot-project                  # landscape only (no .project fetch)
 *   npm run build:repos -- --dry-run                         # print summary, don't write files
 *   npm run build:repos -- --verbose                         # log per-project detail
 *
 * Environment (optional):
 *   GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN  — reduces rate-limiting on .project fetches.
 *   Without a token, unauthenticated raw.githubusercontent.com GETs are used.
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// ============================================================================
// CLI ARGS
// ============================================================================

function parseArgs(): {
  output: string;
  dotProject: boolean;
  dryRun: boolean;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  let output = path.join(__dirname, '../input/cncf-expanded-repo-list.json');
  let dotProject = true;
  let dryRun = false;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === '--no-dot-project') {
      dotProject = false;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    }
  }

  return { output, dotProject, dryRun, verbose };
}

// ============================================================================
// TYPES
// ============================================================================

// Matches src/config.ts ProjectMetadata + provenance extension
interface RepoRef {
  owner: string;
  name: string;
  primary: boolean;
  branch?: string;
}

interface ProjectMetadataWithSource {
  project_name: string;
  display_name?: string;
  description?: string;
  repos: RepoRef[];
  maturity?: 'graduated' | 'incubating' | 'sandbox' | 'archived';
  category?: string;
  subcategory?: string;
  date_accepted?: string;
  date_incubating?: string;
  date_graduated?: string;
  date_archived?: string;
  homepage_url?: string;
  repo_url?: string;        // primary repo URL (for compatibility with existing pipeline)
  package_manager_url?: string;
  docker_url?: string;
  documentation_url?: string;
  blog_url?: string;
  url_for_bestpractices?: string;
  clomonitor_name?: string;
  has_security_audits?: boolean;
  security_audit_count?: number;
  latest_audit_date?: string;
  latest_audit_vendor?: string;
  crunchbase?: string;
  twitter?: string;
  parent_project?: string;
  tag_associations?: string;
  annual_review_date?: string;
  annual_review_url?: string;
  license?: string;
  default_branch?: string;
  dev_stats_url?: string;
  // Provenance (extension beyond base ProjectMetadata)
  source: 'landscape' | 'dot-project' | 'both';
  dot_project_repos?: string[];  // net-new repos added from .project
}

// landscape.cncf.io/data/full.json item shape
// full.json uses a flat structure (no nested `extra`, no `additional_repos`).
interface FullJsonRepository {
  url: string;
  primary?: boolean;
  branch?: string;
}

interface FullJsonAudit {
  date?: string;
  type?: string;
  url?: string;
  vendor?: string;
}

interface FullJsonSummary {
  business_use_case?: string;
  integrations?: string;
  personas?: string[];
  release_rate?: string;
  tags?: string[];
  use_case?: string;
}

interface FullJsonItem {
  // Core identity
  id: string;
  name: string;
  category: string;
  subcategory: string;
  maturity?: 'graduated' | 'incubating' | 'sandbox' | 'archived';
  // Repos
  repositories?: FullJsonRepository[];
  // URLs
  homepage_url?: string;
  website?: string;
  crunchbase_url?: string;
  twitter_url?: string;
  devstats_url?: string;
  mailing_list_url?: string;
  slack_url?: string;
  artwork_url?: string;
  blog_url?: string;
  // CNCF dates
  accepted_at?: string;
  incubating_at?: string;
  graduated_at?: string;
  archived_at?: string;
  // Security
  audits?: FullJsonAudit[];
  // CLOMonitor
  clomonitor_name?: string;
  lfx_slug?: string;
  // Tags
  oss?: boolean;
  // Summary fields
  summary?: FullJsonSummary;
  // Extra fields we may not need but shouldn't error on
  [key: string]: unknown;
}

interface FullJsonResponse {
  items?: FullJsonItem[];
  [key: string]: unknown;
}

// .project project.yaml shape (what we need)
interface DotProjectYaml {
  schema_version?: string;
  slug?: string;
  name?: string;
  description?: string;
  repositories?: string[];
  maturity_log?: Array<{ phase?: string; date?: string; issue?: string }>;
}

// ============================================================================
// LANDSCAPE SOURCE
// ============================================================================

// IMPORTANT: Use full.json, NOT items.json.
// items.json returns HTML (landscape2 SPA shell) — content-type: text/html.
// full.json returns content-type: application/json with an .items[] array.
const FULL_JSON_URL = 'https://landscape.cncf.io/data/full.json';

function repoFromUrl(url: string, primary: boolean, branch?: string): RepoRef | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/#? ]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    name: match[2].replace(/\.git$/, ''),
    primary,
    branch,
  };
}

async function fetchLandscapeProjects(): Promise<Map<string, ProjectMetadataWithSource>> {
  console.log(`\nFetching landscape: ${FULL_JSON_URL}`);
  const resp = await fetch(FULL_JSON_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch full.json: ${resp.status} ${resp.statusText}`);
  }
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(
      `full.json returned text/html — the URL may have changed.\n` +
      `  items.json now returns the landscape2 SPA shell.\n` +
      `  Current URL: ${FULL_JSON_URL}\n` +
      `  Check https://landscape.cncf.io for the correct data endpoint.`
    );
  }

  const data = (await resp.json()) as FullJsonResponse;
  const items: FullJsonItem[] = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    const topKeys = Object.keys(data).join(', ');
    throw new Error(
      `full.json returned 0 items. Top-level keys: [${topKeys}].\n` +
      `  The response shape may have changed.`
    );
  }

  console.log(`  Loaded ${items.length} landscape items`);

  const byProjectName = new Map<string, ProjectMetadataWithSource>();

  for (const item of items) {
    // Only CNCF projects have a maturity field
    if (!item.maturity) continue;

    const repos: RepoRef[] = [];
    for (const r of item.repositories || []) {
      const ref = repoFromUrl(r.url, r.primary === true, r.branch);
      if (ref) repos.push(ref);
    }
    if (repos.length === 0) continue;

    const audits = item.audits || [];
    const primaryRepo = repos.find(r => r.primary);
    const project_name = item.name.replace(/[^a-zA-Z0-9\-_. ]/g, '');

    const metadata: ProjectMetadataWithSource = {
      project_name,
      display_name: item.name,
      description: item.summary?.use_case,
      repos,
      maturity: item.maturity,
      category: item.category,
      subcategory: item.subcategory,
      date_accepted: item.accepted_at,
      date_incubating: item.incubating_at,
      date_graduated: item.graduated_at,
      date_archived: item.archived_at,
      homepage_url: item.homepage_url || item.website,
      repo_url: primaryRepo ? `https://github.com/${primaryRepo.owner}/${primaryRepo.name}` : undefined,
      blog_url: item.blog_url,
      dev_stats_url: item.devstats_url,
      clomonitor_name: item.clomonitor_name,
      has_security_audits: audits.length > 0,
      security_audit_count: audits.length,
      latest_audit_date: audits.length > 0 ? audits[audits.length - 1].date : undefined,
      latest_audit_vendor: audits.length > 0 ? audits[audits.length - 1].vendor : undefined,
      crunchbase: item.crunchbase_url,
      twitter: item.twitter_url,
      source: 'landscape',
    };

    byProjectName.set(project_name.toLowerCase(), metadata);
  }

  console.log(`  Extracted ${byProjectName.size} CNCF projects from landscape`);
  return byProjectName;
}

// ============================================================================
// .PROJECT SOURCE
// ============================================================================

async function fetchDotProject(
  org: string,
  projectName: string,
  githubToken: string | undefined,
  verbose: boolean
): Promise<DotProjectYaml | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'supply-chain-security-collector/1.0',
  };
  // Token not needed for public repos on raw.githubusercontent.com but helps with rate limits
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  // Try main branch first, then master
  for (const branch of ['main', 'master']) {
    const url = `https://raw.githubusercontent.com/${org}/.project/${branch}/project.yaml`;
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 404) continue;
      if (resp.status === 403 || resp.status === 429) {
        console.warn(`  [rate-limited] ${org}/.project (HTTP ${resp.status}) — set GITHUB_TOKEN to raise limits`);
        return null;
      }
      if (!resp.ok) {
        if (verbose) console.log(`    [${projectName}] ${org}/.project (${branch}): HTTP ${resp.status}`);
        return null;
      }
      const text = await resp.text();
      try {
        const parsed = yaml.parse(text) as DotProjectYaml;
        if (parsed && Array.isArray(parsed.repositories) && parsed.repositories.length > 0) {
          return parsed;
        }
        return null;  // no repositories field or empty
      } catch {
        if (verbose) console.log(`    [${projectName}] YAML parse error for ${org}/.project`);
        return null;
      }
    } catch (err) {
      if (verbose) {
        console.log(`    [${projectName}] fetch error: ${err instanceof Error ? err.message : err}`);
      }
      return null;
    }
  }
  return null;
}

// ============================================================================
// DEDUP HELPERS
// ============================================================================

function nwo(owner: string, name: string): string {
  return `${owner}/${name}`.toLowerCase();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const { output, dotProject: fetchDotProjectData, dryRun, verbose } = parseArgs();

  const githubToken =
    process.env.GITHUB_TOKEN ||
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
    undefined;

  console.log('');
  console.log('CNCF Expanded Repo List Builder');
  console.log('='.repeat(50));
  console.log(`Sources: landscape (full.json)${fetchDotProjectData ? ' + .project repos' : ''}`);
  if (githubToken) {
    console.log('  GitHub token: set (rate limits raised)');
  } else {
    console.log('  GitHub token: not set (unauthenticated; set GITHUB_TOKEN to raise rate limits)');
  }
  console.log(`Output:  ${dryRun ? '[dry-run, no write]' : output}`);
  console.log('');

  // ── Step 1: Fetch landscape ──────────────────────────────────────────────
  const projectsByName = await fetchLandscapeProjects();

  // Build global nameWithOwner registry for dedup
  const nwoRegistry = new Map<string, string>();  // nwo -> project_name
  for (const [pname, meta] of projectsByName) {
    for (const repo of meta.repos) {
      nwoRegistry.set(nwo(repo.owner, repo.name), pname);
    }
  }

  let landscapeRepoCount = 0;
  for (const meta of projectsByName.values()) landscapeRepoCount += meta.repos.length;
  console.log(`  Landscape repos: ${landscapeRepoCount} across ${projectsByName.size} projects`);

  // ── Step 2: .project enrichment ──────────────────────────────────────────
  let dotProjectFound = 0;
  let dotProjectSkipped = 0;
  let dotProjectAdded = 0;

  if (fetchDotProjectData) {
    console.log('\nFetching .project repos for CNCF projects...');
    if (!githubToken) {
      console.log('  (no GITHUB_TOKEN — using unauthenticated GETs; set token to avoid rate limits)');
    }
    console.log('  (projects without a .project repo are skipped gracefully)\n');

    const projectList = Array.from(projectsByName.values());

    // Process in small concurrent batches to avoid hammering GitHub
    const BATCH_SIZE = 8;
    const BATCH_DELAY_MS = 600;

    for (let i = 0; i < projectList.length; i += BATCH_SIZE) {
      const batch = projectList.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (meta) => {
        const primaryRepo = meta.repos.find(r => r.primary) || meta.repos[0];
        if (!primaryRepo) return;
        const org = primaryRepo.owner;

        const dotData = await fetchDotProject(org, meta.display_name || meta.project_name, githubToken, verbose);
        if (!dotData) {
          dotProjectSkipped++;
          return;
        }

        dotProjectFound++;
        const newRepos: string[] = [];

        for (const repoUrl of dotData.repositories || []) {
          const r = repoFromUrl(repoUrl, false);
          if (!r) continue;
          const key = nwo(r.owner, r.name);

          if (!nwoRegistry.has(key)) {
            // Net-new repo not captured by landscape — add to this project
            meta.repos.push({ ...r, primary: false });
            nwoRegistry.set(key, meta.project_name.toLowerCase());
            newRepos.push(`${r.owner}/${r.name}`);
            dotProjectAdded++;
            if (verbose) {
              console.log(`  + ${r.owner}/${r.name} (${meta.display_name} via .project)`);
            }
          }
        }

        if (newRepos.length > 0) {
          meta.dot_project_repos = newRepos;
          meta.source = 'both';
        }
      }));

      if (i + BATCH_SIZE < projectList.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }

      const done = Math.min(i + BATCH_SIZE, projectList.length);
      process.stdout.write(`\r  Progress: ${done}/${projectList.length} projects  `);
    }
    console.log('\n');

    const enrichedProjects = Array.from(projectsByName.values()).filter(m => m.source === 'both');
    console.log('.project summary:');
    console.log(`  Projects with .project repo found:  ${dotProjectFound}`);
    console.log(`    - contributed extra repos:        ${enrichedProjects.length} projects, ${dotProjectAdded} net-new repos`);
    console.log(`  Projects without .project (404/skipped): ${dotProjectSkipped}`);
  }

  // ── Step 3: Final output ──────────────────────────────────────────────────
  const finalProjects = Array.from(projectsByName.values());

  const allNwo = new Set<string>();
  for (const meta of finalProjects) {
    for (const repo of meta.repos) {
      allNwo.add(nwo(repo.owner, repo.name));
    }
  }

  console.log('\nFinal counts:');
  console.log(`  Projects:               ${finalProjects.length}`);
  console.log(`  Total unique repos:     ${allNwo.size} (deduped on owner/name)`);
  console.log(`    landscape-only:       ${finalProjects.filter(m => m.source === 'landscape').length} projects`);
  console.log(`    enriched by .project: ${finalProjects.filter(m => m.source === 'both').length} projects`);

  if (!dryRun) {
    const outDir = path.dirname(output);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(output, JSON.stringify(finalProjects, null, 2) + '\n');
    console.log(`\nWritten: ${output}`);
  } else {
    console.log('\n[dry-run] No files written.');
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
