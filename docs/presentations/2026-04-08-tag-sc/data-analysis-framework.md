# Data Analysis Framework: CNCF Supply Chain Security

## Preamble: The Partial Observation Problem

This dataset observes 236 CNCF projects through a single lens: GitHub. We see release assets, workflow files, and repository metadata. We do **not** see:

- Container registry signatures (cosign signs images, not release assets)
- OCI-attached SBOMs (stored in registries, not GitHub releases)
- Private CI/CD pipelines (Jenkins, GitLab CI, Tekton, etc.)
- Manual processes or organizational policies
- Third-party distribution channels (package managers, Helm repos)

Every statistic below must be read with this constraint. "No observable evidence" is not "does not exist."

---

## Deliverable 1: Reframed Metrics

### 1.1 SBOM Adoption — Reframed

**Naive claim:** "16.1% of CNCF projects have SBOMs" (38/236 repos with SBOM artifacts in releases).

**Reframed:**

| Observation | Repos | % of 236 |
|---|---|---|
| SBOM artifacts observable in GitHub release assets | 38 | 16.1% |
| SBOM-generating tools detected in CI workflows (syft, trivy, spdx-sbom-generator, cdxgen, tern) | 31 | 13.1% |
| **Gap: SBOM generator in CI but NO SBOM in releases** | **25** | **10.6%** |
| SBOM in releases with no visible generator in CI | 32 | 13.6% |

**What this means:** 25 repos (10.6%) are generating SBOMs in CI but not distributing them via GitHub releases. These projects likely attach SBOMs to container images in registries (OCI artifacts), publish them through package managers, or generate them only for internal consumption. The 32 repos with SBOM artifacts but no visible generator suggest either: (a) SBOMs are produced outside GitHub Actions (local builds, other CI), or (b) the generator tool was not detected by our workflow scanner.

**Corrected framing:** "At least 16.1% distribute SBOMs via GitHub releases. An additional 10.6% have SBOM generation tooling in CI but distribute through other channels. True SBOM adoption is likely between 16% and 27%."

### 1.2 Signing Adoption — Reframed

**Naive claim:** "15.3% of repos have signatures" (36/236 repos with signature artifacts).

**Reframed:**

| Observation | Repos | % of 236 |
|---|---|---|
| Signature artifacts in GitHub release assets | 36 | 15.3% |
| Signing tools detected in CI workflows (cosign, sigstore, slsa-github-generator) | 14 | 5.9% |
| **Gap: Signing tool in CI but NO signature in releases** | **12** | **5.1%** |
| Signatures in releases with no visible signer in CI | 34 | 14.4% |

**What this means:** The signing gap is even more revealing than the SBOM gap. 12 repos use signing tools (primarily cosign and slsa-github-generator) but produce no signature artifacts in GitHub releases. This is expected behavior: cosign's primary use case is signing container images in registries, not producing downloadable `.sig` files. The 34 repos with signatures but no detected signing workflow likely use GPG signing (not detected by our tool scanner), sign during release automation outside GitHub Actions, or use GoReleaser's built-in signing (GoReleaser is detected separately as a build tool, not a signer).

**Corrected framing:** "At least 15.3% distribute signatures via GitHub releases. An additional 5.1% have signing infrastructure in CI that targets non-GitHub distribution channels (primarily container registries). The true signing rate is likely between 15% and 20%."

### 1.3 Evidence Tier Distribution

Projects and repos classified by the **strongest** observable evidence of supply chain security practice:

**By repository (n=236):**

| Tier | Description | Repos | % |
|---|---|---|---|
| **Tier 1** | Artifacts in releases (SBOMs, signatures, attestations, provenance) | 67 | 28.4% |
| **Tier 2** | Security tools in CI workflows only (no distributable artifacts observed) | 77 | 32.6% |
| **Tier 3** | No observable evidence via GitHub | 92 | 39.0% |

**By CNCF project (n=236):**

| Tier | Description | Projects | % |
|---|---|---|---|
| **Tier 1** | At least one repo produces distributable artifacts | 63 | 26.7% |
| **Tier 2** | At least one repo has CI security tools but no distributable artifacts | 57 | 24.2% |
| **Tier 3** | No observable evidence via GitHub in any repo | 116 | 49.2% |

