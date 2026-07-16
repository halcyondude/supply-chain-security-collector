# State of the Ecosystem — CNCF Supply Chain Security Insights

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-07-16 | Initial report. Baseline scan of all 236 CNCF projects; SBOM prevalence, format split, per-maturity table. |

---

*Deliverable for [cncf/toc#1874](https://github.com/cncf/toc/issues/1874) — "SCI: Assess the State of CNCF Project Artifacts" — under initiative [cncf/toc#1709](https://github.com/cncf/toc/issues/1709), TAG Security & Compliance. Co-led with Evan Anderson ([@evankanderson](https://github.com/evankanderson)). Board: [cncf/projects/80](https://github.com/orgs/cncf/projects/80/views/4).*

---

## 1. The mandate

We chartered Supply Chain Security Insights (SCI) to answer a question the CNCF has never been able to answer with data: **what is the collective supply chain posture of the CNCF ecosystem?** SBOMs, signatures, attestations, VEX — the metadata exists, but it's scattered across 236 projects, dozens of release conventions, and half a dozen publishing channels. Nobody has a unified, queryable view. You can't reason about ecosystem risk you can't measure.

The charter ([#1709](https://github.com/cncf/toc/issues/1709)) is explicit about scope. **In scope:** collecting supply chain metadata, normalizing it, standing up a queryable store (GUAC is the reference target), and producing example analyses across the ecosystem. **Out of scope, and staying out of scope:** real-time alerting, policy enforcement, and analysis beyond CNCF projects. This is an **insight and measurement** effort. It is not a gate, a scoreboard, or a compliance cop.

Milestone 1 sets the near-term bar: a CNCF community member should be able to stand up GUAC on a single-node cluster (kind) and answer two concrete questions:

1. What projects would be impacted if a library changed to an incompatible, non-OSI license — the "rug pull"?
2. What projects would be impacted by a CVE discovered in a given library?

This report is the deliverable that precedes that graph work. Before you can answer "who's impacted by a bad dependency," you have to know **what metadata even exists to build the graph from.** That's what we measured.

## 2. What "done" looks like for this deliverable

[#1874](https://github.com/cncf/toc/issues/1874) asks for a report on three things across CNCF projects:

- **Prevalence** — how many projects publish SBOMs?
- **Formats** — SPDX or CycloneDX?
- **Findability** — where do the artifacts live, and can a tool reliably discover them?

The pilot goal was 10–15 projects. We did all 236.

## 3. What shipped — the collector

We built the [Supply Chain Security Collector](https://github.com/halcyondude/supply-chain-security-collector) and ran it against the **entire CNCF landscape — all 236 projects, every maturity level.** That's an order of magnitude past the pilot target.

The scan covered:

| Measured | Count |
|----------|-------|
| CNCF projects (primary repos) | 236 |
| Releases inspected | 4,169 |
| Release assets classified | 39,304 |
| CI workflows parsed | 2,784 |

The tool collects from the GitHub GraphQL API: release assets (SBOMs, `.sig` files, attestations, cosign bundles), GitHub Actions workflow files (tool references via full-text search), branch protection rules, and `SECURITY-INSIGHTS.yml`. Per repo it emits a normalized set of booleans — does this project publish an SBOM, sign releases, attach attestations, and which tools does its CI reference — plus per-project and per-maturity rollups. Output is DuckDB + Parquet, so anyone can re-run the numbers in this report with a single SQL query. There's also a [live in-browser explorer](https://halcyondude.github.io/supply-chain-security-collector/) (DuckDB-WASM, no backend) if you'd rather click than write SQL.

## 4. What we found — the baseline

Read this section as a **starting line, not a scoreboard.** Before this scan, the ecosystem-wide numbers didn't exist. Now they do. That's the win. The gaps below are things we can now *see* and therefore *close* — they were always there; they were just invisible.

### The headline

**23 of the 34 CNCF graduated projects publish neither an SBOM nor a signature in their release assets.**

These are the projects that carry the most weight in the ecosystem — Kubernetes, containerd, etcd, Prometheus, Cilium, Harbor, cert-manager, Linkerd, and 15 others (full list in the appendix). Graduated projects are the ones downstream users trust most and inspect least. When the most-depended-on tier is also the tier with the least machine-readable provenance in release assets, that's not a per-project failing — it's **systemic-gap evidence.** The signal is about the ecosystem's defaults and tooling, not about any one project's diligence.

> A hard caveat, stated up front: **every number here is a lower bound.** The collector sees GitHub release assets and CI workflows. It does *not* see container image signatures in OCI registries (`cosign verify`), npm/PyPI provenance, GitHub's Attestations API, or non-GitHub CI (Prow, Jenkins, etc.). Many of the 23 almost certainly sign their container images — they just don't attach `.sig` files to GitHub releases. **Absence of evidence here is not evidence of absence.** See §5.

### Prevalence, by maturity

Per-maturity view across all 236 projects (release-asset evidence):

| Maturity | Projects | Publish SBOM | SBOM % | Publish signature | Sig % | Both | Neither |
|----------|----------|--------------|--------|-------------------|-------|------|---------|
| Graduated | 34 | 5 | 14.7% | 8 | 23.5% | 2 | **23** |
| Incubating | 36 | 10 | 27.8% | 11 | 30.6% | 5 | 20 |
| Sandbox | 142 | 22 | 15.5% | 15 | 10.6% | 7 | 112 |
| Archived | 24 | 1 | 4.2% | 2 | 8.3% | 0 | 21 |
| **All** | **236** | **38** | **16.1%** | **36** | **15.3%** | **14** | **176** |

The counterintuitive result: **incubating projects out-publish graduated ones** on both SBOMs and signatures. That fits a story where SBOM/signing tooling matured *after* the graduated cohort locked in their release pipelines — the newer projects adopted it as a default, the established ones haven't retrofitted.

**Only 14 of 236 projects do both** — publish an SBOM *and* sign releases. That's the number that matters if the goal is verifiable provenance, and it's thin across every tier.[^both]

[^both]: An earlier brain demonstrator reported **13** projects doing both; **14** is correct. The 14th is **ContainerSSH**, which was dropped from the earlier count by a case-sensitive owner/repo join — the same class of bug as the CubeFS miscount below. This report's join is case-insensitive, so both figures now reconcile at 14.

### Formats — SPDX wins decisively

Of the SBOM artifacts we could classify by format:

| Format | SBOM artifacts | Distinct repos |
|--------|----------------|----------------|
| SPDX | 1,057 | 19 |
| CycloneDX | 29 | 3 |
| Unknown / unclassified | 1,316 | 19 |

Among classified SBOMs, **SPDX outnumbers CycloneDX ~36:1 by artifact count** (1,057 vs 29). That ratio is artifact-skewed — a few SPDX-heavy projects attach many SBOMs per release — so read it alongside the **per-repo** count: **19 repos publish SPDX, 3 publish CycloneDX** (roughly 6:1 by project). Either way, SPDX is the de facto ecosystem default; CycloneDX presence is real but small. The large "unknown" bucket is itself a **findability** finding: a third of SBOM-like artifacts don't announce their format in a way a scanner can cheaply detect — which means any downstream aggregator (including GUAC) has to open and sniff files rather than trust naming conventions.

### Tooling signal

What CI actually references, across the 236 primary repos:

| Tool | Repos (workflow-declared) |
|------|---------------------------|
| CodeQL | 80 |
| GoReleaser | 22 |
| Trivy | 19 |
| Dependabot | 8 |
| Renovate | 5 |
| Syft | 1 |
| cosign | 1 |

Two things to note. First, **code scanning (CodeQL, 80) is far more adopted than supply-chain artifact tooling** — the ecosystem is better at scanning its own source than at emitting verifiable build outputs. Second, workflow-declared cosign shows only 1, but **36 projects have signature artifacts** in releases. That gap is expected: signing often happens via GoReleaser config or reusable actions that don't grep as literal `cosign` in a workflow file. Don't read the "1" as "one project signs" — read the 36.

### A data-correction note, in the open

The headline is **23, not 24.** The collector's own project-level rollup (`agg_cncf_project_summary`) miscounts CubeFS as publishing no signatures because of a case-sensitivity bug in how it matches artifact owners to landscape entries. CubeFS in fact ships **13 signature artifacts** (note: 13 *artifacts in one project*, not to be confused with the 14 *projects* that do both SBOM + signing in §4) — the per-repo table (`agg_repo_summary`) records them correctly. We derived every number in this report from the per-repo layer, not the buggy rollup, and CubeFS is excluded from the 23. We're flagging this because if we're asking projects to trust our numbers, we owe them the bugs we found in our own. The fix is tracked in the collector repo.

## 5. Methodology and reproducibility

The whole point is that you can check our work.

- **Open source, MIT.** The collector is on GitHub. Clone it, point it at any repo set, get a DuckDB database back.
- **npx-runnable.** `npm install`, set a GitHub token, `npm test` runs three projects; `npm start` runs the full landscape.
- **Every number in this report is one SQL query.** The committed Parquet lives at `site/dist/data/*.parquet`. The exact queries that produced these figures are in the appendix.
- **In-browser explorer.** [halcyondude.github.io/supply-chain-security-collector](https://halcyondude.github.io/supply-chain-security-collector/) runs DuckDB-WASM client-side — no backend, no signup, write your own SQL against the same data.

### Known limits — read before quoting a number

The collector sees **release assets and CI workflow files on GitHub.** It does not see:

- **OCI registries** — container image signatures via cosign keyless (the big one for the graduated tier)
- **Package-manager provenance** — npm provenance, PyPI attestations, Go module checksums
- **GitHub Attestations API** — `actions/attest-build-provenance` (not yet queried)
- **Non-GitHub CI** — Prow (Kubernetes uses it heavily), Azure Pipelines, Jenkins, CircleCI
- **Config-driven signing** — GoReleaser signing that doesn't surface as a literal tool reference

Scan depth is capped at the 20 most recent releases per repo. **Every figure is a floor, not a ceiling.** A project reading "neither" here may be signing everything through a channel we don't yet collect. This is exactly why §7's ask includes a correction loop *before* any project-level publication.

## 6. What remains

This report is the map. Here's the road.

- **Milestone 1 — the GUAC graph.** Stand up GUAC on kind, ingest SBOMs, and answer the two charter questions: license "rug-pull" impact and CVE impact across dependency trees. The baseline in §4 tells us which projects already emit graph-ingestible metadata (14 do both today) and where we'll need to fetch from OCI/package registries to fill gaps.
- **Graph federation — [#1879](https://github.com/cncf/toc/issues/1879).** The reference architecture for creating, enriching, aggregating, and federating supply chain graphs. This is where per-project graphs compose into an ecosystem view.
- **Close the collector's blind spots.** Add OCI registry inspection and the GitHub Attestations API so the numbers move from "lower bound" toward "actual." That single change will materially revise the graduated-tier picture.

There's a clean loop-closer here. The CNCF landscape graph — official CNCF infrastructure, recently revived and re-platformed off the previous Neo4j licensing terms (a stewardship move to keep it on sustainable, open footing, not a vendor escape) — carries an open question, ["Q for graph" #15](https://github.com/cncf/landscape-graph): dependency trees with a CVE overlay. **That is precisely where Milestone 1 is headed.** SCI and the landscape graph converge on the same target from two directions.

## 7. The ask

To the TOC and TAG Security & Compliance:

1. **Advance SCI to its next phase** — greenlight the Milestone 1 GUAC work and the [#1879](https://github.com/cncf/toc/issues/1879) federation reference architecture on the strength of this baseline.
2. **Begin the hand toward TAG stewardship.** SCI has proven it can measure the ecosystem end to end. The natural long-term home for a repeatable measurement capability is inside a TAG, as durable community infrastructure.
3. **Hold the line on scope.** This stays **insight and measurement** — never alerting, never enforcement. The value is a shared, honest picture the community can act on, not a gate the community has to satisfy.

**On the guardrails — this matters as much as the numbers.** This is complementary to [CLOMonitor](https://clomonitor.io/) and the [CNCF landscape](https://landscape.cncf.io/), not a competitor. CLOMonitor scores best practices; the landscape maps the ecosystem; SCI measures supply chain artifact reality and feeds the graph. We are **not** shaming projects. Every project-level finding gets a **correction loop before any project-facing publication** — projects can supply the OCI/registry evidence our GitHub-only scan can't see, and we'll incorporate it. The 23 are named here as **evidence of a systemic tooling-and-defaults gap**, not as a ranking. If we've undercounted you — and for several of the 23, we almost certainly have — the appendix tells you exactly how to correct the record.

---

## Appendix A — The 23 graduated projects (correction path)

These 34 graduated projects were scanned; these 23 show neither an SBOM nor a signature **in GitHub release assets** (a lower bound — see §5). If your project signs images in an OCI registry, publishes provenance via a package manager, or uses the GitHub Attestations API, that evidence is not visible to the current collector.

**To correct the record:** open a PR or issue on [the collector](https://github.com/halcyondude/supply-chain-security-collector/issues) pointing us at the channel where your artifacts live (registry, package index, attestations API), or drop a note in the [SCI meeting notes](https://notes.cncf.io/cmBr4VUwS3qSHo3ABM6Tmw). We'll extend the collector to read that channel and re-run — no re-scan required on your end.

| Project | Repo |
|---------|------|
| CRI-O | https://github.com/cri-o/cri-o |
| Cilium | https://github.com/cilium/cilium |
| CloudEvents | https://github.com/cloudevents/spec |
| CoreDNS | https://github.com/coredns/coredns |
| Crossplane | https://github.com/crossplane/crossplane |
| Dapr | https://github.com/dapr/dapr |
| Falco | https://github.com/falcosecurity/falco |
| Fluentd | https://github.com/fluent/fluentd |
| Harbor | https://github.com/goharbor/harbor |
| KEDA | https://github.com/kedacore/keda |
| KubeEdge | https://github.com/kubeedge/kubeedge |
| Kubernetes | https://github.com/kubernetes/kubernetes |
| Linkerd | https://github.com/linkerd/linkerd2 |
| Open Policy Agent (OPA) | https://github.com/open-policy-agent/opa |
| Prometheus | https://github.com/prometheus/prometheus |
| Rook | https://github.com/rook/rook |
| SPIFFE | https://github.com/spiffe/spiffe |
| SPIRE | https://github.com/spiffe/spire |
| TiKV | https://github.com/tikv/tikv |
| Vitess | https://github.com/vitessio/vitess |
| cert-manager | https://github.com/cert-manager/cert-manager |
| containerd | https://github.com/containerd/containerd |
| etcd | https://github.com/etcd-io/etcd |

> Note: CubeFS is graduated and initially appeared in the rollup as a 24th "neither" project. It ships 13 signature artifacts and is correctly **excluded**. See §4, "A data-correction note."

## Appendix B — Reproduce every number

Run against the committed Parquet in `site/dist/data/`. The repo→maturity join is case-insensitive with a name-only fallback (4 CNCF projects were scanned under a renamed owner org).

```sql
-- Base table: join per-repo summary to project maturity (all 236 matched)
CREATE TABLE rm AS
WITH repo_maturity AS (
  SELECT rs.*, COALESCE(pr1.project_name, pr2.project_name) AS project_name
  FROM 'agg_repo_summary.parquet' rs
  LEFT JOIN 'base_cncf_project_repos.parquet' pr1
    ON lower(rs.owner)=lower(pr1.owner) AND lower(rs.repo)=lower(pr1.name)
  LEFT JOIN 'base_cncf_project_repos.parquet' pr2
    ON lower(rs.repo)=lower(pr2.name) AND pr1.project_name IS NULL AND pr2."primary"
)
SELECT r.*, p.maturity, p.display_name AS proj_display
FROM repo_maturity r
JOIN 'base_cncf_projects.parquet' p ON r.project_name = p.project_name;

-- Headline: 23 graduated projects with neither SBOM nor signature
SELECT COUNT(*) FROM rm
WHERE maturity='graduated' AND NOT has_sbom_artifact AND NOT has_signature_artifact;   -- 23

-- Only 14 of 236 do both
SELECT COUNT(*) FROM rm WHERE has_sbom_artifact AND has_signature_artifact;             -- 14

-- Per-maturity prevalence table
SELECT maturity, COUNT(*) AS projects,
  SUM(has_sbom_artifact::int) AS with_sbom,
  SUM(has_signature_artifact::int) AS with_sig,
  SUM((has_sbom_artifact AND has_signature_artifact)::int) AS both,
  SUM((NOT has_sbom_artifact AND NOT has_signature_artifact)::int) AS neither
FROM rm GROUP BY maturity;

-- SPDX vs CycloneDX split (by artifact)
SELECT sbom_format, COUNT(*) AS artifacts
FROM 'agg_artifact_patterns.parquet' WHERE is_sbom GROUP BY sbom_format;
-- unknown 1316, spdx 1057, cyclonedx 29

-- Scan scale
SELECT
  (SELECT COUNT(*) FROM 'base_releases.parquet') AS releases,          -- 4169
  (SELECT COUNT(*) FROM 'base_release_assets.parquet') AS assets,      -- 39304
  (SELECT COUNT(*) FROM 'base_workflows.parquet') AS workflows;        -- 2784

-- Tool adoption (workflow-declared)
SELECT SUM(uses_codeql::int) AS codeql, SUM(uses_trivy::int) AS trivy,
  SUM(uses_goreleaser::int) AS goreleaser, SUM(uses_cosign::int) AS cosign
FROM 'agg_repo_summary.parquet';   -- codeql 80, trivy 19, goreleaser 22, cosign 1

-- The rollup bug: buggy rollup says 24, per-repo truth is 23 (CubeFS signs)
SELECT COUNT(*) FROM 'agg_cncf_project_summary.parquet'
WHERE maturity='graduated' AND repos_with_sbom=0 AND repos_with_signatures=0;   -- 24 (wrong)
```
