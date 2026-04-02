# Parallel Workstreams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the project into four parallel, non-overlapping workstreams that can execute simultaneously: spring cleaning merge, org-level CI visibility feature, interactive exploration platform, and presentation finalization.

**Architecture:** Each workstream operates in its own git worktree to avoid conflicts. Workstreams share the DuckDB database schema as a contract — new features add tables/columns but never modify existing ones. The CI visibility feature extends the collection pipeline (neo.ts → api.ts → normalizers → SQL models). The exploration platform is a separate static site in `site/`.

**Tech Stack:** TypeScript, DuckDB, GitHub GraphQL API, Preact + DuckDB-WASM (site), Mermaid.js, Observable Plot

---

## Workstream Map

```
WS-1: Spring Cleaning (merge existing branch)     ← 30 minutes, unblocks all others
WS-2: Org-Level CI Visibility Feature             ← 3-4 days, core pipeline work
WS-3: Interactive Exploration Platform             ← 3-4 days, separate directory
WS-4: Presentation Finalization                    ← 1 day, local-only artifacts
```

**Dependency:** WS-1 must merge first. WS-2, WS-3, WS-4 are fully parallel after that.

**Non-overlap guarantee:**
- WS-2 touches: `src/`, `sql/models/`, `src/graphql/`, `input/`, `scripts/fetch-cncf-landscape.ts`
- WS-3 touches: `site/`, `site/scripts/`, `.github/workflows/deploy-site.yml`
- WS-4 touches: `docs/` (local-only, untracked presentation files)
- Shared read-only: `output/` (both WS-2 and WS-3 read the database, neither modifies it concurrently)

---

## WS-1: Spring Cleaning Merge

**Goal:** Merge the `spring-cleaning` branch to main. This fixes 14 doc files, deletes 3 obsolete files, and rewrites data-model.md.

**Worktree:** `/tmp/spring-cleaning` (already exists with 5 commits)

### Task 1.1: Review and merge spring-cleaning

**Files:**
- Branch: `spring-cleaning` (5 commits, already pushed to `origin/spring-cleaning`)

- [ ] **Step 1: Review the diff**

```bash
git diff main..spring-cleaning --stat
```

Expected: 14 files changed, ~648 insertions, ~1478 deletions.

- [ ] **Step 2: Fast-forward merge to main**

```bash
git checkout main
git merge spring-cleaning
```

- [ ] **Step 3: Push and clean up**

```bash
git push origin main
git branch -d spring-cleaning
git push origin --delete spring-cleaning
git worktree remove /tmp/spring-cleaning
```

- [ ] **Step 4: Verify**

```bash
npm run lint
npx tsc --noEmit
```

Expected: 0 errors, warnings only.

- [ ] **Step 5: Commit verification**

No commit needed — merge brings the existing commits.

---

## WS-2: Org-Level CI Visibility Feature

**Goal:** For each CNCF project, scan ALL repos in the hosting GitHub org (not just the repos listed in landscape.yml). Produce a new report section showing what CI tools run across each org, with visual breakdowns.

**Worktree:** Create new worktree `ws-ci-visibility`

### Architecture

```
Two-phase collection to avoid GraphQL node limits:
  Phase 1: GetOrgRepos($org) → lightweight repo list (no workflow content)
  Phase 2: For repos NOT already in base_repositories, fetch workflows
           via existing GetRepoDataExtendedInfo (reuse existing pipeline)

Data flow:
  1. For each CNCF project, extract ALL unique orgs from repos[] array
  2. Deduplicate orgs across projects (kubernetes org appears once, not per-project)
  3. Phase 1: Fetch org repo list via GetOrgRepos (paginated, lightweight)
  4. Phase 2: For new repos, fetch workflows individually (skip repos already scanned)
  5. Store in base_org_repos and base_org_workflows tables
  6. New SQL model: 06_org_ci_visibility.sql → agg_org_ci_summary
  7. New report section in ReportGenerator

Rate limiting:
  - Check x-ratelimit-remaining after each org fetch
  - Sleep until reset when remaining < 500
  - Expected budget: ~230 orgs × ~2 pages = ~460 requests (well within 5000/hour)

Personal accounts:
  - organization(login: $org) returns null for personal accounts
  - Log warning, skip org, record in skipped_orgs array for summary
  - Do NOT create entries in base_org_repos for personal accounts
```