**Key insight:** Nearly half of all CNCF projects show zero observable supply chain security evidence through GitHub. But Tier 2 is the analytically interesting group: 57 projects (24.2%) have adopted security tooling but either (a) haven't completed the distribution step, (b) distribute through non-GitHub channels, or (c) use the tools for scanning/auditing rather than artifact production.

### 1.4 Maturity-Level Breakdown

| Maturity | Projects | With SBOM Artifact | With Sig Artifact | SBOM % | Sig % |
|---|---|---|---|---|---|
| Graduated | 34 | 5 | 7 | 14.7% | 20.6% |
| Incubating | 36 | 10 | 11 | 27.8% | 30.6% |
| Sandbox | 142 | 20 | 13 | 14.1% | 9.2% |
| Archived | 24 | 1 | 2 | 4.2% | 8.3% |

**Counterintuitive finding:** Incubating projects outperform graduated projects on both SBOM and signature adoption. Hypotheses:

1. **Cohort effect:** Incubating projects are newer and entered CNCF during a period of heightened supply chain security awareness (post-SolarWinds, post-Log4Shell, post-EO 14028).
2. **Graduation inertia:** Graduated projects established their release processes years ago and have not retrofitted supply chain artifacts.
3. **Selection bias:** Projects that invest in supply chain security may be in the middle of their CNCF journey (building maturity), while graduated projects have "arrived" and face less pressure.

### 1.5 Workflow Activity Correlation

Does more CI/CD activity predict better supply chain security?

| Workflow Count | Repos | % with SBOM | % with Signatures | % with Any SC Tool |
|---|---|---|---|---|
| 0 workflows | 11 | 9.1% | 9.1% | 0.0% |
| 1-5 workflows | 62 | 8.1% | 16.1% | 1.6% |
| 6-15 workflows | 104 | 16.3% | 12.5% | 14.4% |
| 16-30 workflows | 46 | 28.3% | 19.6% | 30.4% |
| 31+ workflows | 13 | 15.4% | 23.1% | 46.2% |

**Pattern:** There is a positive correlation between workflow count and supply chain tool adoption. Repos with 16-30 workflows are ~3.5x more likely to have SBOM artifacts than repos with 1-5. The 31+ bucket shows the highest signing and tool adoption rates (46.2% have at least one supply chain tool), though the SBOM artifact rate dips — possibly because very-large-workflow repos are complex enough to distribute SBOMs through non-GitHub channels.

**Statistical caveat:** The 0-workflow and 31+ buckets have small sample sizes (n=11 and n=13 respectively). Draw conclusions from the middle buckets.

### 1.6 The Full Pipeline

How many projects have a complete, verifiable supply chain?

| Pipeline Stage | Repos | % |
|---|---|---|
| Has any artifact (SBOM or signature) | 60 | 25.4% |
| Has both SBOM AND signature | 14 | 5.9% |
| Has SBOM + signature + provenance/attestation | 6 | 2.5% |

**Only 6 out of 236 repos (2.5%)** have the complete observable pipeline: SBOM for transparency, signatures for integrity, and provenance/attestation for build verification. This is the "gold standard" and it remains rare even among CNCF projects.

---

## Deliverable 2: Graph Analysis Showcase

The existing LadybugDB schema models seven node types (`Repository`, `Release`, `ReleaseAsset`, `Workflow`, `CNCFProject`, `Tool`, `ToolCategory`) connected by six relationship types (`HAS_RELEASE`, `HAS_ASSET`, `HAS_WORKFLOW`, `BELONGS_TO`, `USES_TOOL`, `IN_CATEGORY`).

The following three queries demonstrate what graph traversal reveals that flat SQL counting cannot.

### 2.1 Tool Co-occurrence Graph — "Tool Stacks"

**Question:** Which security tools appear together? Are there emergent "stacks" that projects adopt as a unit?

```cypher
// Tool co-occurrence weighted by shared repos (not workflows)
// Group by the REPOSITORY that owns the workflow, not the workflow itself,
// to find tools that a project intentionally combines
MATCH (r:Repository)-[:HAS_WORKFLOW]->(w1:Workflow)-[:USES_TOOL]->(t1:Tool),
      (r)-[:HAS_WORKFLOW]->(w2:Workflow)-[:USES_TOOL]->(t2:Tool)
WHERE t1.tool_name < t2.tool_name
WITH t1.tool_name AS tool_a, t2.tool_name AS tool_b,
     count(DISTINCT r) AS shared_repos
WHERE shared_repos >= 3
RETURN tool_a, tool_b, shared_repos
ORDER BY shared_repos DESC
```

