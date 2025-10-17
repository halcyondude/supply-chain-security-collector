# Project Metadata Enhancement Plan (Updated)

**Goal:** Transform the data collection architecture from repo-centric to project-centric, enriching our database with CNCF landscape metadata to enable better SBOM discovery and supply chain analysis.

**Core Principles:**
1. **Universal Tool:** Must work on ANY GitHub repos (CNCF or not)
2. **Simple Format Forever:** Backward compatible `{"owner":"x","name":"y"}` format
3. **Early Normalization:** Convert to unified format immediately, single code path downstream
4. **CNCF Metadata Isolated:** Separate `base_cncf_*` tables for CNCF-specific enrichment
5. **Schema Versioning:** Track landscape schema changes via committed schema file

---

## Input Format: JSON Arrays

**Decision:** JSON arrays (not JSONL) for better human readability and git diffs.

### Full CNCF Project Format

```json
[
  {
    "project_name": "Kubernetes",
    "display_name": "Kubernetes",
    "maturity": "graduated",
    "category": "Orchestration & Management",
    "subcategory": "Scheduling & Orchestration",
    "repos": [
      {"owner": "kubernetes", "name": "kubernetes", "primary": true}
    ],
    "date_accepted": "2016-03-10",
    "date_graduated": "2018-03-06",
    "package_manager_url": null,
    "docker_url": null,
    "summary_integrations": "Calico, Flannel, Containerd, CRI-O",
    "summary_tags": "orchestration, containers, cloud-native",
    "dev_stats_url": "https://k8s.devstats.cncf.io/",
    "clomonitor_name": "kubernetes",
    "has_security_audits": true
  }
]
```

### Minimal Format (Backward Compatible)

```json
[
  {
    "project_name": "Example Project",
    "repos": [
      {"owner": "example-org", "name": "example-repo", "primary": true}
    ]
  }
]
```

**Auto-Normalization:** Simple format expanded to full format with nulls.

---

## Generated Input Files

**Script:** `scripts/fetch-cncf-landscape.ts` generates 4 files (all committed to git):

### 1. `input/cncf-full-landscape.json`
- Complete CNCF landscape with all metadata fields
- All projects (graduated, incubating, sandbox)
- Primary + additional repos for each project
- **Committed:** Track landscape evolution via git diffs

### 2. `input/minimal-example.json`
- Documentation/example of minimal format
- Only required fields: `project_name` and `repos[]`
- Shows what's needed for non-CNCF repos

### 3. `input/test-single-project.json`
- One full project with all fields populated
- Quick testing without full landscape
- **Configurable project** (default: Kubernetes)

### 4. `input/test-three-projects.json`
- Three full projects with all fields
- Covers different maturity levels
- **Configurable projects** (default: Kubernetes, Harbor, Bank Vaults)

**Test Project Configuration:**
```typescript
// At top of fetch-cncf-landscape.ts - easy to change
const TEST_PROJECTS = {
  single: 'Kubernetes',      // Graduated, well-known
  triple: [
    'Kubernetes',            // Graduated
    'Harbor',                // Graduated
    'Bank Vaults'            // Sandbox, multi-repo
  ]
};
```

---

## Schema & File Management Strategy

### What Gets Downloaded (Every Script Run)
- ✅ `landscape.yml` → `scripts/landscape.yml` (NOT committed)
- ✅ `landscape-schema.json` → `scripts/landscape-schema.json` (committed)

### What Gets Generated (Every Script Run)
- ✅ `input/cncf-full-landscape.json` (committed - track changes)
- ✅ `input/minimal-example.json` (committed - documentation)
- ✅ `input/test-single-project.json` (committed - convenience)
- ✅ `input/test-three-projects.json` (committed - convenience)

### Schema Change Detection
```typescript
// In fetch-cncf-landscape.ts
async function checkSchemaChanges() {
  const committedSchema = JSON.parse(fs.readFileSync('landscape-schema.json'));
  const downloadedSchema = await downloadSchema();
  
  if (!deepEqual(committedSchema, downloadedSchema)) {
    console.warn('⚠️  Landscape schema has changed!');
    console.warn('   Review changes and update if needed.');
    // Show diff, optionally fail build
  }
}
```

### .gitignore Updates
```gitignore
# Downloaded landscape.yml (1MB+, changes frequently)
scripts/landscape.yml

# Keep these committed:
# scripts/landscape-schema.json     (schema change detection)
# input/cncf-full-landscape.json    (track dataset changes)
# input/test-*.json                 (testing convenience)
# input/minimal-*.json              (documentation)
```

**Rationale:**
- Clone and run immediately (all input files present)
- Track CNCF landscape evolution (git diffs)
- Detect breaking schema changes early
- Manual control over regeneration

---

## CLI Flags

### `--maturity <levels>` (comma-delimited, optional)

Filter CNCF projects by maturity level.

