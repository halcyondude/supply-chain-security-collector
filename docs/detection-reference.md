# Supply Chain Security Detection Reference

This document provides a comprehensive catalog of all supply chain security tools, formats, and artifacts that our system can detect. It serves as both documentation and a roadmap for future enhancements.

## Summary Table

| Category                                 | Query | Report | Source   | Pattern                                           |
|------------------------------------------|-------|--------|----------|---------------------------------------------------|
| **SBOM Formats**                         |       |        |          |                                                   |
| SPDX                                     | ✅    | ✅      | Artifact | `(?i)\\b(spdx\|\.spdx)\\b`                        |
| CycloneDX                                | ✅    | ✅      | Artifact | `(?i)\\b(cyclonedx\|cdx\|\.cdx)\\b`               |
| SWID Tags                                | ✅     | ❌     | Artifact | `(?i)\\b(swid\|\.swidtag)\\b`                     |
| **Signatures & Attestations**            |        |        |          |                                                   |
| Standard Signatures (.sig, .asc, .pem)   | ✅     | ✅      | Artifact | `(?i)\\.(sig\|asc\|pem\|pub)$`                    |
| Generic Attestations                     | ✅     | ✅      | Artifact | `(?i)attestation`                                 |
| VEX Documents                            | ✅     | ✅      | Artifact | `(?i)\\b(vex\|\.vex)\\b`                          |
| SLSA Provenance                          | ✅     | ✅      | Artifact | `(?i)\\b(provenance\|slsa\|\.intoto\.jsonl)\\b`   |
| In-toto Links                            | ✅     | ✅      | Artifact | `(?i)\\b(link\|\.link)\\b`                        |
| In-toto Layouts                          | ✅     | ✅      | Artifact | `(?i)\\b(layout\|\.layout)\\b`                    |
| Sigstore Bundles                         | ✅     | ✅      | Artifact | `(?i)\.bundle$`                                   |
| Container Attestations                   | ✅     | ✅      | Artifact | `(?i)\\b(cosign\|rekor\|fulcio)\\b`               |
| License Files                            | ✅     | ✅      | Artifact | `(?i)\\b(license\|copying\|notice)\\b`            |
| **SBOM Generation Tools**                |        |        |          |                                                   |
| Syft                                     | ✅     | ✅      | CI       | `(?i)\\bsyft\\b`                                  |
| Trivy                                    | ✅     | ✅      | CI       | `(?i)\\btrivy\\b`                                 |
| CycloneDX Generator                      | ✅     | ✅      | CI       | `(?i)\\bcdxgen\\b`                                |
| SPDX SBOM Generator                      | ✅     | ✅      | CI       | `(?i)\\bspdx-sbom-generator\\b`                   |
| Tern                                     | ✅     | ✅      | CI       | `(?i)\\b(tern-tools/tern\|tern.*sbom)\\b`         |
| Bomber                                   | ❌     | ❌      | CI       | `(?i)\\bdevops-kung-fu/bomber\\b`                 |
| OSS Review Toolkit (ORT)                 | ❌     | ❌      | CI       | `(?i)\\boss-review-toolkit\|ort-project\\b`       |
| **Signing & Attestation Tools**          |        |        |          |                                                   |
| Cosign                                   | ✅     | ✅      | CI       | `(?i)\\bcosign\\b`                                |
| Sigstore                                 | ✅     | ✅      | CI       | `(?i)\\bsigstore\\b`                              |
| SLSA GitHub Generator                    | ✅     | ✅      | CI       | `(?i)\\bslsa-github-generator\\b`                 |
| Notation                                 | ✅     | ✅      | CI       | `(?i)\\b(notation\|notaryproject)\\b`             |
| Witness                                  | ❌     | ❌      | CI       | `(?i)\\btestifysec/witness\\b`                    |
| Kyverno                                  | ❌     | ❌      | CI       | `(?i)\\bkyverno\\b`                               |
| **Vulnerability Scanners**               |        |        |          |                                                   |
| Snyk                                     | ✅     | ✅      | CI       | `(?i)\\bsnyk\\b`                                  |
| Anchore/Grype                            | ✅     | ✅      | CI       | `(?i)\\b(anchore\|grype)\\b`                      |
| Trivy                                    | ✅     | ✅      | CI       | `(?i)\\btrivy\\b`                                 |
| Clair                                    | ✅     | ✅      | CI       | `(?i)\\bclair\\b`                                 |
| Docker Scout                             | ✅     | ✅      | CI       | `(?i)\\bdocker.*scout\\b`                         |
| Twistlock                                | ✅     | ❌      | CI       | `(?i)\\btwistlock\\b`                             |
| Aqua                                     | ✅     | ❌      | CI       | `(?i)\\baqua\\b`                                  |
| **Dependency Scanners**                  |        |        |          |                                                   |
| Dependabot                               | ✅     | ✅      | CI       | `(?i)\\bdependabot\\b`                            |
| Renovate                                 | ✅     | ✅      | CI       | `(?i)\\brenovate\\b`                              |
| WhiteSource                              | ✅     | ✅      | CI       | `(?i)\\bwhitesource\\b`                           |
| FOSSA                                    | ✅     | ✅      | CI       | `(?i)\\bfossa\\b`                                 |
| **Code Scanners**                        |        |        |          |                                                   |
| CodeQL                                   | ✅     | ✅      | CI       | `(?i)\\bcodeql\\b`                                |
| Semgrep                                  | ✅     | ✅      | CI       | `(?i)\\bsemgrep\\b`                               |
| Bandit                                   | ✅     | ✅      | CI       | `(?i)\\bbandit\\b`                                |
| ESLint Security                          | ✅     | ❌      | CI       | `(?i)\\beslint-security\\b`                       |
| **Build & Release Tools**                |        |        |          |                                                   |
| GoReleaser                               | ✅     | ✅      | CI       | `(?i)\\bgoreleaser/goreleaser-action\\b`          |
| **License & Compliance**                 |        |        |          |                                                   |
| Scancode                                 | ❌     | ❌      | CI       | `(?i)\\bscancode\\b`                              |
| Licensee                                 | ❌     | ❌      | CI       | `(?i)\\blicensee\\b`                              |
| **Policy & Governance**                  |        |        |          |                                                   |
| Open Policy Agent (OPA)                  | ❌     | ❌      | CI       | `(?i)\\bopen-policy-agent\|opa\\b`                |
| Rego Policies                            | ❌     | ❌      | Artifact | `(?i)\.rego$`                                     |

