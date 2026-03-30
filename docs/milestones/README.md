# Project Milestones

This directory tracks the evolution of the GitHub Supply Chain Security Data Collector across its development phases. Each milestone document captures the work completed, architecture decisions, verification results, and key metrics.

## Project Timeline

```mermaid
gantt
    title Supply Chain Security Collector — Development Timeline
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section Foundation
    Bootstrap & GraphQL Setup           :done, p1, 2025-09-14, 1d
    TypeScript Modernization            :done, p2, 2025-09-14, 2d

    section Core Architecture
    Two-Stage Pipeline Design           :done, p3, 2025-10-06, 7d
    CNCF Metadata Integration           :done, p4, 2025-10-12, 2d
    Security Features & Insights        :done, p5, 2025-10-12, 9d

    section Developer Experience
    Documentation Suite                 :done, p6, 2025-10-17, 1d
    Jupyter Lab Integration             :done, p7, 2025-10-20, 1d

    section Data Expansion
    CLOMonitor Integration              :done, p8, 2025-11-07, 1d
    Landscape Data Refresh              :done, p9, 2026-02-02, 1d

    section Quality & Analysis
    Data Quality Fixes & Reporting      :done, p10, 2026-03-03, 1d
    LadybugDB Graph Integration         :done, p10b, 2026-03-03, 1d
```

## Phase Map

```mermaid
flowchart LR
    subgraph Phase1["Phase 1-2: Foundation"]
        direction TB
        A1[Bootstrap] --> A2[GraphQL Schema]
        A2 --> A3[Mock Data & CLI]
        A3 --> A4[TypeScript Codegen]
    end

    subgraph Phase3["Phase 3-5: Core Pipeline"]
        direction TB
        B1["Two-Stage\nArchitecture"] --> B2["SQL Model\nEngine"]
        B2 --> B3["CNCF Metadata\nIntegration"]
        B3 --> B4["Security\nInsights"]
    end

    subgraph Phase6["Phase 6-8: Polish"]
        direction TB
        C1[Documentation] --> C2[Jupyter Lab]
        C2 --> C3[CLOMonitor]
    end

    subgraph Phase9["Phase 9-10: Analysis"]
        direction TB
        D1["FTS & Lint\nFixes"] --> D2["Report\nGenerator"]
        D2 --> D3["LadybugDB\nGraph"]
    end

    Phase1 --> Phase3 --> Phase6 --> Phase9

    style Phase1 fill:#4a90d9,color:#fff
    style Phase3 fill:#e8744f,color:#fff
    style Phase6 fill:#50b878,color:#fff
    style Phase9 fill:#9b59b6,color:#fff
```

## Architecture at a Glance

```mermaid
flowchart TB
    subgraph Collection["Collection Layer"]
        GH[("GitHub\nGraphQL API")] --> Neo["neo.ts\n(CLI orchestrator)"]
        Neo --> API["api.ts\n(GraphQL client)"]
        API --> GH
    end

    subgraph Normalization["Normalization Layer"]
        Neo --> AW["ArtifactWriter.ts"]
        AW --> N1["ExtendedInfo\nNormalizer"]
        AW --> N2["Artifacts\nNormalizer"]
    end

    subgraph Storage["Storage Layer"]
        AW --> DDB[("DuckDB\ndatabase.db")]
        AW --> PQ["Parquet\nfiles/"]
    end

    subgraph Analysis["Analysis Layer"]
        DDB --> SA["SecurityAnalyzer.ts"]
        SA --> SQL["SQL Models\n00-05"]
        SQL --> AGG["agg_* tables"]
        AGG --> PQ2["agg_* Parquet"]
    end

    subgraph Output["Output Layer"]
        AGG --> RPT["ReportGenerator.ts\n(Markdown)"]
        DDB --> GB["GraphBuilder.ts"]
        GB --> LDB[("LadybugDB\ngraph.lbug")]
        LDB --> CYP["Cypher Queries"]
    end

    style Collection fill:#4a90d9,color:#fff
    style Normalization fill:#e8744f,color:#fff
    style Storage fill:#f5a623,color:#fff
    style Analysis fill:#50b878,color:#fff
    style Output fill:#9b59b6,color:#fff
```

## Milestone Index

| # | Milestone | Date | Doc |
|---|-----------|------|-----|
| 1 | Bootstrap & GraphQL Foundation | 2025-09-14 | [001-bootstrap.md](./001-bootstrap.md) |
| 2 | Two-Stage Pipeline Architecture | 2025-10-06 | [002-pipeline-architecture.md](./002-pipeline-architecture.md) |
| 3 | CNCF Integration & Production Scale | 2025-10-12 | [003-cncf-integration.md](./003-cncf-integration.md) |
| 4 | Security Features & Insights | 2025-10-12 | [004-security-features.md](./004-security-features.md) |
| 5 | Documentation, Jupyter & CLOMonitor | 2025-10-17 | [005-devex-polish.md](./005-devex-polish.md) |
| 6 | Data Quality Fixes, Reporting & Graph DB | 2026-03-03 | [006-quality-reporting-graph.md](./006-quality-reporting-graph.md) |

## Key Metrics (as of 2026-03-03)

| Metric | Value |
|--------|-------|
| Total commits | 105 |
| CNCF projects supported | 239 |
| SQL analysis models | 7 |
| Base tables | 10 |
| Aggregation tables | 11 |
| Detection tool patterns | 20+ |
| Graph node types | 7 |
| Graph relationship types | 6 |
| TypeScript (core) | ~3,400 lines |
| SQL (models) | ~1,240 lines |
