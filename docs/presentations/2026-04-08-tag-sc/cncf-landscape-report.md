# CNCF supply chain security landscape -- what the data shows

*236 repositories across 236 CNCF projects. 4,169 releases. 39,304 release assets. 2,784 CI workflows analyzed.*
*Data collected: 2026-03-30*

---

## questions we can now answer

**What percentage of CNCF projects ship SBOMs?**
16.1% (38 of 236 repos). 14 repos include an SBOM in every release. The rest are partial.

**What percentage sign their releases?**
15.3% (36 of 236 repos). Among graduated projects, 7 of 34 sign releases -- the rest do not.

**Which security tools has the ecosystem converged on?**
CodeQL dominates code scanning at 33.9% adoption. Docker Scout (13.1%) leads container scanning. Trivy (8.1%) is the most-used SBOM generator. Cosign appears in exactly 1 CI workflow across the entire landscape.

**Do incubating projects have better supply chain practices than graduated ones?**
Yes. Incubating projects show 25.2% SBOM adoption vs. 14.7% for graduated. Newer projects are adopting faster than the flagship projects that preceded them.

**How many projects have SLSA provenance?**
525 provenance attestations exist across the landscape, but only 4 repos produce attestations: containerd (graduated), Kubewarden, OSCAL-COMPASS, and ko (all sandbox).

---

## findings that matter

### the Helm/NATS mirror

Helm signs every release but ships zero SBOMs. NATS ships SBOMs but has zero signatures. Neither does both. These are mature, well-maintained projects -- the gap is not about capability, it is about convention. Nobody has told them to do the other thing.

### incubating > graduated on SBOM adoption

| maturity | projects | repos | SBOM repos | SBOM adoption |
|----------|-------:|------:|-----------:|--------------:|
| graduated | 34 | 37 | 5 | 14.7% |
| incubating | 36 | 53 | 10 | 25.2% |
| sandbox | 142 | 158 | 20 | 13.5% |
| archived | 24 | 24 | 1 | 4.2% |

Incubating projects adopted SBOMs at nearly twice the rate of graduated projects. The likely explanation: incubating projects went through the maturity process more recently, when SBOM expectations were higher. Graduated projects predate the current supply chain security conversation.

### SECURITY-INSIGHTS.yml -- declarations vs. reality

27 repositories have a SECURITY-INSIGHTS.yml file. 7 declare SBOMs. 4 declare attestations across 2 repos. The schema is fragmented: 18 repos use v1.0.0, 5 use v2.0.0, and the rest are scattered across 2.1.0, 2.2.0, and 0.13.4. The standard exists. Adoption is thin.

### cosign in CI: 1 project

Exactly 1 project (Ratify) has cosign wired into a CI workflow. 14 repos use signing tools of some kind. 36 repos have signed release assets. The math: most signing happens outside GitHub Actions -- either locally, in non-GitHub CI, or via release tooling that is not visible to workflow analysis.

### projects with both SBOM and signing

13 projects produce both SBOMs and signed releases. These are the closest thing to a "full pipeline" in the CNCF:

| project | maturity |
|---------|----------|
| Flux | graduated |
| Jaeger | graduated |
| Artifact Hub | incubating |
| Chaos Mesh | incubating |
| Cortex | incubating |
| KubeVela | incubating |
| OpenFGA | incubating |
| Capsule | sandbox |
| CloudNativePG | sandbox |
| Microcks | sandbox |
| SOPS | sandbox |
| k0s | sandbox |
| k8gb | sandbox |

Zero of these 13 use cosign in CI. Zero produce attestations. SBOM + signing is the ceiling, not the floor.

---

## tool adoption landscape

### code scanning and vulnerability detection

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| CodeQL | 80 | 33.9% | static analysis, code scanning |
| eslint-security | 13 | 5.5% | JS/TS security linting |
| semgrep | 1 | 0.4% | pattern-based code scanning |

CodeQL is the clear winner. GitHub ships it free for public repos. 80 repos use it -- more than any other security tool by a factor of 2.5x.

### container scanning

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| Docker Scout | 31 | 13.1% | container image analysis |
| Trivy | 19 | 8.1% | container + vulnerability scanning |

Docker Scout's lead is notable -- it ships with Docker Desktop and is tightly integrated into Docker Hub.

### SBOM generation

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| Trivy | 19 | 8.1% | generates SPDX and CycloneDX SBOMs |
| spdx-sbom-generator | 10 | 4.2% | SPDX-only SBOM generation |
| Syft | 1 | 0.4% | generates SBOMs from container images |
| Tern | 1 | 0.4% | container image SBOM analysis |

SPDX dominates the format landscape (19 repos) vs. CycloneDX (3 repos). 19 repos produce SBOMs in an unknown format.

### signing and provenance

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| slsa-github-generator | 13 | 5.5% | SLSA provenance generation |
| cosign | 1 | 0.4% | keyless signing via Sigstore |

13 repos reference slsa-github-generator in workflows. Only 1 has cosign. The signing story is thin.

### dependency scanning

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| FOSSA | 18 | 7.6% | license + dependency analysis |
| Dependabot | 8 | 3.4% | automated dependency updates |
| Renovate | 5 | 2.1% | automated dependency updates |