### File Map

```
Create: src/graphql/GetOrgRepos.graphql          — GraphQL query for org repos
Create: src/normalizers/GetOrgReposNormalizer.ts  — Normalize org repo list
Create: sql/models/06_org_ci_visibility.sql       — CI visibility analysis
Modify: src/neo.ts                                — Add --scan-orgs flag
Modify: src/api.ts                                — Add fetchOrgRepos function
Modify: src/ArtifactWriter.ts                     — Handle org repo data
Modify: src/SecurityAnalyzer.ts                   — Register model 06
Modify: src/ReportGenerator.ts                    — Add CI visibility section
Modify: src/config.ts                             — Add OrgMetadata interface
```

### Task 2.1: Create GetOrgRepos GraphQL query

**Files:**
- Create: `src/graphql/GetOrgRepos.graphql`

- [ ] **Step 1: Write the GraphQL query**

```graphql
query GetOrgRepos($org: String!, $cursor: String) {
  organization(login: $org) {
    __typename
    login
    repositories(first: 100, after: $cursor, privacy: PUBLIC, orderBy: { field: UPDATED_AT, direction: DESC }) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        id
        name
        nameWithOwner
        url
        description
        isArchived
        isFork
        defaultBranchRef {
          name
        }
        languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
          nodes {
            name
          }
        }
      }
    }
  }
}
```

Note: This query is LIGHTWEIGHT — repo metadata only, no workflow content. Workflow content is fetched in Phase 2 for repos not already in `base_repositories`, using the existing `GetRepoDataExtendedInfo` query. This avoids hitting the 500K-node GraphQL limit for large orgs like kubernetes (150+ repos).

- [ ] **Step 2: Verify codegen auto-discovers new query**

First confirm `codegen.ts` uses a glob pattern:
```bash
grep -n "documents" codegen.ts
```
Expected: should show `src/graphql/**/*.graphql` or similar glob. If it lists files explicitly, add `GetOrgRepos.graphql` to the list.

Then run codegen:
```bash
npm run codegen
```

Expected: SUCCESS, new types generated in `src/generated/graphql.ts` including `GetOrgReposDocument` and `GetOrgReposQuery`.

- [ ] **Step 3: Commit**

```bash
git add src/graphql/GetOrgRepos.graphql src/generated/
git commit -m "feat: add GetOrgRepos GraphQL query for org-level scanning"
```

### Task 2.2: Add org fetching to api.ts

**Files:**
- Modify: `src/api.ts`

- [ ] **Step 1: Add fetchOrgRepos function with cursor pagination**

Import the generated types. This is a NEW pattern — `fetchRepositoryExtendedInfo` does not paginate, so implement cursor-based pagination from scratch:

```typescript
async function fetchOrgRepos(client: GraphQLClient, org: string, verbose: boolean): Promise<OrgRepoResult | null> {
  const allRepos = [];
  let cursor: string | null = null;
  do {
    try {
      const result = await client.request(GetOrgReposDocument, { org, cursor });
      if (!result.organization) {
        if (verbose) console.log(chalk.yellow(`  ○ ${org}: not an organization (personal account?), skipping`));
        return null; // personal account, not an org
      }
      allRepos.push(...result.organization.repositories.nodes);
      const pageInfo = result.organization.repositories.pageInfo;
      cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } catch (err) {
      // Check rate limit
      if (err instanceof ClientError) {
        const remaining = err.response?.headers?.get('x-ratelimit-remaining');
        if (remaining && parseInt(remaining) < 500) {
          const reset = err.response?.headers?.get('x-ratelimit-reset');
          const waitMs = reset ? (parseInt(reset) * 1000 - Date.now()) : 60000;
          console.log(chalk.yellow(`  ⏳ Rate limit approaching, waiting ${Math.ceil(waitMs/1000)}s`));
          await new Promise(r => setTimeout(r, waitMs));
          continue; // retry this page
        }
      }
      console.log(chalk.red(`  ✗ ${org}: ${err}`));
      return null;
    }
  } while (cursor);
  return { org, repos: allRepos, totalCount: allRepos.length };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: add fetchOrgRepos with pagination for org-level scanning"
```