**What it reveals that SQL cannot:**

SQL can compute pairwise co-occurrence (we did this above: codeql+trivy appears in 12 repos). But the graph enables multi-hop community detection. By projecting the tool co-occurrence results as a weighted graph (tools as nodes, shared-repo counts as edge weights), you can run community detection algorithms (Louvain, Label Propagation) to find **tool clusters** — groups of tools that travel together.

From the SQL co-occurrence data, the emerging clusters are:

- **The CNCF-native stack:** slsa-github-generator + spdx-sbom-generator (8 repos) — projects that adopt the CNCF-recommended SLSA + SPDX pairing
- **The scanning stack:** codeql + trivy + docker-scout (12 repos each for codeql pairs) — vulnerability scanning as an entry point
- **The release stack:** codeql + goreleaser (9 repos) — Go projects with security-conscious release automation

**Visualization:** Force-directed graph. Nodes = tools, sized by repo count. Edges = co-occurrence, weighted by shared repos. Color nodes by tool category. Clusters emerge visually without requiring the viewer to interpret a table.

### 2.2 Maturity-Practice Bipartite Graph

**Question:** Which supply chain practices cluster by CNCF maturity level? Do graduated projects use different tools than sandbox projects?

```cypher
// Bipartite projection: maturity levels <-> tool categories
// with edge weight = number of distinct repos
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)
      -[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool)
      -[:IN_CATEGORY]->(tc:ToolCategory)
WHERE p.maturity IN ['graduated', 'incubating', 'sandbox']
WITH p.maturity AS maturity, tc.category_name AS practice,
     count(DISTINCT r) AS adoption_count,
     count(DISTINCT p) AS project_count
RETURN maturity, practice, adoption_count, project_count
ORDER BY maturity, adoption_count DESC
```

**What it reveals that SQL cannot:**

The bipartite structure (maturity -- practice) allows projection into a **maturity similarity graph**. If two maturity levels share the same practice profile, they cluster together; if one has a distinctly different profile, it stands apart. This is fundamentally a graph comparison — are the neighborhoods of "graduated" and "incubating" isomorphic?

From our SQL data, we already know incubating outperforms graduated. The graph query exposes **which practices** drive that gap. It can also answer: "If a sandbox project adopts codeql + trivy, which maturity level's practice profile does it most resemble?" — a nearest-neighbor query on the bipartite graph.

Additionally, by traversing from maturity -> project -> repo -> workflow -> tool, the graph naturally handles the multi-repo problem: a graduated project with 15 repos might have signing in 2 of them. SQL requires GROUP BY gymnastics; the graph traversal returns this as a natural path count.

**Visualization:** Sankey diagram. Left column = maturity levels (3 bands). Right column = tool categories (6-7 bands). Flow width = adoption count. This immediately shows which practices are "universal" (wide flows from all maturity levels) vs "mature-only" (narrow flows from graduated/incubating, absent from sandbox).

### 2.3 The Full Pipeline Path Query — Complete vs Broken Chains

**Question:** For each project, trace the full supply chain path: Project -> Repo -> Release -> Asset (SBOM + Signature). Which projects have complete paths vs broken paths?

```cypher
// Find projects with complete supply chain evidence chains
// A "complete path" = at least one repo where a single release
// has BOTH an SBOM asset AND a signature asset
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)
      -[:HAS_RELEASE]->(rel:Release)-[:HAS_ASSET]->(sbom:ReleaseAsset)
WHERE sbom.name =~ '(?i).*(sbom|spdx|cyclonedx|bom).*'
OPTIONAL MATCH (rel)-[:HAS_ASSET]->(sig:ReleaseAsset)
WHERE sig.name =~ '(?i).*(sig|asc|sign|cosign|pem|cert).*'
WITH p, r, rel,
     count(DISTINCT sbom) AS sbom_count,
     count(DISTINCT sig) AS sig_count
RETURN p.display_name AS project,
       p.maturity AS maturity,
       r.nameWithOwner AS repo,
       count(DISTINCT rel) AS releases_checked,
       sum(CASE WHEN sbom_count > 0 AND sig_count > 0 THEN 1 ELSE 0 END) AS complete_releases,
       sum(CASE WHEN sbom_count > 0 AND sig_count = 0 THEN 1 ELSE 0 END) AS sbom_only_releases,
       sum(CASE WHEN sbom_count > 0 THEN 1 ELSE 0 END) AS any_sbom_releases
ORDER BY complete_releases DESC, any_sbom_releases DESC
```