```bash
# Graduated only
npm start -- --input input/cncf-full-landscape.json --maturity graduated

# Graduated + incubating
npm start -- --input input/cncf-full-landscape.json --maturity graduated,incubating

# Sandbox only  
npm start -- --input input/cncf-full-landscape.json --maturity sandbox

# All levels (default)
npm start -- --input input/cncf-full-landscape.json
```

### `--repo-scope <primary|all>` (default: `primary`)

Control which repos to process per project.

```bash
# Primary repos only (default, faster)
npm start -- --input input/cncf-full-landscape.json

# All repos (primary + additional, complete analysis)
npm start -- --input input/cncf-full-landscape.json --repo-scope all

# Combine filters
npm start -- --input input/cncf-full-landscape.json \
  --maturity graduated \
  --repo-scope all
```

**Implementation:**
```typescript
// In neo.ts
program
  .option('--maturity <levels>', 'Filter by maturity (graduated,incubating,sandbox)')
  .option('--repo-scope <scope>', 'Repo scope: primary (default) or all', 'primary');

const { maturity, repoScope } = program.opts();

// Filter by maturity
let projects = JSON.parse(inputContent);
if (maturity) {
  const levels = maturity.split(',');
  projects = projects.filter(p => !p.maturity || levels.includes(p.maturity));
}

// Filter repos by scope
const repositories = projects.flatMap(project => {
  let repos = project.repos;
  if (repoScope === 'primary') {
    repos = repos.filter(r => r.primary);
  }
  return repos.map(repo => ({
    ...repo,
    project_name: project.project_name,
    maturity: project.maturity
  }));
});
```

---

## Complete Data Model

### TypeScript Interfaces

```typescript
export interface RepositoryRef {
  owner: string;
  name: string;
  primary: boolean;
  branch?: string;  // Optional override from landscape
}

export interface ProjectMetadata {
  // Identity (required)
  project_name: string;
  repos: RepositoryRef[];  // At least one required
  
  // Identity (optional)
  display_name?: string;
  description?: string;
  
  // CNCF Maturity (optional)
  maturity?: 'graduated' | 'incubating' | 'sandbox' | 'archived';
  
  // Categorization (optional)
  category?: string;
  subcategory?: string;
  
  // Lifecycle Dates (optional)
  date_accepted?: string;       // ISO: YYYY-MM-DD
  date_incubating?: string;
  date_graduated?: string;
  date_archived?: string;
  
  // URLs - Discovery & Documentation (optional)
  homepage_url?: string;
  repo_url?: string;
  package_manager_url?: string;  // CRITICAL for SBOM discovery
  docker_url?: string;           // CRITICAL for SBOM discovery
  documentation_url?: string;
  blog_url?: string;
  
  // OpenSSF & Compliance (optional)
  url_for_bestpractices?: string;
  clomonitor_name?: string;
  
  // Summary Fields (optional)
  summary_business_use_case?: string;
  summary_integrations?: string;  // May indicate SBOM tooling
  summary_personas?: string;
  summary_tags?: string;          // Keywords (security, supply-chain)
  summary_use_case?: string;
  summary_release_rate?: string;
  
  // Activity Metrics (optional)
  dev_stats_url?: string;
  
  // Security & Audits (optional, summarized)
  has_security_audits?: boolean;
  security_audit_count?: number;
  latest_audit_date?: string;
  latest_audit_vendor?: string;
  
  // Organization Context (optional)
  crunchbase?: string;
  twitter?: string;
  
  // Project Relationships (optional)
  parent_project?: string;
  
  // TAG Associations (optional)
  tag_associations?: string;  // Comma-separated
  
  // Annual Review (optional)
  annual_review_date?: string;
  annual_review_url?: string;
  
  // Overrides (optional)
  license?: string;
  default_branch?: string;
}
```

### Database Schema

**Universal Repository Table** (works for CNCF and non-CNCF):
```sql
CREATE TABLE base_repositories (
  id VARCHAR PRIMARY KEY,
  name VARCHAR,
  nameWithOwner VARCHAR,
  owner VARCHAR,           -- Derived: owner part of nameWithOwner
  repo_name VARCHAR,       -- Derived: repo part of nameWithOwner
  url VARCHAR,
  description TEXT,
  hasVulnerabilityAlertsEnabled BOOLEAN,
  license_key VARCHAR,
  license_name VARCHAR,
  license_spdxId VARCHAR,
  defaultBranch_name VARCHAR
);
```

