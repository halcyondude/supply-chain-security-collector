# known gaps: what we can't see from github

**March 2026** | Research into where CNCF supply chain artifacts actually live, beyond GitHub release assets and GitHub Actions workflows.

Our tool queries GitHub releases and workflow files. Many CNCF projects -- especially graduated ones -- publish supply chain artifacts through channels we do not observe: OCI registries, non-GitHub CI systems, package managers, and the GitHub Attestations API. This document maps the known gaps.

---

## by project

| project | what we see | what actually exists | where it lives | source |
|---------|------------|---------------------|----------------|--------|
| **Kubernetes** | 0 workflows, 0 SBOMs, 0 signatures in GitHub releases | cosign keyless signing of all binary artifacts (tarballs, SPDX files, binaries); SPDX SBOMs for every release; SLSA provenance attestations; cosign-signed container images replicated across 20+ regional mirrors | `registry.k8s.io` (images + cosign signatures), `sbom.k8s.io` (SPDX SBOMs), krel + kpromo release tooling, Prow CI | [Verify Signed Kubernetes Artifacts](https://kubernetes.io/docs/tasks/administer-cluster/verify-signed-artifacts/), [Image Promoter Rewrite](https://kubernetes.io/blog/2026/03/17/image-promoter-rewrite/), [kubernetes/release krel docs](https://github.com/kubernetes/release/tree/master/docs/krel), [kubernetes-sigs/bom](https://github.com/kubernetes-sigs/bom), [SLSA Level 1 compliance issue](https://github.com/kubernetes/release/issues/2267) |
| **Helm** | 684 signatures, 0 SBOMs in GitHub releases | PGP provenance files (`.prov`) for every packaged chart; cosign signatures supported for OCI-pushed charts; no evidence of SBOM publication in any channel | GitHub release assets (`.prov` files via `helm package --sign`), OCI registries (cosign for OCI-format charts) | [Helm Provenance and Integrity](https://helm.sh/docs/topics/provenance/), [Helm chart keyless signing with Cosign](https://tech.aabouzaid.com/2023/08/helm-chart-keyless-signing-with-sigstore-cosign.html) |
| **Prometheus** | 0 SBOMs, 0 signatures in GitHub releases | Container images published to quay.io and Docker Hub via `promu` build tool; historical Docker Content Trust signing (partially broken -- node_exporter images after v0.18.0 lacked signatures); no evidence of cosign signing or SBOM generation | `quay.io/prometheus/prometheus`, `hub.docker.com/r/prom/prometheus`, built via promu | [Prometheus Installation docs](https://prometheus.io/docs/prometheus/latest/installation/), [node_exporter signatures issue #1424](https://github.com/prometheus/node_exporter/issues/1424), [promu tool](https://github.com/prometheus/promu) |
| **containerd** | 0 SBOMs, 0 signatures but attestation artifacts present in GitHub releases | GPG-signed git tags; GitHub Attestations API with SLSA v1 provenance; `actions/attest-build-provenance` in release workflow; attestation artifacts published as release assets | GitHub release assets (attestation JSON), GitHub Attestations API, GPG-signed tags | [containerd PR #11049 - publish attestation](https://github.com/containerd/containerd/pull/11049), [containerd PR #10543 - generate attestation](https://github.com/containerd/containerd/pull/10543), [containerd RELEASES.md](https://github.com/containerd/containerd/blob/main/RELEASES.md) |
| **Envoy** | 0 of everything in GitHub releases | Built with Bazel; CI on Azure Pipelines (not GitHub Actions); container images on Docker Hub; no public evidence of cosign signing, SBOMs, or provenance attestations on released artifacts | `hub.docker.com/r/envoyproxy/envoy`, Azure Pipelines CI, Bazel build system | [Envoy building docs](https://www.envoyproxy.io/docs/envoy/latest/start/building), [Envoy DEVELOPER.md](https://github.com/envoyproxy/envoy/blob/main/DEVELOPER.md) |
| **Istio** | SBOMs but no signatures in our data | cosign signing of all container images since Istio 1.12 (2021); public key published at `istio.io/misc/istio-key.pub`; images verifiable with `cosign verify`; signing uses a static key (not keyless) | `gcr.io/istio-release/*` (cosign-signed images), `hub.docker.com/u/istio` | [Istio Image Signing and Validation](https://istio.io/latest/docs/ops/best-practices/image-signing-validation/), [Istio cosign v2 issue #44362](https://github.com/istio/istio/issues/44362) |
| **CoreDNS** | 0 of everything in GitHub releases | Container images on Docker Hub; dedicated `coredns/release` repo with release automation; no public evidence of cosign signing or SBOM generation on official images | `hub.docker.com/r/coredns/coredns`, `github.com/coredns/release` | [CoreDNS releases](https://github.com/coredns/coredns/releases), [coredns/release actions](https://github.com/coredns/release/actions) |
| **etcd** | 0 of everything in GitHub releases | Container images at `gcr.io/etcd-development/etcd` and `quay.io/coreos/etcd`; part of Kubernetes ecosystem but has its own release process under `etcd-io`; no public evidence of cosign signing or SBOM generation | `gcr.io/etcd-development/etcd`, `quay.io/coreos/etcd`, GitHub releases (binaries only) | [etcd releases](https://github.com/etcd-io/etcd/releases) |
| **Linkerd** | 0 of everything in GitHub releases (open source) | Open source Linkerd2 uses GitHub Actions for CI; container images published to `ghcr.io`; Buoyant Enterprise for Linkerd (BEL) ships cosign-signed images with SBOM and SLSA v0.2 provenance as OCI 1.1 referrers since v2.15 (enhanced in v2.19); open source Linkerd does not appear to sign images | Open source: `ghcr.io/linkerd/*`; Enterprise: BEL registry with OCI 1.1 referrers | [Linkerd Enterprise 2.19 announcement](https://www.buoyant.io/blog/linkerd-enterprise-2-19-windows-service-mesh-post-quantum-cryptography-supply-chain-security-fips-140-3-and-a-new-on-cluster-dashboard), [Verifying signed BEL artifacts](https://docs.buoyant.io/buoyant-enterprise-linkerd/latest/guides/verifying-signed-artifacts/) |
| **Harbor** | 0 SBOMs, 0 signatures in GitHub releases | Harbor *enables* cosign signing and notation for images stored in Harbor registries (since v2.5); Harbor CLI release process uses cosign signing via GitHub Actions; open issue for SBOM integration in Harbor itself; no evidence that Harbor project's own container images are signed | Harbor as a product supports cosign; Harbor CLI releases are signed; Harbor's own images status unclear | [Harbor Cosign integration](https://goharbor.io/docs/2.13.0/working-with-projects/working-with-images/sign-images/), [Harbor SBOM integration issue #22471](https://github.com/goharbor/harbor/issues/22471), [Harbor CLI RELEASE.md](https://github.com/goharbor/harbor-cli/blob/main/RELEASE.md) |

---

## by artifact type

### OCI registry signatures

Projects that sign container images with cosign or notation, storing signatures in OCI registries rather than GitHub releases:

| project | signing method | registry | verification command | evidence quality |
|---------|---------------|----------|---------------------|-----------------|
| **Kubernetes** | cosign keyless (via kpromo) | `registry.k8s.io` | `cosign verify --certificate-identity ...` | Strong -- official docs, blog posts, code |
| **Istio** | cosign with static key | `gcr.io/istio-release/*` | `cosign verify --key https://istio.io/misc/istio-key.pub` | Strong -- official docs since 1.12 |
| **Harbor CLI** | cosign with key | Harbor registry | via cosign | Moderate -- documented in RELEASE.md |
| **Linkerd (Enterprise)** | cosign with OCI 1.1 referrers | BEL registry | `cosign verify` + `oras` | Strong -- documented in BEL docs |

**Not signing images (as far as evidence shows):** Prometheus (broken/inconsistent Docker Content Trust), containerd (GPG tags but no cosign on images), Envoy, CoreDNS, etcd, open-source Linkerd.

**Estimated total CNCF projects with OCI registry signatures:** 15-25. Beyond the projects researched above, projects like Flux, Tekton, cert-manager, Kyverno, and others in the sigstore ecosystem likely sign images. Our tool sees none of this.

### non-GitHub CI

Major CNCF projects using CI systems other than GitHub Actions for builds and/or releases:

| CI system | projects | notes |
|-----------|----------|-------|
| **Prow** | Kubernetes, Kubernetes SIGs, Knative, cert-manager, Istio (partial), Falco | Kubernetes-native CI; ~6-10 major projects. Our workflow scanning sees nothing from Prow. |
| **Azure Pipelines** | Envoy | Primary CI for Envoy builds and tests |
| **Jenkins** | Various older CNCF projects | Declining usage but still present |
| **GitLab CI** | `gitlab.cncf.ci` mirror exists | CNCF maintains GitLab mirrors; some projects use GitLab CI |
| **Tekton** | Tekton itself, some CD Foundation projects | Kubernetes-native CI/CD; limited adoption outside Tekton ecosystem |

**Estimated impact:** ~15-20 CNCF projects have significant CI activity outside GitHub Actions. For projects like Kubernetes and Envoy, 100% of their release automation is invisible to our tool.

Sources: [Prow overview](https://docs.prow.k8s.io/docs/overview/), [Falco on Prow/AWS](https://aws.amazon.com/blogs/opensource/how-falco-uses-prow-on-aws-for-open-source-testing/), [Envoy building docs](https://www.envoyproxy.io/docs/envoy/latest/start/building)

### package manager provenance

Package manager attestations and provenance are a growing channel for supply chain metadata that our tool does not observe:

| ecosystem | mechanism | CNCF relevance |
|-----------|-----------|----------------|
| **npm** | Trusted Publishers + provenance statements via GitHub OIDC | CNCF JS projects (e.g., OpenTelemetry JS SDK, Backstage plugins) could publish npm provenance. Adoption status unknown. |
| **PyPI** | Digital attestations (SLSA provenance + PyPI Publish) | CNCF Python projects (e.g., OpenTelemetry Python SDK) could publish PyPI attestations. Adoption status unknown. |
| **Go modules** | `sum.golang.org` transparency log | All Go-based CNCF projects benefit from Go module checksum transparency. Not a project-level practice. |
| **OCI/Helm** | cosign signatures on OCI artifacts | Covered in OCI registry signatures section above. |

**Estimated impact:** Low-to-moderate. Most CNCF projects distribute Go binaries and container images, not npm/PyPI packages. The OpenTelemetry SDKs are the main exception -- they span many language ecosystems.

Sources: [npm provenance](https://docs.npmjs.com/generating-provenance-statements/), [PyPI attestations](https://blog.deps.dev/pypi-attestations/), [CNCF public sector supply chain paper](https://www.cncf.io/wp-content/uploads/2025/11/cncf_wp_publicsector_111025a.pdf)

### GitHub Attestations API

GitHub's Attestations API (`actions/attest-build-provenance`, `gh attestation verify`) stores SLSA provenance separately from release assets. Our tool does not query this API.

| project | evidence of usage | source |
|---------|------------------|--------|
| **containerd** | Confirmed -- PRs #10543 and #11049 add `actions/attest-build-provenance` to release workflow | [containerd PR #10543](https://github.com/containerd/containerd/pull/10543), [containerd PR #11049](https://github.com/containerd/containerd/pull/11049) |
| **containerd/nerdctl** | Confirmed -- release workflow includes `attestations: write` permission | [nerdctl release.yml](https://github.com/containerd/nerdctl/blob/main/.github/workflows/release.yml) |

**Estimated total CNCF projects using GitHub Attestations API:** 10-20. The action is straightforward to add to any GitHub Actions release workflow. Any project already using `slsa-github-generator` (13 repos in our data) is a candidate. This is a growing channel -- GitHub made attestations GA in June 2024 -- and we are completely blind to it.

Sources: [actions/attest-build-provenance](https://github.com/actions/attest-build-provenance), [GitHub Attestations docs](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

---

## coverage estimate

### of the "198 projects with no observed artifacts," how many likely DO have supply chain practices invisible to our tool?

| category | estimated count | confidence | reasoning |
|----------|---------------:|------------|-----------|
| Projects with OCI registry signatures (cosign/notation on images) | 15-25 | Medium | Kubernetes, Istio, and sigstore ecosystem projects confirmed. Projects using goreleaser with signing enabled, Chainguard-influenced projects, and OpenSSF-aligned projects likely sign. |
| Projects with non-GitHub CI doing supply chain work | 10-15 | Medium | Prow ecosystem (~6-10), Azure Pipelines (Envoy), Jenkins holdouts. Some of these do signing/SBOM work in their non-GitHub CI. |
| Projects using GitHub Attestations API | 10-20 | Low | Growing fast since GA in June 2024. The 13 projects already using slsa-github-generator are likely candidates. |
| Projects with package manager provenance | 3-8 | Low | Mainly OpenTelemetry language SDKs and Backstage ecosystem. |
| **Total unique projects with invisible practices** | **25-40** | **Medium** | Accounting for overlap (e.g., Kubernetes is in both OCI and non-GitHub CI categories). |

### summary

Of the ~198 projects where we observe zero supply chain artifacts, roughly **25-40 (13-20%)** likely have supply chain security practices that are invisible to our GitHub-only observation window. The remaining ~160 projects genuinely appear to lack supply chain artifact production in any channel.

The projects most affected by our blind spots are the biggest and most mature ones: **Kubernetes, Istio, Envoy, and Prometheus**. These are exactly the projects a CNCF audience would expect to see doing well -- and exactly the ones our tool undercounts.

### what this means for the presentation

When presenting findings, we need to say:

> "We observe that 83.9% of CNCF projects do not ship SBOMs in GitHub release assets. However, our tool has known blind spots. Kubernetes signs every release artifact with cosign and publishes SPDX SBOMs -- we just can't see it from GitHub. Istio has signed all container images since 2021. We estimate 25-40 projects have supply chain practices invisible to our current observation methods. The gap is real, but not as stark as the raw numbers suggest."

### recommended tool enhancements to close gaps

1. **Query the GitHub Attestations API** -- `gh attestation list` for each repo would reveal SLSA provenance we currently miss
2. **Probe OCI registries** -- `cosign tree <image>` for known container images would reveal signatures, SBOMs, and attestations
3. **Parse goreleaser configs** -- Many projects using goreleaser have signing enabled in `.goreleaser.yml` but we don't detect this
4. **Check for Prow/non-GitHub CI markers** -- Presence of `OWNERS` files, `/test-infra` references, or Prow config files signals non-GitHub CI
5. **Query package registries** -- npm provenance and PyPI attestations are queryable via registry APIs

---

*Generated 2026-03-30. Evidence gathered via web search; URLs verified at time of research. Some projects may have adopted or dropped practices since sources were published.*