**What it reveals that SQL cannot:**

This is a **path completeness** query. In SQL, you would need to join base_releases to base_release_assets, filter by asset name patterns, self-join to check for co-occurrence of SBOM and signature assets in the same release, then aggregate up through project_repos to project. It is doable but brittle — each new "path segment" requires another join.

In the graph, this is a natural traversal: walk the path from CNCFProject down to ReleaseAsset and check what you find at the leaf nodes. The graph makes the **structure of the question** match the **structure of the data**.

More powerfully, the graph can answer questions that are impractical in SQL:

- "For projects with broken paths (SBOM but no signature), does any *other* repo in the same project have signing tools?" — a lateral traversal that in SQL requires a correlated subquery with a different join path.
- "Which projects have tools in CI that could complete their broken pipeline?" — traverse from the broken-path repo back up to the project, sideways to sibling repos, down into their workflows, and check for signing tools.

```cypher
// Follow-up: projects that COULD complete their pipeline
// (have SBOM artifacts but signing tools exist in sibling repos)
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r1:Repository)
      -[:HAS_RELEASE]->(:Release)-[:HAS_ASSET]->(a:ReleaseAsset)
WHERE a.name =~ '(?i).*(sbom|spdx|cyclonedx).*'
AND NOT EXISTS {
    MATCH (r1)-[:HAS_RELEASE]->(:Release)-[:HAS_ASSET]->(sig:ReleaseAsset)
    WHERE sig.name =~ '(?i).*(sig|asc|sign).*'
}
WITH p, r1
MATCH (p)<-[:BELONGS_TO]-(r2:Repository)-[:HAS_WORKFLOW]->(:Workflow)
      -[:USES_TOOL]->(t:Tool)-[:IN_CATEGORY]->(:ToolCategory {category_name: 'signer'})
WHERE r1 <> r2
RETURN p.display_name AS project,
       r1.nameWithOwner AS repo_with_sbom_no_sig,
       r2.nameWithOwner AS sibling_repo_with_signer,
       collect(DISTINCT t.tool_name) AS available_signers
```

**Visualization:** Node-link diagram with hierarchical layout:
- Top row: CNCFProject nodes (colored by maturity)
- Second row: Repository nodes (connected down from projects)
- Third row: Release nodes (sampled, most recent per repo)
- Bottom row: ReleaseAsset nodes (colored: green=SBOM, blue=signature, red=missing)

Complete paths glow green end-to-end. Broken paths show where the chain breaks. This is a visual "supply chain health dashboard" that no table can replicate.

---

## Deliverable 3: Exploration Scratchpad Schema

### 3.1 Core Schema