**Legend:**
- ✅ = Fully functional
- ❌ = Not yet implemented
- **Query** = Can detect in SQL queries
- **Report** = Included in generated reports
- **Source** = Where the pattern is matched (Artifact = release assets, CI = workflow files)
- **Pattern** = Regular expression used for detection

**Regex Syntax Notes:**
- `(?i)` = Case-insensitive matching
- `\\b` = Word boundary (double backslash is needed for SQL string escaping)
- `\\d` = Digit character
- `\\.` = Literal dot/period (escaped)
- `|` = OR operator (e.g., `spdx|cdx` matches either "spdx" or "cdx")
- `.*` = Match any character, zero or more times
- `$` = End of string anchor
- The double backslashes (`\\`) you see are due to SQL string literal escaping - in the actual regex engine, they become single backslashes

---

## Table of Contents

### SBOM Formats
- [SPDX](#spdx)
- [CycloneDX](#cyclonedx) 
- [SWID Tags](#swid-tags)

### Signatures & Attestations
- [Standard Signatures](#standard-signatures)
- [Generic Attestations](#generic-attestations)
- [VEX Documents](#vex-documents)
- [SLSA Provenance](#slsa-provenance)
- [In-toto Links](#in-toto-links)
- [In-toto Layouts](#in-toto-layouts)
- [Sigstore Bundles](#sigstore-bundles)
- [Container Attestations](#container-attestations)
- [License Files](#license-files)

### SBOM Generation Tools
- [Syft](#syft)
- [Trivy](#trivy)
- [CycloneDX Generator](#cyclonedx-generator)
- [SPDX SBOM Generator](#spdx-sbom-generator)
- [Tern](#tern)
- [Bomber](#bomber) ❌
- [OSS Review Toolkit (ORT)](#oss-review-toolkit-ort) ❌

### Signing & Attestation Tools
- [Cosign](#cosign)
- [Sigstore](#sigstore)
- [SLSA GitHub Generator](#slsa-github-generator)
- [Notation](#notation)
- [Witness](#witness) ❌
- [Kyverno](#kyverno) ❌

### Vulnerability Scanners
- [Snyk](#snyk)
- [Anchore/Grype](#anchoregrype)
- [Trivy](#trivy-scanner)
- [Clair](#clair)
- [Docker Scout](#docker-scout)
- [Twistlock](#twistlock)
- [Aqua](#aqua)

### Dependency Scanners
- [Dependabot](#dependabot)
- [Renovate](#renovate)
- [WhiteSource](#whitesource)
- [FOSSA](#fossa)

### Code Scanners
- [CodeQL](#codeql)
- [Semgrep](#semgrep)
- [Bandit](#bandit)
- [ESLint Security](#eslint-security)

### Build & Release Tools
- [GoReleaser](#goreleaser)

### License & Compliance
- [Scancode](#scancode) ❌
- [Licensee](#licensee) ❌

### Policy & Governance
- [Open Policy Agent (OPA)](#open-policy-agent-opa) ❌
- [Rego Policies](#rego-policies) ❌

---

## SBOM Formats

### SPDX

**Status:** ✅ Implemented, ✅ Reported

**Description:** Software Package Data Exchange (SPDX) is an open standard for communicating software bill of materials (SBOM) information. Created by the Linux Foundation, it's one of the most widely adopted SBOM formats.

**Documentation:** https://spdx.dev/

**Detection Pattern:**
```sql
-- File name contains SPDX indicators
REGEXP_MATCHES(ra.name, '(?i)\b(spdx|\.spdx)\b')

-- Classified as SPDX format
CASE WHEN REGEXP_MATCHES(ra.name, '(?i)\b(spdx|\.spdx)\b') THEN 'spdx'
```

**Typical Artifacts:**
- `project-v1.0.0.spdx.json`
- `sbom.spdx`
- `software-bill-of-materials.spdx.xml`
- `dependencies.spdx.rdf`

**Generated By:** SPDX SBOM Generator, Syft, Trivy, ORT, commercial tools

---

### CycloneDX

**Status:** ✅ Implemented, ✅ Reported

**Description:** CycloneDX is a full-stack SBOM standard designed for application security contexts. It supports vulnerability disclosure, license compliance, and operational analytics.

**Documentation:** https://cyclonedx.org/

**Detection Pattern:**
```sql
-- File name contains CycloneDX indicators
REGEXP_MATCHES(ra.name, '(?i)\b(cyclonedx|cdx|\.cdx)\b')

-- Classified as CycloneDX format
CASE WHEN REGEXP_MATCHES(ra.name, '(?i)\b(cyclonedx|cdx|\.cdx)\b') THEN 'cyclonedx'
```

**Typical Artifacts:**
- `bom.cyclonedx.json`
- `sbom.cdx.xml`
- `project-dependencies.cyclonedx`
- `vulnerability-disclosure.cdx.json`

**Generated By:** CycloneDX Generator, Syft, Trivy, OWASP tools

---

### SWID Tags

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Software Identification (SWID) tags are an ISO/IEC 19770-2 standard for software identification. Used primarily in enterprise and government environments for software inventory and compliance.

**Documentation:** https://csrc.nist.gov/projects/software-identification-swid

**Detection Pattern:**
```sql
-- File name contains SWID indicators
REGEXP_MATCHES(ra.name, '(?i)\b(swid|\.swidtag)\b') as is_swid_tag
```

**Typical Artifacts:**
- `software.swidtag`
- `product-swid-tag.xml`
- `component.swid.json`

**Generated By:** Enterprise software management tools, NIST tools, commercial SWID generators

---

## Signatures & Attestations

### Standard Signatures

**Status:** ✅ Implemented, ✅ Reported

**Description:** Cryptographic signatures used to verify the authenticity and integrity of release artifacts. Common formats include GPG signatures, PGP signatures, and key files.

**Documentation:** 
- GPG: https://gnupg.org/
- PGP: https://tools.ietf.org/html/rfc4880

**Detection Pattern:**
```sql
-- File extensions indicating signature files
REGEXP_MATCHES(ra.name, '(?i)\.(sig|asc|pem|pub)$')
```

**Typical Artifacts:**
- `binary-v1.0.0.tar.gz.sig` (detached signature)
- `checksums.txt.asc` (ASCII-armored GPG signature)
- `release.pem` (PEM certificate)
- `signing-key.pub` (public key)

**Generated By:** GPG, PGP, OpenSSL, Cosign, manual signing processes

---

### Generic Attestations

**Status:** ✅ Implemented, ✅ Reported

**Description:** Generic attestation files that provide cryptographic evidence about software artifacts, build processes, or security properties.

**Documentation:** https://github.com/in-toto/attestation

**Detection Pattern:**
```sql
-- File name contains attestation indicators
REGEXP_MATCHES(ra.name, '(?i)attestation')
```

**Typical Artifacts:**
- `build-attestation.json`
- `security-attestation.jsonl`
- `test-attestation.txt`

**Generated By:** Various attestation frameworks, build systems, security tools

---

### VEX Documents

**Status:** ✅ Implemented, ✅ Reported

**Description:** Vulnerability Exploitability eXchange (VEX) documents provide information about the exploitability status of vulnerabilities in software components. Part of the emerging supply chain transparency ecosystem.

**Documentation:** https://www.cisa.gov/sites/default/files/publications/VEX_Use_Cases_April2022.pdf

**Detection Pattern:**
```sql
-- File name contains VEX indicators
REGEXP_MATCHES(ra.name, '(?i)\b(vex|\.vex)\b')
```

**Typical Artifacts:**
- `vulnerabilities.vex.json`
- `security-advisory.vex`
- `exploit-status.vex.xml`

**Generated By:** Security scanners, vulnerability management tools, manual security assessments

---

### SLSA Provenance

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Supply-chain Levels for Software Artifacts (SLSA) provenance attestations provide tamper-resistant evidence of build processes and artifact origins.

**Documentation:** https://slsa.dev/

**Detection Pattern:**
```sql
-- File name contains SLSA/provenance indicators
REGEXP_MATCHES(ra.name, '(?i)\b(provenance|slsa|\.intoto\.jsonl)\b')
```

**Typical Artifacts:**
- `build-provenance.slsa.json`
- `artifact.intoto.jsonl`
- `provenance-statement.json`

**Generated By:** SLSA GitHub Generator, Google Cloud Build, Tekton Chains, other SLSA-compliant builders

---

### In-toto Links

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** In-toto link files record metadata about supply chain steps, including inputs, outputs, and commands executed. Part of the in-toto supply chain integrity framework.

**Documentation:** https://in-toto.io/

**Detection Pattern:**
```sql
-- File name contains link indicators
REGEXP_MATCHES(ra.name, '(?i)\b(link|\.link)\b')
```

**Typical Artifacts:**
- `build.link`
- `test-step.link.json`
- `package.link`

**Generated By:** In-toto tooling, supply chain orchestration tools

---

### In-toto Layouts

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** In-toto layout files define the expected supply chain steps, their sequence, and the authorized functionaries. They serve as policies for supply chain verification.

**Documentation:** https://github.com/in-toto/docs/blob/master/in-toto-spec.md

**Detection Pattern:**
```sql
-- File name contains layout indicators
REGEXP_MATCHES(ra.name, '(?i)\b(layout|\.layout)\b') as is_in_toto_layout
```

**Typical Artifacts:**
- `supply-chain.layout`
- `project.layout.json`
- `build-policy.layout`

**Generated By:** In-toto tooling, supply chain policy authors

---

### Sigstore Bundles

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Sigstore bundles contain signatures, certificates, and transparency log entries in a single file. Part of the Sigstore ecosystem for keyless signing.

**Documentation:** https://docs.sigstore.dev/

**Detection Pattern:**
```sql
-- File extension indicating Sigstore bundle
REGEXP_MATCHES(ra.name, '(?i)\.bundle$') as is_sigstore_bundle
```

**Typical Artifacts:**
- `artifact.bundle`
- `image-signature.bundle`
- `attestation.bundle`

**Generated By:** Cosign, Sigstore clients

---

### Container Attestations

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Attestations specifically for container images, including signatures and security assessments. Often created by container signing tools.

**Documentation:** https://github.com/sigstore/cosign

**Detection Pattern:**
```sql
-- File name contains container/signing tool indicators
REGEXP_MATCHES(ra.name, '(?i)\b(cosign|rekor|fulcio)\b')
```

**Typical Artifacts:**
- `image.cosign.json`
- `container-signature.rekor`
- `fulcio-certificate.pem`

**Generated By:** Cosign, container registries, image signing tools

---

### License Files

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Files containing software licenses, copyright notices, and legal information.

**Documentation:** https://choosealicense.com/

**Detection Pattern:**
```sql
-- File name contains license indicators
REGEXP_MATCHES(ra.name, '(?i)\b(license|copying|notice)\b')
```

**Typical Artifacts:**
- `LICENSE`
- `COPYING`
- `NOTICE.txt`
- `COPYRIGHT`

**Generated By:** Manual creation, license generators, legal compliance tools

---

## SBOM Generation Tools

### Syft

**Status:** ✅ Implemented, ✅ Reported

**Description:** Syft is a CLI tool and Go library for generating Software Bill of Materials (SBOM) from container images and filesystems. Created by Anchore, it supports multiple output formats.

**Documentation:** https://github.com/anchore/syft

**Detection Pattern:**
```sql
-- Workflow content contains Syft references
REGEXP_MATCHES(w.content, '(?i)\bsyft\b')
```

**Generated Artifacts:**
- SPDX SBOMs (`.spdx.json`, `.spdx.xml`)
- CycloneDX SBOMs (`.cyclonedx.json`, `.cyclonedx.xml`) 
- Syft JSON format (`.syft.json`)

**Common Usage:**
```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    format: spdx-json
```

---

### Trivy

**Status:** ✅ Implemented, ✅ Reported

**Description:** Trivy is a comprehensive security scanner that can generate SBOMs in addition to vulnerability scanning. It supports containers, filesystems, and git repositories.

**Documentation:** https://trivy.dev/

**Detection Pattern:**
```sql
-- Workflow content contains Trivy references
REGEXP_MATCHES(w.content, '(?i)\btrivy\b')
```

**Generated Artifacts:**
- SPDX SBOMs
- CycloneDX SBOMs
- Vulnerability reports (SARIF, JSON)

**Common Usage:**
```yaml
- name: Run Trivy
  uses: aquasecurity/trivy-action@master
  with:
    format: 'spdx-json'
```

---

### CycloneDX Generator

**Status:** ✅ Implemented, ✅ Reported

**Description:** Official CycloneDX SBOM generators for various ecosystems (Maven, NPM, Python, etc.). Part of the OWASP CycloneDX project.

**Documentation:** https://github.com/CycloneDX

**Detection Pattern:**
```sql
-- Workflow content contains CycloneDX generator references
REGEXP_MATCHES(w.content, '(?i)\bcdxgen\b')
```

**Generated Artifacts:**
- CycloneDX SBOMs (`.cyclonedx.json`, `.cyclonedx.xml`)
- Vulnerability Exchange (VEX) documents

**Common Usage:**
```yaml
- name: Generate CycloneDX SBOM
  run: cdxgen -o bom.json
```

---

### SPDX SBOM Generator

**Status:** ✅ Implemented, ✅ Reported

**Description:** Official tools for generating SPDX-formatted SBOMs. Includes various language-specific generators.

**Documentation:** https://github.com/spdx/tools-golang

**Detection Pattern:**
```sql
-- Workflow content contains SPDX SBOM generator references
REGEXP_MATCHES(w.content, '(?i)\bspdx-sbom-generator\b')
```

**Generated Artifacts:**
- SPDX SBOMs (`.spdx.json`, `.spdx.xml`, `.spdx.rdf`)

**Common Usage:**
```yaml
- name: Generate SPDX SBOM
  run: spdx-sbom-generator -p . -o sbom.spdx.json
```

---

### Tern

**Status:** ✅ Implemented, ✅ Reported

**Description:** Tern is a software composition analysis tool and SBOM generator specifically designed for container images. Created by VMware and now a Linux Foundation project.

**Documentation:** https://github.com/tern-tools/tern

**Detection Pattern:**
```sql
-- Workflow content contains Tern references
REGEXP_MATCHES(w.content, '(?i)\b(tern-tools/tern|tern.*sbom)\b') as uses_tern
```

**Generated Artifacts:**
- SPDX SBOMs for containers
- CycloneDX SBOMs for containers
- Custom JSON reports

**Common Usage:**
```yaml
- name: Generate Container SBOM
  run: tern report -f spdxjson -o container-sbom.spdx.json
```

---

### Bomber

**Status:** ❌ Missing, Priority: Medium

**Description:** Bomber is an SBOM quality assessment tool that validates and scores SBOM completeness and accuracy.

**Documentation:** https://github.com/devops-kung-fu/bomber

**Proposed Detection Pattern:**
```sql
-- Workflow content contains Bomber references
REGEXP_MATCHES(w.content, '(?i)\bdevops-kung-fu/bomber\b') as uses_bomber
```

**Generated Artifacts:**
- SBOM quality reports
- Scored SBOM assessments

**Common Usage:**
```yaml
- name: Validate SBOM Quality
  uses: devops-kung-fu/bomber@v1
  with:
    sbom: sbom.spdx.json
```

---

### OSS Review Toolkit (ORT)

**Status:** ❌ Missing, Priority: Medium

**Description:** ORT is a comprehensive open source compliance toolchain that includes SBOM generation, license compliance, and vulnerability scanning.

**Documentation:** https://github.com/oss-review-toolkit/ort

**Proposed Detection Pattern:**
```sql
-- Workflow content contains ORT references  
REGEXP_MATCHES(w.content, '(?i)\boss-review-toolkit|ort-project\b') as uses_ort
```

**Generated Artifacts:**
- SPDX SBOMs
- License compliance reports
- Vulnerability assessments

**Common Usage:**
```yaml
- name: Run ORT Analysis
  run: ort analyze -i . -o ort-results
```

---

## Signing & Attestation Tools

### Cosign

**Status:** ✅ Implemented, ✅ Reported

**Description:** Cosign is a tool for signing and verifying container images and other artifacts. Part of the Sigstore project, it enables keyless signing using OpenID Connect.

**Documentation:** https://docs.sigstore.dev/cosign/overview/

**Detection Pattern:**
```sql
-- Workflow content contains Cosign references
REGEXP_MATCHES(w.content, '(?i)\bcosign\b')
```

**Generated Artifacts:**
- Container image signatures
- Attestations (`.att`, `.intoto.jsonl`)
- Sigstore bundles (`.bundle`)
- Public keys (`.pub`)

**Common Usage:**
```yaml
- name: Sign container image
  run: cosign sign $IMAGE_URI
```

---

### Sigstore

**Status:** ✅ Implemented, ✅ Reported

**Description:** Sigstore is a set of free-to-use tools for signing, verifying, and protecting software. Provides keyless signing infrastructure.

**Documentation:** https://www.sigstore.dev/

**Detection Pattern:**
```sql
-- Workflow content contains Sigstore references
REGEXP_MATCHES(w.content, '(?i)\bsigstore\b')
```

**Generated Artifacts:**
- Transparency log entries (Rekor)
- Certificate authority certificates (Fulcio)
- Timestamping service responses

**Common Usage:**
```yaml
- name: Setup Sigstore
  uses: sigstore/gh-action-sigstore-python@v1
```

---

### SLSA GitHub Generator

**Status:** ✅ Implemented, ✅ Reported

**Description:** Official GitHub Action for generating SLSA provenance attestations. Provides SLSA Level 3 build provenance.

**Documentation:** https://github.com/slsa-framework/slsa-github-generator

**Detection Pattern:**
```sql
-- Workflow content contains SLSA GitHub Generator references
REGEXP_MATCHES(w.content, '(?i)\bslsa-github-generator\b')
```

**Generated Artifacts:**
- SLSA provenance attestations (`.intoto.jsonl`)
- Build metadata
- Tamper-resistant build evidence

**Common Usage:**
```yaml
- name: Generate SLSA Provenance
  uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v1.4.0
```

---

### Notation

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Notation is a CNCF project for signing and verifying artifacts stored in OCI registries. Focuses on container image and artifact signing.

**Documentation:** https://notaryproject.dev/

**Detection Pattern:**
```sql
-- Workflow content contains Notation references
REGEXP_MATCHES(w.content, '(?i)\b(notation|notaryproject)\b') as uses_notation
```

**Generated Artifacts:**
- OCI artifact signatures
- Trust policy documents
- Certificate bundles

**Common Usage:**
```yaml
- name: Sign with Notation
  run: notation sign $REGISTRY/$IMAGE:$TAG
```

---

### Witness

**Status:** ❌ Missing, Priority: Medium

**Description:** Witness is a pluggable attestation framework from TestifySec that creates and verifies supply chain attestations based on configurable policies.

**Documentation:** https://witness.testifysec.com/

**Proposed Detection Pattern:**
```sql
-- Workflow content contains Witness references
REGEXP_MATCHES(w.content, '(?i)\btestifysec/witness\b') as uses_witness
```

**Generated Artifacts:**
- Policy files (`.witness.yaml`)
- Attestation collections
- Verification reports

**Common Usage:**
```yaml
- name: Generate Attestations
  uses: testifysec/witness-run-action@v0.1.0
```

---

### Kyverno

**Status:** ❌ Missing, Priority: Medium

**Description:** Kyverno is a Kubernetes-native policy management tool that can generate and verify attestations for container images and Kubernetes resources.

**Documentation:** https://kyverno.io/

**Proposed Detection Pattern:**
```sql
-- Workflow content contains Kyverno references
REGEXP_MATCHES(w.content, '(?i)\bkyverno\b') as uses_kyverno
```

**Generated Artifacts:**
- Policy violation reports
- Attestation policies
- Compliance reports

**Common Usage:**
```yaml
- name: Kyverno Policy Check
  uses: kyverno/action-install-kyverno@v0.1.0
```

---

## Vulnerability Scanners

### Snyk

**Status:** ✅ Implemented, ✅ Reported

**Description:** Snyk is a comprehensive security platform that scans for vulnerabilities in dependencies, container images, infrastructure as code, and source code.

**Documentation:** https://snyk.io/

**Detection Pattern:**
```sql
-- Workflow content contains Snyk references
REGEXP_MATCHES(w.content, '(?i)\bsnyk\b')
```

**Generated Artifacts:**
- Vulnerability reports (JSON, SARIF)
- Security assessments
- Fix recommendations

**Common Usage:**
```yaml
- name: Run Snyk Security Scan
  uses: snyk/actions/node@master
```

---

### Anchore/Grype

**Status:** ✅ Implemented, ✅ Reported

**Description:** Grype is a vulnerability scanner for container images and filesystems. Created by Anchore, it integrates well with Syft for SBOM-based scanning.

**Documentation:** https://github.com/anchore/grype

**Detection Pattern:**
```sql
-- Workflow content contains Anchore or Grype references
REGEXP_MATCHES(w.content, '(?i)\b(anchore|grype)\b')
```

**Generated Artifacts:**
- Vulnerability reports (JSON, table, SARIF)
- SBOM-enriched vulnerability data

**Common Usage:**
```yaml
- name: Scan for vulnerabilities
  uses: anchore/scan-action@v3
```

---

### Trivy Scanner

**Status:** ✅ Implemented, ✅ Reported

**Description:** Trivy as a vulnerability scanner (also generates SBOMs). Comprehensive security scanner for containers, filesystems, and git repos.

**Documentation:** https://trivy.dev/

**Detection Pattern:**
```sql
-- Workflow content contains Trivy references (same as SBOM generator)
REGEXP_MATCHES(w.content, '(?i)\btrivy\b')
```

**Generated Artifacts:**
- Vulnerability reports (JSON, SARIF, table)
- License compliance reports
- Configuration issue reports

**Common Usage:**
```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    format: 'sarif'
```

---

### Clair

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Clair is an open source vulnerability scanner for container images. Originally created by CoreOS, now part of the Quay registry ecosystem.

**Documentation:** https://quay.github.io/clair/

**Detection Pattern:**
```sql
-- Workflow content contains Clair references
REGEXP_MATCHES(w.content, '(?i)\bclair\b')
```

**Generated Artifacts:**
- Vulnerability databases
- Container layer analysis
- Security reports

**Common Usage:**
```yaml
- name: Clair Container Scan
  run: clair-scanner --ip localhost $IMAGE
```

---

### Docker Scout

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Docker Scout is Docker's official security scanning service for container images. Provides vulnerability analysis and recommendations.

**Documentation:** https://docs.docker.com/scout/

**Detection Pattern:**
```sql
-- Workflow content contains Docker Scout references
REGEXP_MATCHES(w.content, '(?i)\bdocker.*scout\b') as uses_docker_scout
```

**Generated Artifacts:**
- Vulnerability reports
- Base image recommendations
- Security scorecards

**Common Usage:**
```yaml
- name: Docker Scout scan
  uses: docker/scout-action@v1
```

---

### Twistlock

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Twistlock (now part of Palo Alto Prisma Cloud) is an enterprise container security platform.

**Documentation:** https://docs.paloaltonetworks.com/prisma/prisma-cloud

**Detection Pattern:**
```sql
-- Workflow content contains Twistlock references
REGEXP_MATCHES(w.content, '(?i)\btwistlock\b')
```

**Generated Artifacts:**
- Security compliance reports
- Runtime protection policies
- Vulnerability assessments

---

### Aqua

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** Aqua Security provides container and cloud security scanning capabilities.

**Documentation:** https://www.aquasec.com/

**Detection Pattern:**
```sql
-- Workflow content contains Aqua references
REGEXP_MATCHES(w.content, '(?i)\baqua\b')
```

**Generated Artifacts:**
- Security scan reports
- Policy compliance reports
- Runtime security data

---

## Dependency Scanners

### Dependabot

**Status:** ✅ Implemented, ✅ Reported

**Description:** Dependabot is GitHub's native dependency update service that automatically creates pull requests to update dependencies and identifies security vulnerabilities.

**Documentation:** https://docs.github.com/en/code-security/dependabot

**Detection Pattern:**
```sql
-- Workflow content contains Dependabot references
REGEXP_MATCHES(w.content, '(?i)\bdependabot\b')
```

**Generated Artifacts:**
- Dependency update pull requests
- Security advisories
- Dependency graphs

**Common Usage:**
```yaml
# Usually configured via .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

### Renovate

**Status:** ✅ Implemented, ✅ Reported

**Description:** Renovate is an open-source dependency update tool that works across multiple package managers and platforms.

**Documentation:** https://docs.renovatebot.com/

**Detection Pattern:**
```sql
-- Workflow content contains Renovate references
REGEXP_MATCHES(w.content, '(?i)\brenovate\b')
```

**Generated Artifacts:**
- Dependency update pull requests
- Configuration reports
- Dependency dashboards

**Common Usage:**
```yaml
- name: Renovate
  uses: renovatebot/github-action@v34.0.0
```

---

### WhiteSource

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** WhiteSource (now Mend) is an enterprise software composition analysis platform for managing open source components.

**Documentation:** https://www.mend.io/

**Detection Pattern:**
```sql
-- Workflow content contains WhiteSource references
REGEXP_MATCHES(w.content, '(?i)\bwhitesource\b')
```

**Generated Artifacts:**
- License compliance reports
- Vulnerability reports
- Policy violation alerts

---

### FOSSA

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** FOSSA is an enterprise platform for open source management, license compliance, and vulnerability scanning.

**Documentation:** https://fossa.com/

**Detection Pattern:**
```sql
-- Workflow content contains FOSSA references  
REGEXP_MATCHES(w.content, '(?i)\bfossa\b')
```

**Generated Artifacts:**
- License compliance reports
- Dependency graphs
- Security vulnerability reports

**Common Usage:**
```yaml
- name: FOSSA Scan
  uses: fossas/fossa-action@main
```

---

## Code Scanners

### CodeQL

**Status:** ✅ Implemented, ✅ Reported

**Description:** CodeQL is GitHub's semantic code analysis engine that finds security vulnerabilities and coding errors in source code.

**Documentation:** https://codeql.github.com/

**Detection Pattern:**
```sql
-- Workflow content contains CodeQL references
REGEXP_MATCHES(w.content, '(?i)\bcodeql\b')
```

**Generated Artifacts:**
- SARIF vulnerability reports
- Security alerts
- Code scanning results

**Common Usage:**
```yaml
- name: Initialize CodeQL
  uses: github/codeql-action/init@v2
  with:
    languages: javascript, python
```

---

### Semgrep

**Status:** ✅ Implemented, ✅ Reported

**Description:** Semgrep is a static analysis tool for finding bugs, security issues, and anti-patterns in code across multiple languages.

**Documentation:** https://semgrep.dev/

**Detection Pattern:**
```sql
-- Workflow content contains Semgrep references
REGEXP_MATCHES(w.content, '(?i)\bsemgrep\b')
```

**Generated Artifacts:**
- SARIF security reports
- Custom rule findings
- Compliance reports

**Common Usage:**
```yaml
- name: Semgrep Scan
  uses: returntocorp/semgrep-action@v1
```

---

### Bandit

**Status:** ✅ Implemented, ✅ Reported

**Description:** Bandit is a security linter for Python code that identifies common security issues in Python applications.

**Documentation:** https://bandit.readthedocs.io/

**Detection Pattern:**
```sql
-- Workflow content contains Bandit references
REGEXP_MATCHES(w.content, '(?i)\bbandit\b')
```

**Generated Artifacts:**
- JSON security reports
- Text-based findings
- CI-friendly output

**Common Usage:**
```yaml
- name: Security check with Bandit
  run: bandit -r . -f json -o bandit-report.json
```

---

### ESLint Security

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** ESLint security plugins that add security-focused linting rules for JavaScript and TypeScript code.

**Documentation:** https://eslint.org/

**Detection Pattern:**
```sql
-- Workflow content contains ESLint security references
REGEXP_MATCHES(w.content, '(?i)\beslint-security\b')
```

**Generated Artifacts:**
- Linting reports
- Security rule violations
- JSON/XML formatted results

---

## Build & Release Tools

### GoReleaser

**Status:** ✅ Implemented, ❌ Not Reported

**Description:** GoReleaser is a release automation tool for Go projects that builds, packages, and publishes releases with various integrations.

**Documentation:** https://goreleaser.com/

**Detection Pattern:**
```sql
-- Workflow content contains GoReleaser action references
REGEXP_MATCHES(w.content, '(?i)\bgoreleaser/goreleaser-action\b')
```

**Generated Artifacts:**
- Binary releases
- Checksums files
- Archives (tar.gz, zip)
- Container images
- Homebrew formulas

**Common Usage:**
```yaml
- name: Run GoReleaser
  uses: goreleaser/goreleaser-action@v4
  with:
    version: latest
    args: release --rm-dist
```

---

## License & Compliance

### Scancode

**Status:** ❌ Missing, Priority: Medium

**Description:** ScanCode is an open-source tool suite for scanning code and detecting licenses, copyrights, package manifests, and dependencies.

**Documentation:** https://github.com/nexB/scancode-toolkit

**Proposed Detection Pattern:**
```sql
-- Workflow content contains ScanCode references
REGEXP_MATCHES(w.content, '(?i)\bscancode\b') as uses_scancode
```

**Generated Artifacts:**
- License detection reports
- Copyright notices
- Package manifest analysis
- Dependency graphs

**Common Usage:**
```yaml
- name: License Scan
  run: scancode -clpieu --json-pp output.json src/
```

---

### Licensee

**Status:** ❌ Missing, Priority: Low

**Description:** Licensee is GitHub's open-source license detection library, used by GitHub to identify repository licenses.

**Documentation:** https://github.com/licensee/licensee

**Proposed Detection Pattern:**
```sql
-- Workflow content contains Licensee references
REGEXP_MATCHES(w.content, '(?i)\blicensee\b') as uses_licensee
```

**Generated Artifacts:**
- License identification results
- Confidence scores
- License compatibility analysis

**Common Usage:**
```yaml
- name: Detect License
  run: licensee detect --json > license-detection.json
```

---

## Policy & Governance

### Open Policy Agent (OPA)

**Status:** ❌ Missing, Priority: Low

**Description:** OPA is a general-purpose policy engine that can be used to enforce supply chain security policies and governance rules.

**Documentation:** https://www.openpolicyagent.org/

**Proposed Detection Pattern:**
```sql
-- Workflow content contains OPA references
REGEXP_MATCHES(w.content, '(?i)\bopen-policy-agent|opa\b') as uses_opa
```

**Generated Artifacts:**
- Policy evaluation results
- Compliance reports
- Policy violation alerts

**Common Usage:**
```yaml
- name: OPA Policy Check
  run: opa eval -d policies/ -i input.json "data.policies.allow"
```

---

### Rego Policies

**Status:** ❌ Missing, Priority: Low

**Description:** Rego is the policy language used by Open Policy Agent. Rego policy files define rules and constraints for governance.

**Documentation:** https://www.openpolicyagent.org/docs/latest/policy-language/

**Proposed Detection Pattern:**
```sql
-- File extension indicating Rego policy files
REGEXP_MATCHES(ra.name, '(?i)\.rego$') as is_rego_policy
```

**Typical Artifacts:**
- `security-policy.rego`
- `compliance-rules.rego` 
- `supply-chain-policy.rego`

**Generated By:** Policy authors, governance teams, automated policy generators

---

## Implementation Notes

### File Location References
- **Artifact Detection:** `sql/models/01_artifact_analysis.sql`
- **Tool Detection:** `sql/models/02_workflow_tool_detection.sql`
- **Summary Aggregation:** `sql/models/03_repository_security_summary.sql`
- **Report Generation:** `src/report.ts`

### Adding New Detections

1. **For Artifacts:** Add detection pattern to `01_artifact_analysis.sql`
2. **For Tools:** Add tool case to appropriate category in `02_workflow_tool_detection.sql`
3. **For Aggregation:** Add boolean column to `03_repository_security_summary.sql`
4. **For Reporting:** Add query and display logic to `src/report.ts`

### Testing New Detections

1. Run analysis: `npm start -- --input INPUT --queries GetRepoDataExtendedInfo --analyze`
2. Check detection: `npm run analyze -- --database DB_PATH`
3. Verify reporting: `npm run report -- --database DB_PATH --format markdown`

---

**Last Updated:** October 12, 2025
**Document Version:** 1.0
**Next Review:** When adding new tool categories or major framework updates