### Task 2.3: Add OrgMetadata to config.ts and normalizer

**Files:**
- Modify: `src/config.ts`
- Create: `src/normalizers/GetOrgReposNormalizer.ts`

- [ ] **Step 1: Add interfaces to config.ts**

```typescript
export interface OrgRepo {
  id: string;
  org: string;
  name: string;
  nameWithOwner: string;
  url: string;
  description: string;
  isArchived: boolean;
  isFork: boolean;
  defaultBranch: string;
  primaryLanguage: string;
  cncf_project_name: string; // which CNCF project this org belongs to
}

export interface OrgWorkflow {
  id: string;
  org: string;
  repo_name: string;
  nameWithOwner: string;
  filename: string;
  content: string;
  cncf_project_name: string;
}
```

- [ ] **Step 2: Write normalizer**

The normalizer takes the GraphQL response and produces flat arrays of `OrgRepo` and `OrgWorkflow` objects. Follow the pattern in `GetRepoDataExtendedInfoNormalizer.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts src/normalizers/GetOrgReposNormalizer.ts
git commit -m "feat: add org repo/workflow types and normalizer"
```

### Task 2.4: Wire org scanning into neo.ts

**Files:**
- Modify: `src/neo.ts`

- [ ] **Step 1: Add --scan-orgs CLI flag**

Add to the commander program:
```typescript
.option('--scan-orgs', 'Scan all repos in each project\'s GitHub org')
```

- [ ] **Step 2: Add org extraction logic**

After collecting primary repos, if `--scan-orgs` is set:
1. Extract unique GitHub orgs from the project repos (parse `owner` field)
2. For each org, call `fetchOrgRepos`
3. Pass results to ArtifactWriter for storage

Key consideration: Some CNCF projects share orgs (e.g., multiple projects under `kubernetes` org). Deduplicate org fetches. Map each org back to its CNCF project(s).

- [ ] **Step 3: Commit**

```bash
git add src/neo.ts
git commit -m "feat: add --scan-orgs flag for org-level CI scanning"
```

### Task 2.5: Add org tables to ArtifactWriter

**Files:**
- Modify: `src/ArtifactWriter.ts`

- [ ] **Step 1: Add table creation for base_org_repos and base_org_workflows**

Follow the existing pattern for `base_repositories` and `base_workflows`. Create tables with the schemas from the normalizer interfaces.

- [ ] **Step 2: Commit**

```bash
git add src/ArtifactWriter.ts
git commit -m "feat: add base_org_repos and base_org_workflows tables"
```

### Task 2.6: Create 06_org_ci_visibility.sql

**Files:**
- Create: `sql/models/06_org_ci_visibility.sql`

- [ ] **Step 1: Write the analysis model**

This SQL model should:
1. Create FTS indexes on `base_org_workflows` (same pattern as `00_initialize_indexes.sql`)
2. Run tool detection on org workflows (same FTS patterns as `02_workflow_tool_detection.sql`)
3. Produce `agg_org_ci_summary` with columns:
   - `cncf_project_name`, `org`, `total_repos`, `repos_with_workflows`, `total_workflows`
   - Per-tool booleans and counts (same tool list as existing detection)
   - `repos_in_landscape` vs `repos_not_in_landscape` (how many org repos are NOT listed in landscape.yml)