```sql
-- ============================================================
-- Exploration Journal: A structured query notebook for DuckDB
-- ============================================================

-- Main journal: one row per question asked
CREATE TABLE exploration_journal (
    id              INTEGER PRIMARY KEY,
    created_at      TIMESTAMP DEFAULT current_timestamp,
    updated_at      TIMESTAMP DEFAULT current_timestamp,

    -- The question
    question        TEXT NOT NULL,          -- natural language question
    hypothesis      TEXT,                   -- what you expected to find (before running)

    -- The query
    query_sql       TEXT,                   -- the SQL that was run
    query_engine    TEXT DEFAULT 'duckdb',  -- 'duckdb' or 'ladybugdb'
    query_cypher    TEXT,                   -- if query_engine = 'ladybugdb'
    execution_ms    INTEGER,               -- how long it took
    row_count       INTEGER,               -- rows returned

    -- The finding
    result_summary  TEXT,                   -- brief: what was found
    narrative       TEXT,                   -- longer: what it means, with caveats
    surprise_flag   BOOLEAN DEFAULT false,  -- did this contradict the hypothesis?

    -- Classification
    finding_type    TEXT CHECK (finding_type IN (
                        'observation',      -- a fact derived from data
                        'gap',              -- something expected but missing
                        'pattern',          -- a recurring structure across data
                        'hypothesis',       -- a testable claim, not yet confirmed
                        'methodology'       -- a note about how to query, not what was found
                    )),
    confidence      TEXT CHECK (confidence IN (
                        'confirmed',        -- multiple lines of evidence converge
                        'partial',          -- supported by data but with caveats
                        'speculative',      -- plausible interpretation, needs more evidence
                        'refuted'           -- tested and found wrong (keep for audit trail)
                    )),
    observation_caveat TEXT,               -- what the partial-observation window cannot see

    -- Linking
    tags            TEXT[],                -- for categorization and retrieval
    parent_id       INTEGER REFERENCES exploration_journal(id),  -- follow-up chain
    session_id      TEXT,                  -- groups queries from one analysis session
    sequence_in_session INTEGER,           -- ordering within a session

    -- Provenance
    analyst         TEXT DEFAULT 'claude',  -- who ran this
    data_source     TEXT DEFAULT 'scs/current/database.db'
);

-- Named result snapshots: save interesting result sets for later comparison
CREATE TABLE result_snapshots (
    id              INTEGER PRIMARY KEY,
    journal_id      INTEGER NOT NULL REFERENCES exploration_journal(id),
    snapshot_name   TEXT NOT NULL UNIQUE,   -- human-readable name for retrieval
    created_at      TIMESTAMP DEFAULT current_timestamp,
    description     TEXT,

    -- The snapshot itself (DuckDB-native storage)
    -- Store as a serialized table name; the actual data lives in a
    -- dynamically created table named 'snapshot__{snapshot_name}'
    table_name      TEXT NOT NULL,          -- e.g., 'snapshot__sbom_gap_repos'
    row_count       INTEGER,
    column_names    TEXT[],
    create_sql      TEXT NOT NULL           -- the CREATE TABLE AS SELECT that produced it
);

-- Cross-reference: which findings support or contradict each other
CREATE TABLE finding_links (
    id              INTEGER PRIMARY KEY,
    from_id         INTEGER NOT NULL REFERENCES exploration_journal(id),
    to_id           INTEGER NOT NULL REFERENCES exploration_journal(id),
    link_type       TEXT CHECK (link_type IN (
                        'supports',         -- from_id provides evidence for to_id
                        'contradicts',      -- from_id undermines to_id
                        'refines',          -- from_id narrows/qualifies to_id
                        'extends',          -- from_id broadens scope of to_id
                        'replaces'          -- from_id supersedes to_id (e.g., better query)
                    )),
    note            TEXT                   -- why this link exists
);

-- Sessions: group exploration into coherent threads
CREATE TABLE exploration_sessions (
    session_id      TEXT PRIMARY KEY,
    started_at      TIMESTAMP DEFAULT current_timestamp,
    ended_at        TIMESTAMP,
    title           TEXT NOT NULL,          -- e.g., "SBOM distribution gap analysis"
    goal            TEXT,                   -- what the session set out to answer
    outcome         TEXT,                   -- what was actually learned
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'complete', 'abandoned'))
);

-- Narrative export: pre-built view for generating a report from the journal
CREATE VIEW exploration_narrative AS
SELECT
    s.title AS session_title,
    s.goal AS session_goal,
    j.sequence_in_session,
    j.question,
    j.hypothesis,
    j.result_summary,
    j.narrative,
    j.finding_type,
    j.confidence,
    j.observation_caveat,
    j.surprise_flag,
    j.tags,
    CASE
        WHEN j.query_engine = 'duckdb' THEN j.query_sql
        ELSE j.query_cypher
    END AS query_text,
    j.query_engine,
    j.row_count,
    j.created_at
FROM exploration_journal j
LEFT JOIN exploration_sessions s ON j.session_id = s.session_id
ORDER BY s.started_at, j.sequence_in_session;
```

### 3.2 Usage Patterns

**Starting an exploration session:**

```sql
INSERT INTO exploration_sessions (session_id, title, goal)
VALUES ('2026-03-30-sbom-gap', 'SBOM Distribution Gap',
        'Quantify how many projects generate SBOMs but do not distribute them via GitHub releases');
```

