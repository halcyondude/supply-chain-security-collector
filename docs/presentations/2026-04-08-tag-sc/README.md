# TAG Security — Supply Chain Security Landscape Presentation

**Date:** April 8, 2026
**Audience:** CNCF TAG Security
**Data:** 236 CNCF projects, 39,304 release assets, 2,784 workflows

## Presentation Framework

1. Example answer to a question → [findings report](cncf-supply-chain-findings.md)
2. Where the data came from → [diagrams/01-data-pipeline.svg](diagrams/01-data-pipeline.svg)
3. How the data got into the database → live demo (`npm test -- --scan-orgs`)
4. Where we plan to contribute → [GUAC integration strategy](guac-integration-strategy.md)
5. Q&A → [known gaps analysis](known-gaps-analysis.md) for prepared answers

## Files

### Slide Deck
- [cncf-supply-chain-security.pptx](cncf-supply-chain-security.pptx) — 12 slides with speaker notes
- [build-deck.cjs](build-deck.cjs) — script that generated the deck (for regeneration)

### Reports
- [cncf-supply-chain-findings.md](cncf-supply-chain-findings.md) — main findings report with epistemic framing ("observed via GitHub," lower bounds)
- [cncf-landscape-report.md](cncf-landscape-report.md) — generated landscape report from the tool

### Strategy & Analysis
- [presentation-plan.md](presentation-plan.md) — panel synthesis with full provenance (4 Opus agents)
- [primer-cncf-presentation-strategy.md](primer-cncf-presentation-strategy.md) — audience framing, landmines, TOC #1709 connection
- [guac-integration-strategy.md](guac-integration-strategy.md) — GUAC integration with 3 paths (honest roadmap)
- [known-gaps-analysis.md](known-gaps-analysis.md) — per-project research on where artifacts actually live
- [data-analysis-framework.md](data-analysis-framework.md) — three-tier evidence model, graph queries, journal schema
- [exploration-platform-spec.md](exploration-platform-spec.md) — architecture spec for DuckDB-WASM interactive site

### Diagrams
- [diagrams/01-data-pipeline.svg](diagrams/01-data-pipeline.svg) — collection → analysis flow
- [diagrams/02-maturity-comparison.svg](diagrams/02-maturity-comparison.svg) — incubating > graduated surprise
- [diagrams/03-helm-vs-nats.svg](diagrams/03-helm-vs-nats.svg) — "doing half the job" contrast
- [diagrams/04-tool-adoption-pyramid.svg](diagrams/04-tool-adoption-pyramid.svg) — 80 scan → 14 sign → 1 cosign
- [diagrams/05-collector-plus-guac.svg](diagrams/05-collector-plus-guac.svg) — combined query surface
- [diagrams/06-exploration-platform-architecture.svg](diagrams/06-exploration-platform-architecture.svg) — interactive site architecture
- [diagrams/07-exploration-platform-data-flow.svg](diagrams/07-exploration-platform-data-flow.svg) — site data flow

### Findings Visualizations
- [findings-adoption-overview.svg](findings-adoption-overview.svg) — pie chart: 236 repos by artifact presence
- [findings-tool-adoption.svg](findings-tool-adoption.svg) — bar chart: all 17 tools by repo count
- [findings-maturity-comparison.svg](findings-maturity-comparison.svg) — graduated vs incubating vs sandbox
- [findings-pipeline-gap.svg](findings-pipeline-gap.svg) — funnel: 236 → 1 cosign-in-CI
- [findings-signing-vs-sbom.svg](findings-signing-vs-sbom.svg) — Helm/NATS quadrant

## Key Numbers

| Metric | Value |
|--------|-------|
| Repos analyzed | 236 |
| SBOM adoption (observed) | 16.1% |
| Signature adoption (observed) | 15.3% |
| Attestation adoption | 1.7% |
| Most adopted tool | CodeQL (33.9%) |
| Cosign in CI | 1 repo (0.4%) |
| Full pipeline (SBOM + sig) | 14 repos (5.9%) |

Every number is a lower bound — based on GitHub release assets and GitHub Actions workflows only.

## Repository

https://github.com/halcyondude/supply-chain-security-collector