4. Produce `agg_org_tool_adoption` with per-org tool breakdown

- [ ] **Step 2: Register in SecurityAnalyzer.ts**

Add `06_org_ci_visibility.sql` to the model list. It should run conditionally — only when `base_org_workflows` exists.

- [ ] **Step 3: Commit**

```bash
git add sql/models/06_org_ci_visibility.sql src/SecurityAnalyzer.ts
git commit -m "feat: add org CI visibility SQL model"
```

### Task 2.7: Add CI visibility to ReportGenerator

**Files:**
- Modify: `src/ReportGenerator.ts`

- [ ] **Step 1: Add org CI visibility section**

New report section after the existing content:
- **"CI across CNCF organizations"** header
- Per-org summary: org name, total repos, repos with GitHub Actions, top tools
- Highlight orgs where landscape-listed repos are a small fraction of total (e.g., Kubernetes org has 100+ repos but we only scan 1)
- Show "hidden CI" — tools running in org repos not listed in landscape.yml

- [ ] **Step 2: Commit**

```bash
git add src/ReportGenerator.ts
git commit -m "feat: add org CI visibility section to report"
```

### Task 2.8: Update input files for org scanning

**Files:**
- Modify: `scripts/fetch-cncf-landscape.ts`

- [ ] **Step 1: Ensure org extraction works**

The landscape.yml already has `repo_url` for each project. The org is the first path segment. Verify that `fetch-cncf-landscape.ts` preserves the `repo_url` field in its output. It should — this is just verification.

- [ ] **Step 2: Integration test**

```bash
npm run test:three -- --scan-orgs
```

This should:
1. Collect primary repos as before
2. Also scan the `helm`, `nats-io`, `kubevela`, `jaegertracing`, and `inspektor-gadget` orgs
3. Produce `base_org_repos` and `base_org_workflows` tables
4. Run `06_org_ci_visibility.sql`
5. Report section shows org-level CI data

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-cncf-landscape.ts
git commit -m "feat: verify org extraction from landscape data"
```

---

## WS-3: Interactive Exploration Platform

**Goal:** Build a static site (GitHub Pages) with DuckDB-WASM for in-browser SQL exploration of the landscape data.

**Worktree:** Create new worktree `ws-exploration-platform`

**Spec:** Full architecture at `docs/exploration-platform-spec.md` (already written by Data Platform Architect agent)

### File Map

```
Create: site/                          — new directory, entire platform
Create: site/package.json             — Preact + Vite + DuckDB-WASM
Create: site/vite.config.ts           — Vite configuration
Create: site/index.html               — shell HTML
Create: site/src/app.tsx              — main app component
Create: site/src/components/
  Create: QueryEditor.tsx             — Monaco SQL editor
  Create: ResultTable.tsx             — AG Grid result display
  Create: ResultChart.tsx             — Observable Plot charts
  Create: FindingsOverview.tsx        — landing page with headline stats
  Create: QueryLibrary.tsx            — pre-loaded query catalog
Create: site/src/db/
  Create: engine.ts                   — DuckDB-WASM initialization + ATTACH
  Create: journal.ts                  — exploration journal (IndexedDB-backed)
  Create: queries.ts                  — pre-built query catalog
Create: site/public/
  Create: base.db                     — stripped landscape database (~2MB)
