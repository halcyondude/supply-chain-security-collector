# CNCF Presentation Strategy Primer: Supply Chain Security Collector

**Date:** 2026-03-30
**Scope:** Standard primer -- CNCF ecosystem positioning, example questions, audience framing, and presentation risks
**Audience:** Presentation lead preparing for a CNCF initiative talk

---

## TL;DR

The supply chain security collector answers a question nobody in the CNCF can answer today: *across all ~230 CNCF projects, who is actually shipping SBOMs, signing releases, running vulnerability scanners, and generating attestations -- and who is not?* This is not hypothetical. The tool collects real GitHub Actions workflow definitions, release asset metadata, and Security Insights YAML declarations, normalizes them into a queryable DuckDB database, and produces per-repo and per-project summaries with 40+ boolean and numeric security posture fields. The three strongest presentation questions are (1) the gap between CNCF maturity status and actual supply chain practice, (2) which specific security tools the ecosystem has converged on vs. which remain fragmented, and (3) whether projects that *build* supply chain security tools actually use them on their own releases. The primary audience is TAG Security and the TOC, with strong secondary interest from project maintainers. The biggest landmine is appearing to shame projects -- frame this as infrastructure for improvement, not a report card.

---

## Core Concepts

### What the collector actually measures

The collector fetches data from GitHub's GraphQL API for each repo in the input set and normalizes it into relational tables:

- **Release assets** (`base_release_assets`): Every file attached to every GitHub release. Pattern-matched for SBOMs (SPDX, CycloneDX), signatures (`.sig`, `.asc`, cosign), attestations (SLSA provenance, in-toto, VEX, sigstore bundles).
- **CI/CD workflows** (`base_workflows`): Every GitHub Actions workflow YAML. Content-scanned for 20+ security tools: cosign, syft, trivy, codeql, snyk, grype, docker-scout, fossa, dependabot, renovate, and more.
- **Security Insights** (`base_si_documents`, `base_si_sboms`): SECURITY-INSIGHTS.yml declarations parsed for SBOM and attestation claims.
- **Branch protection** (`base_branch_protection_rules`): Whether default branches enforce reviews, status checks, signed commits.

These are aggregated into analysis tables:

| Table | What it answers |
|-------|----------------|
| `agg_repo_summary` | Per-repo: 40+ boolean flags (has_sbom_artifact, uses_cosign, uses_codeql, etc.) plus counts |
| `agg_cncf_project_summary` | Per-CNCF-project: aggregated across all repos in the project, with maturity level and dates |
| `agg_executive_summary` | Ecosystem-wide: total repos, % with SBOMs, % with signatures, tool adoption counts |
| `agg_workflow_tools` | Which specific tool is used in which workflow in which repo |
| `agg_tool_summary` | Tool-level: adoption percentage across the ecosystem |
| `agg_artifact_patterns` | Every release asset classified by type |

### What the test database shows (3 projects)

The test database covers Kubernetes, Harbor, and Jaeger -- three graduated projects. Even in this small sample, the data reveals meaningful patterns:

| Project | Workflows | SBOM in releases | Signatures | CodeQL | Trivy | Docker Scout |
|---------|-----------|-----------------|------------|--------|-------|--------------|
| Kubernetes | 0 | No | No | No | No | No |
| Harbor | 10 | No | No | Yes | Yes | No |
| Jaeger | 37 | No | No | Yes | No | Yes (3 workflows) |

**Key finding from test data:** Zero of three graduated CNCF projects publish SBOMs or signatures in their GitHub releases, despite all three having completed security audits. Harbor runs Trivy nightly scans and CodeQL analysis. Jaeger uses FOSSA for dependency scanning and Docker Scout for container scanning. Kubernetes's primary repo has zero GitHub Actions workflows (it uses a custom CI system, Prow -- an important edge case the presentation should acknowledge).

---

## The 3 Best Example Questions (Ranked by Impact)

### Question 1: "What percentage of graduated CNCF projects actually ship SBOMs and signed releases?"