### vulnerability scanning

| tool | repos | adoption | what it does |
|------|------:|---------:|--------------|
| Snyk | 4 | 1.7% | vulnerability detection |
| Anchore | 1 | 0.4% | vulnerability + SBOM analysis |

### category summary

| category | repos using | unique tools |
|----------|------------:|-------------:|
| code scanning | 94 | 3 |
| container scanning | 50 | 2 |
| SBOM generation | 31 | 4 |
| dependency scanning | 31 | 3 |
| signing | 14 | 2 |
| vulnerability scanning | 5 | 2 |

94 repos run code scanners. 14 use signing tools. The drop-off from "scan" to "sign" is 6.7x.

---

## by maturity level

### what should the CNCF expect from graduated projects?

34 graduated projects. 37 repos. Here is what they actually do:

| practice | graduated repos | graduated % | incubating % | sandbox % |
|----------|---------------:|------------:|-------------:|----------:|
| SBOM in releases | 5 | 14.7% | 25.2% | 13.5% |
| signed releases | 7 | 20.6% | 20.8% | 8.2% |
| attestations | 1 | 2.9% | 0% | 1.9% |

Graduated projects that sign releases: Envoy, Flux, Helm, Jaeger, Knative, TUF, in-toto.

Graduated projects that ship SBOMs: Argo, Dragonfly, Flux, Istio, Jaeger.

Graduated projects that do both: Flux and Jaeger. 2 of 34.

### tool adoption by maturity

| maturity | CodeQL | Trivy | cosign |
|----------|-------:|------:|-------:|
| graduated | 17 | 2 | 0 |
| incubating | 15 | 5 | 0 |
| sandbox | 40 | 10 | 0 |
| archived | 4 | 0 | 0 |

CodeQL penetration is high across all maturity levels. Trivy adoption increases from graduated (2) to incubating (5) to sandbox (10). Cosign adoption in CI: zero across all maturity levels (the single cosign workflow belongs to Ratify, which is classified differently in the workflow tools table).

### advanced artifacts

| artifact type | count |
|---------------|------:|
| SLSA provenance | 525 |
| Sigstore bundles | 167 |
| container attestations | 53 |
| VEX documents | 2 |
| in-toto links | 0 |
| in-toto layouts | 0 |
| SWID tags | 0 |

525 SLSA provenance attestations sounds high -- but they come from just 4 repos. in-toto, despite graduating in April 2025, has zero in-toto links or layouts in the observable release assets.

---

## methodology

### what we measured

- **Release assets**: every file attached to GitHub releases across 236 repos. Pattern-matched for SBOMs (SPDX, CycloneDX), signatures (.sig, .asc, cosign bundles), attestations (SLSA provenance, in-toto, VEX, sigstore bundles).
- **CI workflows**: 2,784 GitHub Actions workflow YAML files. Content-scanned via full-text search for 20+ security tool names.
- **SECURITY-INSIGHTS.yml**: parsed for SBOM and attestation declarations.
- **20 most recent releases** per repo, ordered by creation date descending.

### what we did not measure

- **OCI registry artifacts.** Projects that attach SBOMs or signatures to container images via `cosign attach` or OCI referrers are not captured. This is a known gap -- Kubernetes, for example, signs releases via krel + cosign outside GitHub Actions.
- **Non-GitHub CI.** Prow, Jenkins, GitLab CI, Buildkite -- none visible. Kubernetes shows 0 workflows because it uses Prow. That is accurate data about a measurement boundary, not a security gap.
- **Tool effectiveness.** A workflow that references CodeQL might be disabled, failing, or misconfigured. Presence is not proof of function.
- **Private repos or org-level policies.** Only public GitHub data.

### data pipeline

CNCF landscape.yml (project list) -> GitHub GraphQL API (repos, releases, assets, workflows) -> TypeScript normalizers -> DuckDB + Parquet (base tables) -> SQL analysis models -> aggregate tables -> this report.

The database is queryable. Anyone with DuckDB can run SQL against the Parquet files.

---

## what's next

**GUAC integration.** The aggregate tables map directly to GUAC's ingestion model. The collector identifies which projects produce supply chain metadata; GUAC can then ingest and graph that metadata. Complementary, not competing.

**Temporal tracking.** Run the collector on a schedule. Weekly or monthly snapshots produce trend data: is the ecosystem improving? Which projects adopted SBOMs after a nudge? Designed for this from day one -- the output is timestamped and partitioned.

**OCI registry analysis.** The highest-priority gap. Container image signatures and attached SBOMs live in registries, not GitHub releases. Adding `cosign verify` and `crane` checks would capture projects like Kubernetes that sign outside GitHub.

**Non-GitHub CI detection.** Prow configs, Jenkinsfiles, .gitlab-ci.yml -- these are parseable. Extending the collector to additional CI systems would close the Kubernetes blind spot and others like it.

**Contribution to TAG Security.** This dataset answers the question TOC Issue #1709 poses: what is the supply chain security posture of the CNCF ecosystem? The methodology and data are ready to contribute as a TAG Security work item -- a recurring landscape assessment that turns best-practices guidance into measurable outcomes.