**CNCF Project Metadata** (only populated for CNCF projects):
```sql
CREATE TABLE base_cncf_projects (
  -- Identity
  project_name VARCHAR PRIMARY KEY,
  display_name VARCHAR,
  description TEXT,
  
  -- Maturity & Status
  maturity VARCHAR CHECK (maturity IN ('graduated', 'incubating', 'sandbox', 'archived')),
  
  -- Categorization
  category VARCHAR,
  subcategory VARCHAR,
  
  -- Lifecycle Dates (clear names)
  date_accepted DATE,
  date_incubating DATE,
  date_graduated DATE,
  date_archived DATE,
  
  -- URLs - Discovery & Documentation
  homepage_url VARCHAR,
  repo_url VARCHAR,
  package_manager_url VARCHAR,  -- CRITICAL
  docker_url VARCHAR,           -- CRITICAL
  documentation_url VARCHAR,
  blog_url VARCHAR,
  
  -- OpenSSF & Compliance
  url_for_bestpractices VARCHAR,
  clomonitor_name VARCHAR,
  
  -- Summary Fields
  summary_business_use_case TEXT,
  summary_integrations TEXT,
  summary_personas TEXT,
  summary_tags TEXT,
  summary_use_case TEXT,
  summary_release_rate TEXT,
  
  -- Activity
  dev_stats_url VARCHAR,
  
  -- Security & Audits (summarized)
  has_security_audits BOOLEAN,
  security_audit_count INTEGER,
  latest_audit_date DATE,
  latest_audit_vendor VARCHAR,
  
  -- Organization
  crunchbase VARCHAR,
  twitter VARCHAR,
  
  -- Relationships
  parent_project VARCHAR,
  tag_associations TEXT,
  
  -- Annual Review
  annual_review_date DATE,
  annual_review_url VARCHAR,
  
  -- Overrides
  license VARCHAR,
  default_branch VARCHAR,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Junction Table** (many-to-many: projects ↔ repos):
```sql
CREATE TABLE base_cncf_project_repos (
  project_name VARCHAR REFERENCES base_cncf_projects(project_name),
  repository_id VARCHAR REFERENCES base_repositories(id),
  is_primary BOOLEAN,
  PRIMARY KEY (project_name, repository_id)
);
```

---

## Implementation Phases

### Phase 1: Schema & File Management
- ✅ Update .gitignore (exclude landscape.yml)
- ✅ Commit landscape-schema.json to git
- ✅ Update fetch-cncf-landscape.ts:
  - Download landscape.yml and schema
  - Schema change detection
  - Generate 4 input files (JSON arrays)
  - Configurable test project selection

### Phase 2: Input Normalization
- ✅ Update neo.ts to normalize both formats immediately
- ✅ Add --maturity and --repo-scope CLI flags
- ✅ Single code path after normalization

### Phase 3: Data Model Updates
- ✅ Add ProjectMetadata interface with all fields
- ✅ Update normalizers to generate CNCF tables
- ✅ Keep base_repositories universal

### Phase 4: Database Schema
- ✅ Create base_cncf_projects table
- ✅ Create base_cncf_project_repos junction table
- ✅ Add owner/repo_name derived columns to base_repositories

### Phase 5: Analysis Queries
- ✅ Core queries work on base_repositories (universal)
- ✅ CNCF-specific queries join with CNCF tables
- ✅ Category/subcategory analysis
- ✅ Maturity-level comparisons

### Phase 6: Documentation
- ✅ Document both input formats
- ✅ Document CLI flags
- ✅ Update query examples
- ✅ SBOM discovery strategy

---

## Success Criteria

1. ✅ Script generates 4 input files (all committed)
2. ✅ Script downloads schema and landscape.yml every run
3. ✅ Schema change detection works
4. ✅ landscape.yml NOT committed (in .gitignore)
5. ✅ JSON array format (not JSONL)
6. ✅ Test project selection configurable
7. ✅ CLI --maturity flag (comma-delimited)
8. ✅ CLI --repo-scope flag (primary|all)
9. ✅ Simple format still works (auto-normalized)
10. ✅ Single code path after normalization
11. ✅ base_cncf_* tables for CNCF metadata only
12. ✅ base_repositories universal (CNCF + non-CNCF)
13. ✅ All existing functionality preserved
14. ✅ Clone and run immediately
15. ✅ Category/subcategory analysis enabled

---

## Key Benefits

### SBOM Discovery
- Package manager URLs → find published artifacts
- Docker URLs → find container images
- Integration info → identify SBOM tooling (Cosign, Sigstore, Syft)
- Security audits → indicator of mature practices

### Analysis Capabilities
- Maturity segmentation (sandbox vs graduated)
- Category analysis (Security vs Orchestration)
- Temporal analysis (track adoption over time)
- Complete project coverage (all repos)

### Tool Flexibility
- Works on ANY GitHub repos
- CNCF enrichment optional
- Easy testing (minimal format)
- Fast testing (primary repos only)
- Complete analysis (all repos)

---

**Next Steps:**

1. Update .gitignore
2. Commit landscape-schema.json
3. Create minimal-example.json
4. Update fetch-cncf-landscape.ts (comprehensive rewrite)
5. Add CLI flags to neo.ts
6. Test with all 4 input files

**Ready to proceed?**