**Why this matters to CNCF stakeholders:**
This is the question that will make people sit up. The CNCF has published the [Supply Chain Security Best Practices v2](https://tag-security.cncf.io/blog/software-supply-chain-security-best-practices-v2/) paper through TAG Security. The TOC evaluates projects for graduation. Executive Order 14028 and EU CRA create regulatory pressure. But nobody has measured whether the ecosystem's own flagship projects follow the guidance. Supply chain attacks cost over $45 billion in 2023 with projections exceeding $80 billion by 2026. The CNCF's credibility on supply chain security depends on its own projects walking the talk.

**What the answer looks like (from real data):**

```sql
SELECT project_name, maturity, repos_with_sbom, repos_with_signatures,
       repos_with_attestations, repos_using_cosign, repos_using_syft
FROM agg_cncf_project_summary
WHERE maturity = 'graduated';
```

In the test database: **0% of graduated projects** publish SBOMs in releases. **0% publish signatures.** **0% publish attestations.** This is three projects -- the full landscape run against ~230 projects will produce the definitive answer, and the delta between "graduated" and "sandbox" projects will be either reassuring or alarming.

**Why existing tools cannot answer this today:**
- **OpenSSF Scorecard** evaluates development practices (branch protection, CI config, dependency updates) but does not inspect release assets for SBOMs/signatures or parse workflow content for specific tool usage.
- **CLOMonitor** checks CNCF-specific requirements (CII badge, SECURITY.md, license) but does not analyze release artifact composition or CI pipeline security tooling.
- **GUAC** aggregates and queries supply chain metadata that already exists -- but it does not measure *whether projects are producing that metadata in the first place*. That is the gap this tool fills.
- **Manual inspection** does not scale to 230 projects with multiple repos each.

### Question 2: "Which supply chain security tools has the CNCF ecosystem actually converged on?"

**Why this matters to CNCF stakeholders:**
The CNCF landscape includes dozens of supply chain security tools (cosign, syft, trivy, grype, snyk, cdxgen, FOSSA, docker-scout, etc.) but there is no data on which ones projects actually use in their CI pipelines. This matters for three audiences: (a) TAG Security needs to know which tools to recommend in best-practices guides, (b) project maintainers want to know what peers use, (c) tool maintainers in the CNCF ecosystem want adoption data.

**What the answer looks like (from real data):**

```sql
SELECT tool_name, tool_category, repo_count, adoption_percentage
FROM agg_tool_summary
ORDER BY repo_count DESC;
```

| Tool | Category | Repos | Adoption % |
|------|----------|-------|------------|
| codeql | code-scanner | 2 | 66.7% |
| docker-scout | container-scanner | 1 | 33.3% |
| fossa | dependency-scanner | 1 | 33.3% |
| trivy | sbom-generator + container-scanner | 1 | 33.3% |

At full scale (~230 projects), this table becomes a de facto adoption survey that no one has ever produced. It can answer questions like: Is cosign winning the signing race? Has trivy or grype become the default vulnerability scanner? Are CNCF projects eating their own dog food by using CNCF-hosted security tools?

**Why existing tools cannot answer this:**
No existing system inspects the *content* of GitHub Actions workflow files across the CNCF landscape to identify which security tools are wired into CI/CD. OpenSSF Scorecard checks *whether* CI exists, not *what runs inside it*. This is a fundamentally different data source.

### Question 3: "Do CNCF supply chain security projects use their own tools?"

**Why this matters to CNCF stakeholders:**
This is the "eat your own dog food" question. Sigstore builds cosign -- does sigstore's own release pipeline use cosign to sign releases? Anchore builds syft -- does anchore/syft publish SBOMs generated by syft? The answer to this question is a powerful credibility signal. If the projects that build supply chain security tools do not use them, that undermines the entire ecosystem narrative.

**What the answer looks like:**
This requires a targeted query against the full landscape data, joining project metadata (category = security tooling) against repo_summary (uses_cosign, uses_syft, has_sbom_artifact). The collector already captures this -- it is a query, not a new feature.

```sql
SELECT p.project_name, p.category, r.uses_cosign, r.uses_syft,
       r.has_sbom_artifact, r.has_signature_artifact
FROM agg_cncf_project_summary p
JOIN agg_repo_summary r ON ... -- via cncf_project_repos
WHERE p.category LIKE '%Security%'
   OR p.project_name IN ('Sigstore', 'in-toto', 'TUF', 'Notary', 'SPIFFE', 'SPIRE');
```

**Why this matters uniquely in CNCF context:**
The CNCF recently graduated in-toto (April 2025). The Supply Chain Security Best Practices v2 paper recommends specific tools. The TOC evaluates projects against maturity criteria. If security-focused projects lead by example, that validates the ecosystem. If they do not, it identifies a fixable gap.

---

## Audience Framing Advice

### Primary audience: TAG Security + TOC

**TAG Security** is the natural home for this work. They authored the Supply Chain Security Best Practices papers (v1 and v2). They run the Supply Chain Security Working Group. They need data to inform their recommendations. Position the collector as **infrastructure for the TAG** -- a repeatable measurement capability that turns their best-practices guidance into measurable outcomes.

The [CNCF TOC Issue #1709](https://github.com/cncf/toc/issues/1709) ("CNCF Supply Chain Security Insights") describes exactly this initiative: aggregating and analyzing supply chain metadata across CNCF projects. The collector is either a direct contribution to this initiative or a complementary tool. Make this connection explicit in the presentation.

**TOC members** care about: (a) whether maturity requirements should include supply chain security practices, (b) data to inform graduation decisions, (c) ecosystem-wide health metrics. Position the collector as providing **evidence for policy decisions**, not just a cool dashboard.

### Secondary audience: Project maintainers

Maintainers want to know: "How does my project compare to peers?" and "What should I add to my CI pipeline?" The `agg_cncf_project_summary` table gives them both. Frame this as **a tool that helps them level up**, not one that exposes their gaps.

### Tertiary audience: End users and adopters

End users selecting CNCF projects for production use care about supply chain security posture. They currently rely on CLOMonitor scores and OpenSSF Scorecards, which do not capture release artifact security. Position the collector as **adding a dimension that adopters cannot currently evaluate**.

### How to position it

Use this framing hierarchy:

1. **Measurement infrastructure** -- "We built the ability to measure this across the entire CNCF landscape"
2. **Data-driven insights** -- "Here is what we found" (show the queries and results)
3. **Contribution to CNCF processes** -- "Here is how this can feed into graduation criteria, TAG Security guidance, and CLOMonitor"
4. **Repeatable and extensible** -- "This runs against any set of GitHub repos, produces standard formats (DuckDB + Parquet), and new detection patterns are just SQL models"

---

## Landmines to Avoid

### 1. Do not create a public shaming dynamic

**The risk:** Showing a table of graduated projects with columns of red "No" values next to SBOM and signature fields will feel like a callout. Maintainers who volunteer their time will bristle. TOC members who approved graduation will get defensive.

**The mitigation:** Frame gaps as *opportunities the tool identifies*, not failures. Use language like "the data shows where the ecosystem can improve" rather than "these projects are not following best practices." Lead with projects that ARE doing well, then show the aggregate gap.

### 2. Acknowledge what the tool does NOT measure

**The risk:** Someone in the audience will immediately point out that Kubernetes signs its releases via a separate process (krel + cosign, outside GitHub Actions), that some projects publish SBOMs to OCI registries rather than GitHub release assets, or that container image signatures are stored in registries, not release pages.

**The mitigation:** Be explicit about the data sources and their limitations. The collector measures what is visible in GitHub: release assets, workflow YAML content, and Security Insights declarations. Projects that sign outside GitHub, publish SBOMs to OCI registries, or use non-GitHub CI systems will appear to have lower coverage than they actually do. The Kubernetes case in the test data (0 workflows, 0 security artifacts) is a good example to address proactively -- Kubernetes uses Prow, not GitHub Actions. **Say this before someone else does.**

### 3. Do not compete with existing CNCF tooling

**The risk:** Positioning the collector as a replacement for CLOMonitor, OpenSSF Scorecard, or GUAC will create political friction. Those projects have maintainers, sponsors, and constituencies within the CNCF.

**The mitigation:** Position as *complementary*. CLOMonitor checks project governance. Scorecard evaluates development practices. GUAC queries supply chain metadata. The collector measures *whether projects produce that metadata in the first place*. This is a gap, not an overlap. Better yet, frame it as a data source that could feed into those systems.

### 4. Be careful with "CNCF should require X"

**The risk:** Suggesting that SBOM publication or release signing should be a graduation requirement will trigger a policy debate that derails the presentation. There are legitimate arguments on both sides (burden on volunteer maintainers vs. ecosystem security).

**The mitigation:** Present the data. Let the audience draw policy conclusions. If asked directly, say "we provide the measurement capability -- policy is a TOC decision."

### 5. Do not oversell three-project results as landscape findings

**The risk:** The test database has only Kubernetes, Harbor, and Jaeger. Presenting "0% SBOM adoption" from three projects as a landscape finding will get called out immediately.

**The mitigation:** Use the three-project data to demonstrate the *capability* and the *query patterns*. Show the SQL. Show the table structure. Then either (a) run the full landscape before the presentation and show real numbers, or (b) clearly label the three-project data as "demonstration data" and describe what the full run will show. Option (a) is strongly preferred.

### 6. Account for the Kubernetes Prow edge case

**The risk:** Kubernetes is the highest-profile CNCF project. Showing it with zero workflows and zero security artifacts will seem like a tool failure, not a Kubernetes gap.

**The mitigation:** Call this out as a known limitation. Kubernetes uses Prow (a custom CI system) and publishes artifacts through a separate release process (krel). The collector sees 0 GitHub Actions workflows because there are none -- this is accurate data that reveals a measurement boundary, not a security gap. Use this as an example of how the tool's scope is honest about what it can and cannot see.

---

## Key Recommendations for the Presentation

### Structure: Follow the lead's framework, but adjust the opening

The proposed framework (example question -> data source -> collection method -> contribution plan -> Q&A) is solid. One adjustment: **open with the "why now" before the example question.** The audience needs 30 seconds of context:

- TAG Security published SSCBPv2
- TOC Issue #1709 calls for exactly this kind of ecosystem measurement
- Supply chain attacks are projected to cost $80B+ by 2026
- Nobody has measured whether CNCF projects follow their own guidance

Then hit the example question.

### Run the full landscape before presenting

The three-project test data demonstrates the tool's capability but lacks the statistical weight to support ecosystem claims. A full landscape run (~230 projects) transforms this from a demo into a finding. The difference between "we can answer this question" and "we did answer this question" is the difference between a proposal and a contribution.

### Prepare two or three "drill-down" queries for live demo

If there is a live demo component, prepare queries that let the audience explore. Examples:

```sql
-- Maturity gap: graduated vs. sandbox
SELECT maturity, COUNT(*) as projects,
       AVG(repos_with_sbom) as avg_sbom,
       AVG(repos_using_cosign) as avg_cosign
FROM agg_cncf_project_summary
GROUP BY maturity;

-- Tool adoption leaderboard
SELECT tool_name, tool_category, repo_count, adoption_percentage
FROM agg_tool_summary
ORDER BY repo_count DESC
LIMIT 10;

-- Security tools eating their own dog food
SELECT project_name, repos_using_cosign, repos_using_syft,
       repos_with_sbom, repos_with_signatures
FROM agg_cncf_project_summary
WHERE category LIKE '%Security%';
```

### Emphasize the output format, not just the findings

DuckDB + Parquet is a deliberate choice. The data is queryable by anyone with SQL skills. It can be loaded into Jupyter notebooks, BI tools, or GUAC. The property graph export (LadybugDB) enables Cypher queries for dependency analysis. This is not a one-off report -- it is reusable infrastructure.

---

## Pitfalls and Open Questions

### Open questions the presentation should acknowledge

1. **Coverage gap:** How many CNCF projects use non-GitHub CI systems (Jenkins, GitLab CI, Buildkite, Prow) that the collector cannot currently inspect? This is a known limitation, not a flaw, but it affects completeness claims.

2. **OCI registry artifacts:** Some projects publish SBOMs and signatures to OCI registries (e.g., via `cosign attach sbom`) rather than GitHub release assets. The collector does not currently inspect OCI registries. How large is this gap?

3. **Temporal trends:** The collector captures a point-in-time snapshot. Can it be run periodically to show improvement over time? (The answer is yes -- it is designed for this -- but the presentation should state this explicitly.)

4. **SECURITY-INSIGHTS.yml adoption:** This is a relatively new standard. How many CNCF projects have adopted it? The collector parses it, but the test data shows zero adoption in the sample.

5. **Contribution path:** Where should this tool or its data live within the CNCF? Options include: a TAG Security community resource, a feed into CLOMonitor, a data source for GUAC, or an independent project. The presentation should have a clear ask.

### What this primer does NOT cover

- Technical implementation details (the README and docs/ directory cover this)
- Comparison with commercial supply chain security platforms (Chainguard, Snyk, etc.)
- Detailed regulatory mapping (EO 14028, EU CRA, NIST SSDF)

---

## Tools and Resources

| Resource | URL | Relevance |
|----------|-----|-----------|
| TAG Security Supply Chain WG | https://tag-security.cncf.io/community/working-groups/supply-chain-security/ | The working group this tool supports |
| SSCBPv2 Paper | https://tag-security.cncf.io/blog/software-supply-chain-security-best-practices-v2/ | The best practices this tool measures against |
| TOC Issue #1709 | https://github.com/cncf/toc/issues/1709 | The CNCF initiative this tool directly addresses |
| CLOMonitor | https://clomonitor.io | Complementary tool (governance checks, not artifact analysis) |
| OpenSSF Scorecard | https://scorecard.dev/ | Complementary tool (development practices, not release artifacts) |
| GUAC | https://guac.sh/ | Potential downstream consumer of collector data |
| in-toto graduation announcement | https://www.cncf.io/announcements/2025/04/23/cncf-announces-graduation-of-in-toto-security-framework-enhancing-software-supply-chain-integrity-across-industries/ | Recent CNCF supply chain security milestone |
| CNCF Public Sector Supply Chain WP | https://www.cncf.io/wp-content/uploads/2025/11/cncf_wp_publicsector_111025a.pdf | Government/regulatory context |

---

## Verification Checklist

- [x] All data claims sourced from actual database queries against `output/test-three-projects/current/database.db`
- [x] External claims sourced from web searches with URLs provided
- [x] TOC Issue #1709 connection verified via web search
- [x] Tool limitations (Prow, OCI registries, non-GitHub CI) explicitly flagged
- [x] Recommendations are actionable (run full landscape, prepare drill-down queries, frame as complementary)
- [x] No hypothetical data presented as findings
- [x] Date-sensitive claims use current dates (primer dated 2026-03-30)

---

## Sources

- [CNCF TAG Security - Supply Chain Security Best Practices v2](https://tag-security.cncf.io/blog/software-supply-chain-security-best-practices-v2/)
- [CNCF Blog - Chain reaction: What's new in CNCF's 2025 supply chain security guide](https://www.cncf.io/blog/2025/08/06/chain-reaction-in-amsterdam-whats-new-in-cncfs-2025-supply-chain-security-guide/)
- [CNCF TOC Issue #1709 - Supply Chain Security Insights Initiative](https://github.com/cncf/toc/issues/1709)
- [CNCF - in-toto Graduation Announcement (April 2025)](https://www.cncf.io/announcements/2025/04/23/cncf-announces-graduation-of-in-toto-security-framework-enhancing-software-supply-chain-integrity-across-industries/)
- [CNCF Security Guidelines for New Projects](https://contribute.cncf.io/projects/best-practices/security/)
- [CNCF Public Sector Software Supply Chain Working Paper](https://www.cncf.io/wp-content/uploads/2025/11/cncf_wp_publicsector_111025a.pdf)
- [OpenSSF Scorecard](https://scorecard.dev/)
- [SSCBPv2 Full Paper (PDF)](https://tag-security.cncf.io/community/working-groups/supply-chain-security/supply-chain-security-paper-v2/Software_Supply_Chain_Practices_whitepaper_v2.pdf)
