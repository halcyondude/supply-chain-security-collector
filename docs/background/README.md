# Project Background & Architectural Decisions

This directory contains documents that provide historical context, explain key architectural decisions, and outline future plans for the supply chain security collector.

While not required for day-to-day use, these files are invaluable for understanding the "why" behind the current implementation and the project's evolution.

## Document Summaries

| File | Summary |
| :--- | :--- |
| [`architecture.md`][arch] | Explains the "Type-Driven Normalization" philosophy, the foundation of the data transformation layer. |
| [`codegen-insight.md`][codegen] | A key decision log explaining the choice to use `graphql-codegen` for schema introspection. |
| [`cncf-automation-tooling.md`][cncf-auto] | Survey of SBOM and supply chain tooling in cncf/automation and cncf/sbom (Waybill, BOMHort, cosign, SLSA), and what the collector can reuse. |
| [`decisions.md`][decisions] | A general log of various architectural decisions made during development. |
| [`duckdb-extensions-strategy.md`][duckdb-ext] | Strategy for leveraging DuckDB extensions (FTS, JSON, httpfs) in the analysis pipeline. |

[arch]: ./architecture.md
[codegen]: ./codegen-insight.md
[cncf-auto]: ./cncf-automation-tooling.md
[decisions]: ./decisions.md
[duckdb-ext]: ./duckdb-extensions-strategy.md