Create: scripts/export-base-db.ts     — strips raw tables + FTS indexes for web
Create: .github/workflows/deploy-site.yml — GitHub Action: collect → build → deploy
```

**Note:** This workstream is fully contained in `site/` and `scripts/export-base-db.ts`. Zero overlap with WS-2.

### Task 3.1: Scaffold the site

- [ ] **Step 1: Initialize Preact + Vite project**

```bash
mkdir -p site
cd site
npm init -y
npm install preact @preact/signals
npm install -D vite @preact/preset-vite typescript
```

- [ ] **Step 2: Create vite.config.ts, tsconfig.json, index.html**
- [ ] **Step 3: Create minimal app.tsx that renders "Supply Chain Security Explorer"**
- [ ] **Step 4: Verify `npm run dev` serves the page**
- [ ] **Step 5: Commit**

### Task 3.2: Integrate DuckDB-WASM

- [ ] **Step 1: Install @duckdb/duckdb-wasm**
- [ ] **Step 2: Create site/src/db/engine.ts**

Initialize DuckDB-WASM, load `base.db` from the static assets, ATTACH as read-only. Create `:memory:` database for scratch work.

- [ ] **Step 3: Create a simple query runner that returns results as JSON**
- [ ] **Step 4: Verify: run `SELECT 1` in browser console**
- [ ] **Step 5: Commit**

### Task 3.3: Build the export script

**Files:**
- Create: `scripts/export-base-db.ts`

- [ ] **Step 1: Write the export script**

Opens the full landscape database, creates a new database with:
- All `base_*` tables EXCEPT `base_workflows.content` (too large)
- All `agg_*` tables
- No `raw_*` tables
- No FTS indexes (they bloat the file)
- VACUUM to minimize size

Target: < 5MB for the exported `base.db`.

- [ ] **Step 2: Add npm script**

```json
"export:site-db": "ts-node scripts/export-base-db.ts"
```

- [ ] **Step 3: Run it and verify size**

```bash
npm run export:site-db -- --database output/cncf-full-landscape/current/database.db --output site/public/base.db
ls -lh site/public/base.db
```

- [ ] **Step 4: Commit**

### Task 3.4: Query editor component

- [ ] **Step 1: Install Monaco editor**
- [ ] **Step 2: Create QueryEditor.tsx with SQL syntax highlighting**
- [ ] **Step 3: Wire to DuckDB-WASM engine — type SQL, press Ctrl+Enter, see results**
- [ ] **Step 4: Commit**

### Task 3.5: Result rendering

- [ ] **Step 1: Install AG Grid Community for tables**
- [ ] **Step 2: Create ResultTable.tsx**
- [ ] **Step 3: Install Observable Plot for charts**
- [ ] **Step 4: Create ResultChart.tsx with auto-detection (if result has 2 columns with one numeric → bar chart)**
- [ ] **Step 5: Commit**

### Task 3.6: Query library and findings overview

- [ ] **Step 1: Create queries.ts with pre-built query catalog**

```typescript
export const queryLibrary = [
  {
    id: 'headline',
    name: 'Headline Numbers',
    description: 'Executive summary across all CNCF projects',
    sql: 'SELECT * FROM agg_executive_summary',
    category: 'overview'
  },
  {
    id: 'signing-leaders',
    name: 'Signing Leaders',
    description: 'Top projects by signature artifact count',
    sql: `SELECT nameWithOwner, signature_artifact_count, sbom_artifact_count
          FROM agg_repo_summary WHERE signature_artifact_count > 0
          ORDER BY signature_artifact_count DESC LIMIT 20`,
    category: 'findings'
  },
  // ... 10-15 more queries covering all key findings
];
```

- [ ] **Step 2: Create QueryLibrary.tsx — clickable list that loads queries into editor**
- [ ] **Step 3: Create FindingsOverview.tsx — landing page with headline stats loaded from DuckDB**
- [ ] **Step 4: Commit**

### Task 3.7: Exploration journal

- [ ] **Step 1: Create journal.ts**

Uses IndexedDB (via idb library) to persist:
- Every query run (SQL, timestamp, result row count)
- User annotations (optional notes on findings)
- Parent-child linking (follow-up queries)

- [ ] **Step 2: Create JournalPanel.tsx — sidebar showing exploration history**
- [ ] **Step 3: Add export-as-markdown function**
- [ ] **Step 4: Commit**

### Task 3.8: GitHub Pages deployment

- [ ] **Step 1: Create `.github/workflows/deploy-site.yml`**

```yaml
name: Deploy Explorer
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: [site/**]
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd site && npm ci && npm run build
      - uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Add `site/` build script to package.json**
- [ ] **Step 3: Commit and verify GitHub Pages deployment**

---

## WS-4: Presentation Finalization

**Goal:** Finalize all local-only presentation artifacts. NOT committed to git.

**Location:** Local files in `docs/` (gitignored)

This workstream is human-driven with agent support. No code changes.

### Task 4.1: Review and finalize the findings report

- [ ] **Step 1: Review `docs/cncf-supply-chain-findings.md`** (rewritten by Epistemic Editor)
- [ ] **Step 2: Cross-reference with `docs/known-gaps-analysis.md`** — ensure key gaps are mentioned
- [ ] **Step 3: Verify all numbers against the database**

### Task 4.2: Review and finalize the slide deck

- [ ] **Step 1: Open `docs/cncf-supply-chain-security.pptx`**
- [ ] **Step 2: Update slide 2 numbers to match reframed findings**
- [ ] **Step 3: Add visibility-window caveat to slides showing percentages**
- [ ] **Step 4: Review speaker notes for landmine avoidance**

### Task 4.3: Review SVG diagrams

- [ ] **Step 1: Open all `docs/diagrams/*.svg` and `docs/findings-*.svg`**
- [ ] **Step 2: Verify chart labels say "observed" not absolute claims**
- [ ] **Step 3: Regenerate any charts that need updated framing**

### Task 4.4: Rehearsal prep

- [ ] **Step 1: Prepare 3 live DuckDB queries for demo**
- [ ] **Step 2: Test `npm test` runs clean in < 60 seconds**
- [ ] **Step 3: Test `npm run report` generates output from demo database**
- [ ] **Step 4: Prepare answers for Kubernetes/Prow, OCI signing, and CLOMonitor questions**

---

## Execution Order

```
Day 0 (now):
  └── WS-1: Merge spring-cleaning (30 min)

Day 1 (tomorrow — presentation day):
  ├── WS-4: Finalize presentation (morning, 2 hours)
  ├── WS-2: Start org scanning feature (parallel, agent-driven)
  └── WS-3: Start exploration platform scaffold (parallel, agent-driven)

Day 2-3:
  ├── WS-2: Complete org scanning, run full landscape with --scan-orgs
  └── WS-3: Complete exploration platform, deploy to GitHub Pages

Day 4:
  └── Integration: Run org-scanned data through exploration platform
```

## Key Constraints

1. **WS-2 and WS-3 MUST NOT touch the same files.** WS-2 is `src/` + `sql/`. WS-3 is `site/` + `.github/workflows/`.
2. **WS-4 files are NEVER committed.** They stay local, gitignored.
3. **The database schema is the contract.** WS-2 adds tables. WS-3 reads tables. Neither modifies existing tables. Join key between `base_org_repos` and `base_repositories` is `nameWithOwner` (VARCHAR).
4. **Org scanning is additive.** The existing `--analyze` pipeline continues to work without `--scan-orgs`. The new flag adds org data alongside existing data.
5. **Multi-org projects:** Extract ALL unique org names from `repos[]` array across all projects. Deduplicate orgs that appear in multiple projects. Scan every unique org found — not just the one from `repo_url`. For Phase 2 (workflow fetching), skip repos already present in `base_repositories` (they already have workflow data).
6. **DuckDB version pinning:** `@duckdb/duckdb-wasm` and `@duckdb/node-api` must use the same DuckDB storage format version. Check DuckDB version in both packages before integrating. If versions diverge, WS-3 should import Parquet files instead of loading `.db` directly (Parquet is format-stable).
7. **Spring cleaning merge:** Use `git merge --no-ff spring-cleaning` (not fast-forward) in case main has advanced. If conflicts exist, rebase spring-cleaning onto main first.
8. **Fallback UX:** If Monaco Editor integration proves difficult in WS-3, fall back to `<textarea>` with Prism.js syntax highlighting. If AG Grid proves difficult, fall back to plain HTML tables with CSS sorting.
