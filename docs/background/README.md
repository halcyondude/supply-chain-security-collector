# Project Background & Architectural Decisions

This directory contains documents that provide historical context, explain key architectural decisions, and outline future plans for the GraphQL Data Engineering Toolkit.

While not required for day-to-day use, these files are invaluable for understanding the "why" behind the current implementation and the project's evolution.

## Document Summaries

| File | Summary |
| :--- | :--- |
| [`architecture.md`][arch] | Explains the "Type-Driven Normalization" philosophy, the foundation of the data transformation layer. |
| [`cleanup-queries.md`][cleanup] | Documents the refactoring of GraphQL queries, making `GetRepoDataExtendedInfo` the default. |
| [`codegen-insight.md`][codegen] | A key decision log explaining the choice to use `graphql-codegen` for schema introspection. |
| [`decisions.md`][decisions] | A general log of various architectural decisions made during development. |
| [`documentation-recommendation.md`][docs-rec] | Justifies the selection of SpectaQL for generating static HTML documentation. |
| [`duckdb-implementation.md`][duckdb] | Details the shift to a DuckDB-first pipeline for data storage and Parquet generation. |
| [`enhancement-plan.md`][enhance] | An **active roadmap** detailing planned improvements for the SQL-based analysis and reporting layer. |
| [`implementation-summary.md`][impl-sum] | Summarizes the implementation of the type-driven normalization pattern. *(Candidate for merging into `architecture.md`)*. |
| [`regeneration-plan.md`][regen] | A task-oriented plan for a specific goal: performing a full data collection for all CNCF projects. |

[arch]: ./architecture.md
[cleanup]: ./cleanup-queries.md
[codegen]: ./codegen-insight.md
[decisions]: ./decisions.md
[docs-rec]: ./documentation-recommendation.md
[duckdb]: ./duckdb-implementation.md
[enhance]: ./enhancement-plan.md
[impl-sum]: ./implementation-summary.md
[regen]: ./regeneration-plan.**md**