**Recording a finding:**

```sql
INSERT INTO exploration_journal
    (id, question, query_sql, result_summary, finding_type, confidence,
     observation_caveat, tags, session_id, sequence_in_session)
VALUES (
    1,
    'How many repos have SBOM generators in CI but no SBOM artifacts in releases?',
    'SELECT COUNT(*) ... WHERE uses_sbom_generator AND NOT has_sbom_artifact',
    '25 repos (10.6%) generate SBOMs in CI but have none in releases',
    'observation',
    'confirmed',
    'SBOMs may be distributed via OCI registries, package managers, or other channels not visible to this collector',
    ['sbom', 'distribution-gap', 'partial-observation'],
    '2026-03-30-sbom-gap',
    1
);
```

**Saving a result snapshot:**

```sql
-- Create the snapshot table
CREATE TABLE snapshot__sbom_gap_repos AS
SELECT nameWithOwner, uses_syft, uses_cdxgen, uses_trivy,
       has_sbom_artifact, total_releases
FROM agg_repo_summary
WHERE uses_sbom_generator AND NOT has_sbom_artifact;

-- Register it
INSERT INTO result_snapshots
    (id, journal_id, snapshot_name, table_name, row_count, column_names, create_sql, description)
VALUES (
    1, 1, 'sbom_gap_repos', 'snapshot__sbom_gap_repos', 25,
    ['nameWithOwner', 'uses_syft', 'uses_cdxgen', 'uses_trivy', 'has_sbom_artifact', 'total_releases'],
    'CREATE TABLE ... (see above)',
    'All repos with SBOM generators in CI but no SBOM in releases, as of 2026-02-02 data'
);
```

**Linking findings:**

```sql
-- Finding 2 refines finding 1
INSERT INTO finding_links (id, from_id, to_id, link_type, note)
VALUES (1, 2, 1, 'refines',
        'Breaks the 25 repos into syft-users vs trivy-users; syft users are more likely to distribute');
```

**Exporting the narrative:**

```sql
-- Generate a markdown-ready exploration log
SELECT
    '## ' || session_title || chr(10) ||
    '*Goal: ' || session_goal || '*' || chr(10) || chr(10) ||
    string_agg(
        '### Q' || sequence_in_session || ': ' || question || chr(10) ||
        CASE WHEN hypothesis IS NOT NULL
             THEN '*Hypothesis: ' || hypothesis || '*' || chr(10) ELSE '' END ||
        '```sql' || chr(10) || query_text || chr(10) || '```' || chr(10) ||
        '**Finding** (' || confidence || '): ' || result_summary || chr(10) ||
        COALESCE(narrative, '') || chr(10) ||
        CASE WHEN observation_caveat IS NOT NULL
             THEN '> **Observation caveat:** ' || observation_caveat || chr(10) ELSE '' END,
        chr(10) || '---' || chr(10)
        ORDER BY sequence_in_session
    ) AS markdown
FROM exploration_narrative
GROUP BY session_title, session_goal;
```

### 3.3 Design Rationale

**Why `observation_caveat` as a first-class column:** Every finding in this dataset needs a built-in reminder of what we cannot see. Making it a required-thinking field (even if nullable) forces the analyst to consider the partial-observation problem for every query, not just once in a preamble.

**Why `hypothesis` + `surprise_flag`:** Exploration is most valuable when it contradicts expectations. Recording what you expected before running the query, then flagging surprises, builds a record of assumption-breaking discoveries that are worth highlighting in reports.

**Why `finding_links` as a separate table:** Findings relate to each other in ways that are not parent-child. Finding 3 might contradict Finding 1 while supporting Finding 7. A many-to-many link table with typed relationships captures this structure.

**Why snapshot tables instead of JSON blobs:** DuckDB is columnar. Storing result sets as dynamically-created tables (not JSON in a TEXT column) means snapshots are queryable, joinable, and exportable to Parquet. You can diff two snapshots with a simple `EXCEPT` query.

**Why `query_engine` distinguishes DuckDB from LadybugDB:** This dataset lives in two analytical engines. The journal must track which engine answered each question so that exploration narratives can reproduce results and readers understand which tool was used.
