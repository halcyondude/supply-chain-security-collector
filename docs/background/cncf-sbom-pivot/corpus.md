# The cncf/sbom corpus: what it is, where it lives, how far to trust it

Source read: `cncf/sbom@e74ea3b` (2026-11-26), full history (2,130 commits; it is not a shallow clone). Citation format: `cncf/sbom@e74ea3b:path#Lnn`. Bucket facts come from an anonymous listing of the **public Oracle San Jose endpoint** (`axtwf1hkrwcy…us-sanjose-1`): 2,734 + 8,294 keys. 38 objects were downloaded as a stratified sample (by bucket and upload window, 20–400 KB each).

> **Headline: the publicly listable bucket is stale; the live corpus is reachable through BOMHort.** Every SBOM object on the San Jose endpoint was written between 2026-03-13 and 2026-05-10. About 97% were made by `kubernetes-sigs/bom v0.7.1` and the rest by `mikebom 0.1.0-alpha.*`. **None were made by Waybill.** The current daily Waybill v0.10.0 pipeline writes to whatever `vars.OCI_S3_ENDPOINT` points at, and that value is not in git. CNCF's BOMHort deployment reads buckets with the same names from Linode `https://us-iad-18.linodeobjects.com` (`cncf/automation@64c13a0:ci/cluster/services/apps/bomhort.yaml#L67-L86`), which needs credentials. BOMHort's public REST API lists those 22,214 SBOMs and streams each raw document (`/api/v1/sboms/{id}/download`), so the live corpus can be sampled today; see [gaps: BOMHort API as a data source](gaps-and-engagement.md#bomhort-api-as-a-data-source). For bulk use, ask CNCF staff for a read key or a published index. Sections 1.2–1.5 below describe the *public bucket*; the prototype's measurements of the live corpus are in the [main document](../cncf-sbom-pivot.md#prototype-results).

### 1.1 Generation pipeline

**Inputs** (all in `util/data/`):

| File | Maintained by | Entries | Bucket |
|---|---|---|---|
| `cncf-projects.yaml` | daily landscape sync, 03:00 UTC (`.github/workflows/sync-cncf-projects.yml#L6`) | **239**, exactly one repo per project: 41 graduated, 38 incubating, 160 sandbox | `cncf-project-sboms` |
| `repositories.yaml` | by hand | **34**, all `OmniTrustILM/*` (added 2026-09-11) | `cncf-project-sboms` |
| `discovered-repos.yaml` | weekly org scan, Mon 04:00 (`discover-cncf-repos.yml#L6`) | **2,150**: 406 graduated, 351 incubating, 1,393 sandbox (inherited status); 210 parents; 180 have no `parent_project` | `cncf-subproject-sboms` |
| cncf/sandbox issues `[Sandbox]` | daily poll, 02:17 (`watch-sandbox-applications.yml#L5`) | one snapshot per issue × repo | `sandbox-reviews` |

- The landscape sync takes `repo_url` only, and only for items with status graduated, incubating or sandbox. Non-GitHub repos are skipped (`util/extract-projects/main.go#L164-L176`). Archived projects are absent.
- **Discovery attributes repos by org, not by project.** The map from org to project keeps the *last* project seen per owner (`util/discover-repos/main.go#L323`). Results:
  - All 140 `kubernetes-sigs/*` repos are filed under **Headlamp**, not Kubernetes.
  - 192 `nvidia/*` repos (BigVGAN and others) are filed under **OpenShell**.
  - 112 `alibaba/*` and 46 `containers/*` repos hang off parents that are no longer in the landscape.
- The list is append-only: existing entries are merged back on every run (`main.go#L415`). A repo that is later archived or forked is never dropped. The filter is: not a fork, not archived, has at least one release, and contains any of 16 manifest files, including `Makefile` and `Dockerfile` (`main.go#L192-L209`, `#L362-L388`).
- **Do not use `parent_project` from discovered-repos as graph truth.**

**Plan and worker** (`generate-sbom.yml`, daily 02:00, `#L6`):

```mermaid
flowchart LR
  L[cncf/landscape landscape.yml] -->|daily 03:00 extract-projects| P[cncf-projects.yaml<br/>239 repos]
  P -->|weekly discover-repos<br/>org scan| D[discovered-repos.yaml<br/>2,150 repos]
  M[repositories.yaml<br/>34 manual] --> PL
  P --> PL
  D --> PL
  PL[sbom-plan.sh<br/>GraphQL 50 repos/query<br/>releases first:100, tags first:30] --> SEL{stable tags<br/>published in last 60 days<br/>no prerelease regex<br/>no '/' or '='}
  B[(list both buckets)] --> SEL
  SEL -->|key missing| J[plan.jsonl<br/>~15 items/worker<br/>max 200 workers, 30 parallel]
  J --> W[sbom-worker.sh]
  W --> RA{release asset<br/>*spdx|cdx|cyclonedx|bom*.json<br/>≤100 MB, top 12}
  RA -->|project-wide SPDX 2.x| PP
  RA -->|per-arch or other format| SIDE[_release_spdx / _cdx / _spdx3<br/>kept next to scan]
  RA -->|none| WB[git clone --depth 1 tag<br/>waybill sbom scan<br/>--clearly-defined --no-go-mod-why]
  WB --> PP[postprocess-spdx.sh]
  SIDE --> PPX[postprocess-cdx/spdx3.sh]
  PP --> U[(S3 put-object<br/>OCI_S3_ENDPOINT)]
  PPX --> U
  S[cncf/sandbox issues] -->|daily 02:17| SB[latest stable release<br/>or default-branch SHA] --> WB2[waybill, same flags] --> PP2[postprocess, supplier NOASSERTION] --> U2[(sandbox-reviews)]
```

- **Release selection.** Selection uses GitHub releases that are not drafts or prereleases and were `publishedAt >= now-60d` (`util/sbom-plan.sh#L110`, `#L118-L119`).
  - A prerelease regex runs on the tag. It covers alpha, beta, rc, pre, preview, dev, snapshot, nightly, canary, test, draft, wip and PEP 440 forms (`util/sbom-lib.sh#L147`).
  - Tags containing `/` or `=` are skipped, e.g. kustomize `api/v0.21.3` or otel `pkg==1.2.0` (`sbom-lib.sh#L148-L151`).
  - Only the newest 100 releases and 30 tags are fetched (`sbom-plan.sh#L75`).
  - **Repos with zero GitHub releases** fall back to their newest semver tags, capped at `MAX_RELEASES`=3 and **with no date filter** (`#L120-L121`).
  - Manual `releases_mode=latest` takes the newest N, at most 10 (`generate-sbom.yml#L18-L41`).
- **Dedup** works by the exact `_spdx.json` key (`sbom-plan.sh#L126-L127`). Companion files are never checked. `force_regenerate` re-plans everything.
- **Release-asset import** (`sbom-lib.sh#L104-L133`):
  - A project-wide SPDX 2.x asset *replaces* the Waybill scan.
  - Per-arch assets (regex at `#L91`) are stored *next to* the scan. Only the largest per format is kept.
  - Tag-value SPDX, tarballs and XML are ignored.
  - A non-404 API error fails the item, so it is retried instead of being silently scanned.
- **Waybill invocation** (`sbom-lib.sh#L189-L198`): `waybill sbom scan --path <clone> --format spdx-2.3-json --clearly-defined --no-go-mod-why --root-name owner/repo --root-version <tag> --repo … --git-ref <tag>`.
  - It runs **online**: deps.dev enrichment is on, and `--offline` is not used even though README `#L679` mentions it.
  - ClearlyDefined is opted in.
  - Go `mod why` is off. The reason given is that it misclassifies multi-workspace repos.
  - The version is `WAYBILL_VERSION: v0.10.0` (`generate-sbom.yml#L116`). The sandbox path uses the same flags (`generate-sandbox-sbom.sh#L34-L42`).
- **Post-processing guarantees** (`util/postprocess-spdx.sh#L114-L122`, README `#L548-L554`). These are idempotent and leave everything else untouched:
  - document `name = "<owner>/<repo> <tag>"`
  - root `name`/`versionInfo` = `owner/repo` / `tag`
  - root `downloadLocation = git+https://github.com/<o>/<r>.git@<tag>`
  - root purl `pkg:github/<o>/<r>@<tag>`, which replaces `pkg:generic/…`
  - root `supplier = Organization: <landscape project>` (the parent project for subprojects), or `NOASSERTION`
  - CycloneDX and SPDX 3 imports get the equivalent treatment (`postprocess-cdx.sh#L47-L55`, `postprocess-spdx3.sh#L51-L72`).
- **Upload key** (`util/s3-upload.sh#L48-L61`): `<key_prefix><version>/<flat_prefix>_<version with . → _>_<suffix>`, where the suffix is one of `spdx.json`, `release_spdx.json`, `cdx.json`, `release_cdx.json`, `spdx3.json`, `release_spdx3.json`.

**Generator timeline** (from git):

| Date | Change | Commit |
|---|---|---|
| 2026-02-17 | moved from cncf/automation; `kubernetes-sigs/bom` + go-licenses; SBOMs committed **into git** | 144577e2 |
| 2026-03-21 / 04-22 | switch to S3; SBOMs removed from repo | 70531eb5, 9a2ba8d0, 4d6f00da |
| 2026-05-02 / 05-06 | mikebom alpha.9 → alpha.16 | 5f0d56da, 9de4176a |
| 2026-05-13 → 06-08 | self-hosted runner changes | 017a1823, b3192465 |
| 2026-08-25 → 10-15 | Waybill v0.2.0 → 0.3.0 → 0.9.0 → **0.10.0**, daily cron, release import | de4c6d40, 803c2336, 8cd590ee, 2974ecbe |
| 2026-10-16 | plan + worker matrix | acdd3615 |

- The San Jose buckets stop at 2026-05-10. This matches the move to Linode seen in cncf/automation. BOMHort has pointed at `us-iad-18.linodeobjects.com` since its first config (2026-09-22).
- *Inference:* the endpoint var was repointed between May and August. The repo never names the endpoint; it only reads `vars.OCI_S3_ENDPOINT` (`generate-sbom.yml#L84`).
- **Commit cadence:** 2,061/2,130 commits are by github-actions[bot]. Of those, 1,749 are "update SBOM for …" (Feb–Apr 2026, when SBOMs lived in git); the rest are the daily landscape sync (about 30/month since May), the weekly discovery and tooling-SBOM refreshes.
- **Humans:** Mario Fahlandt 59 (53 + 6 as "Mario"), Jeffrey Sica 4, Koray Oksay 4, Bob Killen 1, arpitjain099 1.
- Since May, the only signal of pipeline activity in git is code changes. Generation output no longer lands in git, and Actions history could not be read from here (HTTP 403).

### 1.2 Formats, key layout, what to key on

| Bucket | Layout (current code) | Observed on San Jose |
|---|---|---|
| `cncf-project-sboms` | `<slug(project)>/<ver>/<slug>_<ver_>_{spdx,release_spdx,cdx,release_cdx,spdx3,release_spdx3}.json` | 2,222 `_spdx.json`, 1 `_release_spdx.json`, **0 cdx/spdx3**; plus `_bomhort/originals/<uuid>/…_spdx.json.gz` (510 objects, 2026-09-18/22: BOMHort's "original store" output, including its own test fixtures such as `payment-api-1.5.0-rc.1.spdx.json.gz`, `ledger-2.0.1.cdx.json.gz`, `a.spdx.json.gz`); `test/manual-check.txt` |
| `cncf-subproject-sboms` | `<slug(parent project)>/<slug(repo)>/<ver>/<parent>_<repo>_<ver_>_….json` | 8,294 `_spdx.json`. **Only about 49% (4,055) sit under the project-slug folder**; 2,957 sit under an owner slug (`kubernetes-sigs/`, `alibaba/`, `vitess/` and `vitessio/`) and 1,282 under the legacy parent-*repo* folder (`headlamp/`, `api/`). The migration (`util/migrate-subproject-keys.sh`, dry-run by default `#L23`) was never applied here. |
| `sandbox-reviews` | `sandbox-applications/<issue>/<owner_lc>/<repo_lc>.spdx.json` + `.started-at` (`util/sandbox-applications.py#L276`, `#L18`) | 404 anonymously |

Anomalies in the legacy data:
- `aeraki-mesh_1.4.0` and `aeraki-mesh_1_4_0` both exist (an old dotted filename).
- 37 keys contain `v`-prefixed or path-segment versions, e.g. `pixie/release/cli/v0.8.5/…`, which predate the `/` skip.
- Project-bucket keys **do not contain owner/repo**. They hold only the landscape project slug, and one repo per project.
- Manual entries are filed under their own `name` slug, e.g. `cli/`, `auth/`, `operator/`, which could collide with a future project of that name.

**A consumer must key on these:**
1. The bucket plus the parsed `<version>` folder.
2. The document's root package: `pkg:github/<owner>/<repo>@<tag>`, `downloadLocation` and `name`/`versionInfo`.

Do not use `creationInfo.creators`, `documentNamespace` or package counts (README `#L568-L571`). Legacy objects predate post-processing. For example, mikebom docs are named `tmp.J8Vi50ubUg` and carry no `pkg:github` purl. Owner/repo must therefore come from creator strings (`source: repo:https://github.com/…`), from the bom-era document annotation (`CNCF Project: … Repository: owner/repo Version: …`), or by matching the key against discovered-repos.

### 1.3 Schema and fill rates by generator

Measured on 38 public objects plus `tooling-sbom/tooling-repo.spdx.json` (Waybill v0.10.0, 2026-10-29, only 33 packages) and `util/tests/data/kagent-v0.10.0-waybill.spdx.json` (Waybill **0.3.0**, 3 packages). All documents are SPDX-2.3 JSON. "Usable" means present and not `NOASSERTION`/`NONE`/empty.

| Field (per package) | bom v0.7.1 (n=20 docs, 251 pkgs) | mikebom α9 (10, 710) | mikebom α16 (8, 387) | Waybill 0.10 (1, 33) |
|---|---|---|---|---|
| versionInfo | 92% | 99.7% | 92% | 24% |
| supplier | 0% | 99% | 88% | 18% |
| downloadLocation | 92% | 0% (all NOASSERTION) | 0% | 0% |
| licenseDeclared | **0%** (absent) | 98% | 89% | 6% |
| licenseConcluded | 99.6% (go-licenses) | 94% | 80% | 6% |
| checksums | 0% (empty arrays) | 93% SHA256/512 | 86% | 70% |
| purl | 92%, all `golang` | 100% (golang 691, generic 12, npm 7) | 100% (golang 340, pypi 46) | 36% (golang 7, generic 5) |
| per-package annotations | none | `mikebom:*` on 99% | 99.7% | 97% |
| files[] | 1,933 (CONTAINS) | 0 | 0 | 0 |

The Waybill column is the repo's own tooling scan (committed Go binaries and GitHub Actions), so its low fill rates are not representative of a project scan.

**Relationships:**

| Generator | Relationships seen |
|---|---|
| bom | `CONTAINS` 1,933 and `DEPENDS_ON` 231, **all from the root**: a flat fan-out with no `DESCRIBES` (`documentDescribes` only). 7 of 20 docs have no dependencies at all. |
| mikebom α9 | `DESCRIBES` only. 9 of 10 docs have **zero dependency edges**: packages without a graph. |
| mikebom α16 | `DEPENDS_ON` 1,278 from 188 distinct sources (a real graph), `TEST_DEPENDENCY_OF` 72, `DESCRIBES` |
| Waybill 0.10 | `DEPENDS_ON` and `DESCRIBES`. Per README and code it also emits `BUILD_/DEV_/TEST_DEPENDENCY_OF` and `waybill:lifecycle-scope` (README `#L528`), but neither appears in the tiny public sample. |

**Waybill 0.10 annotation vocabulary.** Annotations are JSON in `annotation.comment`, with `schema: waybill-annotation/v1` and fields `field` and `value`.
- *Document level:* `waybill:graph-completeness` (`partial`) with a `-reason`, `waybill:go-transitive-coverage` (`complete`), `go-transitive-fallback-count`, `unresolved-declared-dep-count`, `deps-dev-outcomes`, `generation-context` (`filesystem-scan`), `cisa-2026-lifecycle` (`after-build`), `workspaces-detected`, `go-cache-warming-mode`, `file-inventory-skipped-build-dirs`, `trace-integrity-*`, `compositions`.
- *Package level:* `waybill:sbom-tier` (source, analyzed, …), `component-tier`, `source-files`, `file-paths`, `evidence.identity` (`{confidence, technique}`), `evidence.occurrences` (`{location, sha256}`), `deps-dev-match`/`-outcome`, `cpe-candidates`, `workspace-member`, `go-transitive-source`, `detected-go`, `produces-binaries`, `binary-class`/`-stripped`/`-packed`, `linkage-kind`, `elf-build-id`, `not-linked`, `demoted-from-main-module`.
- mikebom uses the same model with a `mikebom:` prefix.
- **Note:** Waybill does inventory *binaries committed to the source tree* (ELF build ID, linkage), but never release binaries.

**What is not in any of it:**
- vulnerabilities (no VEX)
- signatures or attestations (objects are unsigned and there is no checksum manifest)
- build provenance (SLSA)
- container images
- shipped binaries, except per-arch `_release_*` imports
- licence text, beyond `hasExtractedLicensingInfo` in bom-era docs
- the *commit SHA* of tagged scans; only the tag is recorded. Sandbox snapshots do record the SHA.

### 1.4 Coverage against the collector (PR #120 snapshot, 266 repos)

The joined table is in [`coverage.csv`](coverage.csv): 2,449 rows (one per owner/repo across both sides), with flags, sbom-side source/status, collector project/maturity, and stored object, version and byte counts.

| | Count |
|---|---|
| Repos in the cncf/sbom inputs (union) | 2,422 (239 + 34 + 2,149 discovered; 1 overlaps) |
| Collector repos (`base_repositories`, PR #120) | 266 |
| **In both** | **239**: exactly the `cncf-projects.yaml` set, since both derive from landscape `repo_url` |
| Only in the collector | 27: 26 **archived** projects (Brigade, rkt, Krustlet, SMI, Keptn, …) and `composefs/composefs` |
| Only in cncf/sbom | 2,183: 2,149 discovered subproject repos and the 34 OmniTrustILM repos |

How much is actually stored (San Jose, frozen May 2026):

| Collector maturity | Repos | In sbom inputs | ≥1 SBOM stored |
|---|---|---|---|
| graduated | 41 | 41 | **39** (missing: `open-telemetry/community` (the landscape repo has no releases), `spiffe/spiffe`) |
| incubating | 38 | 38 | **36** (missing: `tektoncd/pipeline`, `flatcar/flatcar`) |
| sandbox | 158 | 158 | **135** (23 missing; mostly projects accepted after May 2026, plus `velero-io/velero`, `gvisor/gvisor`, `kuberay-project/kuberay` after org moves) |
| archived | 26 | 0 | 0 |

- Discovered repos with at least one stored SBOM: **974 of 2,149 (45%)**.
- Manual OmniTrustILM repos: 0 of 34 (they were added after the freeze).
- Median versions per repo: 9 for projects (max 31) and 6 for subprojects (max 43).
- 34 objects sit under folders that match no current input, e.g. `serverless-workflow/`, `vineyard/`, `podman/`, `argo-cd/`.

### 1.5 Freshness and history depth

- **README says "weekly"** (`README.md#L17`). **The cron is daily at 02:00** (`generate-sbom.yml#L6`; README `#L141` also says daily). The weekly figure is stale text from the batch era.
- **The 60-day window is a catch-up horizon, not a retention policy.** Nothing in the pipeline deletes objects, so history accumulates from the first scan onward. Back-history beyond 60 days exists only from manual `latest` runs (up to 10 releases) and from the Feb–Apr backfill.
- **A repo with GitHub releases but none in the last 60 days is never scanned by the cron.** A repo with *no* releases is always considered, via its 3 newest semver tags, with no date filter. Adding a repo does not backfill (README `#L180-L183`).
- **Dedup is by key, so a published SBOM is never refreshed.** Later improvements to Waybill or ClearlyDefined do not reach old versions unless `force_regenerate` is used. Different versions of a repo can therefore come from different generators, and the frozen public set already mixes three.
- The only freshness signals are S3 `last_modified` and `creationInfo.created`. There is no manifest or index in the bucket; `util/generate-index` runs only locally.

### 1.6 Known limits and biases

- **Disclaimer:** these are *"NOT official SBOMs"*, provided "AS IS" (`README.md#L7-L15`). Every edge in our graph inherits this caveat.
- **They are source scans, not scans of built artifacts.** A shallow clone of the tag is scanned and no build runs (sandbox README `#L230`). This is a manifest/lockfile view: vendored, generated or binary-embedded dependencies are missed, as are base images.
- **Coverage depends on lockfiles.** Edges exist only where lockfiles exist (`go.sum`, `Cargo.lock`, `package-lock.json`). Python `requirements.txt` gives only ranges (`*:requirement-range`), and npm without a lockfile has no graph.
- **Go transitive coverage** is self-reported. Running with `--no-go-mod-why` means runtime vs build is only approximated through `*_DEPENDENCY_OF`. In sampled mikebom α16 docs, 6 of 8 report `graph-completeness=partial` (`go:unresolved-indirect-require`).
- **Release imports keep only the largest per-binary SBOM per format** (kubevela ships two components and only one is kept; README `#L615`). Imported docs lack scopes and quality annotations. A project-wide import fully *replaces* the Waybill scan, so for flux2 and k6 the stored `_spdx.json` is syft output, not Waybill.
- **Attribution bias:** org-level discovery mislabels parents (Headlamp gets all of kubernetes-sigs; OpenShell gets all of nvidia), and the subproject status is inherited from the parent. Weight project-level metrics by `cncf-projects.yaml` repos, not by discovered counts.
- **Ecosystem skew** in the public corpus: about 97% are bom-era objects, which are **Go-only** (all purls `golang`). Licence data is only `licenseConcluded` from go-licenses, and checksums are empty. They are fit for presence and coverage facts, but not for a dependency graph.

| Upload window | Objects | GB | Generator (sampled) |
|---|---|---|---|
| 2026-03-13 → 04-26 | 10,176 | 25.2 | bom v0.7.1 (+ go-licenses) |
| 2026-05-03 | 175 | 0.14 | mikebom 0.1.0-alpha.9 |
| 2026-05-10 | 166 | 0.26 | mikebom 0.1.0-alpha.16 |

**Implication for the collector pivot:** in the public data, only the 166 mikebom-α16 objects carry a real multi-level `DEPENDS_ON` graph. Building "graph from cncf/sbom first" therefore reads the live corpus through BOMHort (as the prototype does), and later from a read key or a published index. Treat the San Jose data as a legacy inventory snapshot.
