# Architecture Plan: Multi-Backend GraphQL Data Engineering Toolkit

**Status:** Planning Phase  
**Date:** October 11, 2025  
**Current Branch:** `my-wip-parquet`

## Executive Summary

This plan transforms the GitHub Supply Chain Analyzer into a **well-factored, multi-backend GraphQL data engineering toolkit** while maintaining its current focus on GitHub supply chain security analysis. The core engine will be generic and reusable, with domain-specific logic clearly separated and optional.

---

## Requirements Analysis

### R1: General-Purpose with Good Factoring
**Goal:** Core components should be reusable as libraries for any GraphQL API.

**Strategy:**
- Clean separation between generic engine and domain logic
- Core modules in `src/core/` with no GitHub-specific code
- Domain analyzers in `src/analyzers/{domain}/` as optional plugins

### R2: Multiple Backend Persistence (Extensible)
**Goal:** Support DuckDB (always) + Dgraph (configurable) + future backends.

**Strategy:**
- Abstract `BackendWriter` interface
- Plugin architecture for backend implementations
- DuckDB: No dependencies, always enabled
- Dgraph: Optional, graph database with GraphQL serving capability
- Future backends can be added without touching core code

### R3: Lossless Metadata Preservation
**Goal:** Schema descriptions and relationships must be preserved in all outputs.

**Strategy:**
- **Parquet:** Embed descriptions in KV metadata
- **DuckDB:** Apply COMMENT ON TABLE/COLUMN statements
- **Dgraph:** Include descriptions in schema predicates
- **Documentation:** Generate schema.md with full context from GraphQL SDL

### R4: Structured Audit Logging
**Goal:** Complete audit trail of all operations.

**Strategy:**
- Structured JSONL format with:
  - Query text, variables, endpoint
  - Response metadata (size, duration, success)
  - Per-backend write results
  - Error details and stack traces
- Queryable via DuckDB for analysis

### R5: Schema-Driven Generic Design
**Goal:** GitHub-specific logic should be minimal, isolated, and clearly marked.

**Strategy:**
- Core operates purely on GraphQL schema + data
- GitHub analysis is an **optional post-processor**
- Extensible pattern: `analyzers/{domain}/` for future domains
- Configuration flag to enable/disable analyzers

### R6: Future Org-Level Reporting
**Goal:** Don't block future feature for querying entire organizations.

**Strategy:**
- Current design: per-repo granularity is preserved
- Aggregation happens at query/analysis time, not collection time
- Output structure supports merging multiple runs
- No hardcoded assumptions about single-repo execution

---

## Architecture Overview

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI / Orchestration                       │
│                      (src/main.ts)                          │
│  • Argument parsing                                         │
│  • Pipeline coordination                                     │
│  • Progress reporting                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Core GraphQL Engine (Reusable)                  │
│                      (src/core/)                            │
│  • SchemaIntrospector: Parse and analyze GraphQL schemas   │
│  • QueryExecutor: Execute queries with batching             │
│  • ResponseTransformer: GraphQL → relational structure      │
│  • AuditLogger: Structured logging with context             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          Backend Abstraction Layer (Plugin System)           │
│                   (src/backends/)                           │
│  • BackendWriter interface                                  │
│  • BackendRegistry for dynamic loading                      │
└─────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  DuckDB       │  │    Dgraph     │  │    Future     │
│  Backend      │  │    Backend    │  │   Backends    │
│  (Always On)  │  │  (Optional)   │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│        Domain-Specific Analyzers (Optional Plugins)          │
│                   (src/analyzers/)                          │
│  • github/SupplyChainAnalyzer                               │
│  • future/{domain}/Analyzer                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Structure

### New Directory Layout

```
src/
  ├── core/                         # Generic, reusable engine
  │   ├── SchemaIntrospector.ts     # GraphQL schema analysis
  │   ├── QueryExecutor.ts          # Generic query execution
  │   ├── ResponseTransformer.ts    # GraphQL → relational
  │   ├── AuditLogger.ts            # Structured audit trail
  │   ├── BackendRegistry.ts        # Backend plugin system
  │   └── types.ts                  # Core type definitions
  │
  ├── backends/                     # Persistence implementations
  │   ├── BackendWriter.ts          # Abstract interface
  │   ├── DuckDBBackend.ts          # DuckDB implementation
  │   ├── DgraphBackend.ts          # Dgraph implementation
  │   └── ParquetWriter.ts          # Shared Parquet utilities
  │
  ├── analyzers/                    # Domain-specific logic
  │   └── github/                   # GitHub supply chain analysis
  │       ├── SupplyChainAnalyzer.ts
  │       ├── patterns.ts           # Detection regex patterns
  │       └── types.ts              # GitHub domain types
  │
  ├── cli/                          # CLI interface
  │   ├── commands.ts               # Command definitions
  │   └── config.ts                 # Configuration management
  │
  ├── main.ts                       # Orchestration entry point
  ├── api.ts                        # GraphQL client wrapper
  └── generated/                    # GraphQL codegen output
```

### Mapping Current Files to New Structure

| Current File | New Location | Notes |
|--------------|--------------|-------|
| `SchemaMapGenerator.ts` | `core/SchemaIntrospector.ts` | Renamed, enhanced |
| `GraphQLObjectToArrowTransformer.ts` | `core/ResponseTransformer.ts` | Renamed |
| `ArtifactWriter.ts` | Split → `backends/*.ts` | Split by backend type |
| `rawResponseWriter.ts` | `core/AuditLogger.ts` | Enhanced with full context |
| `main.ts` | `main.ts` (stays) | Simplified orchestration |
| `api.ts` | `api.ts` (stays) | Wrapped in `QueryExecutor` |
| `analysis.ts` | `analyzers/github/SupplyChainAnalyzer.ts` | Domain-specific |

---

## Core Interfaces

### BackendWriter Interface

```typescript
/**
 * Abstract interface that all backend implementations must satisfy.
 * Enables plugin architecture for adding new persistence layers.
 */
interface BackendWriter {
  /** Unique identifier for this backend */
  readonly name: string;
  
  /** Human-readable description */
  readonly description: string;
  
  /** Does this backend support GraphQL queries? */
  readonly supportsGraphQLQueries: boolean;
  
  /**
   * Initialize backend with configuration
   * @param config Backend-specific configuration
   */
  initialize(config: BackendConfig): Promise<void>;
  
  /**
   * Write schema metadata (descriptions, types, relationships)
   * @param schemaMap Parsed schema structure
   * @param graphqlSDL Original GraphQL SDL text
   */
  writeSchema(schemaMap: SchemaMap, graphqlSDL: string): Promise<void>;
  
  /**
   * Write data entities with relationships preserved
   * @param entities Map of entity type → array of entity instances
   */
  writeData(entities: Map<string, Entity[]>): Promise<void>;
  
  /**
   * Finalize write operations and return result summary
   */
  finalize(): Promise<BackendResult>;
}

interface BackendResult {
  success: boolean;
  recordsWritten: number;
  duration: number;
  outputPaths?: string[];
  error?: Error;
}
```

### AuditLogEntry Structure

```typescript
interface AuditLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Unique session identifier for this run */
  sessionId: string;
  
  /** Query execution details */
  query: {
    endpoint: string;
    queryText: string;
    variables: Record<string, any>;
  };
  
  /** Response metadata */
  response: {
    success: boolean;
    dataSize: number;      // bytes
    entityCount: number;   // total entities extracted
    duration: number;      // milliseconds
    error?: string;
  };
  
  /** Per-backend write results */
  backends: {
    [backendName: string]: {
      success: boolean;
      duration: number;
      recordsWritten: number;
      outputPaths?: string[];
      error?: string;
    };
  };
  
  /** Domain analyzer results (optional) */
  analysis?: {
    analyzerName: string;
    findings: Record<string, any>;
  };
}
```

### SchemaMap Structure (Enhanced)

```typescript
interface SchemaMap {
  /** GraphQL API endpoint */
  endpoint: string;
  
  /** Generation timestamp */
  generatedAt: string;
  
  /** Original SDL text */
  sdl: string;
  
  /** Parsed entities */
  entities: {
    [typeName: string]: {
      name: string;
      description: string;
      kind: 'OBJECT' | 'INTERFACE' | 'UNION';
      fields: {
        [fieldName: string]: {
          name: string;
          description: string;
          type: string;
          isScalar: boolean;
          isList: boolean;
          isNullable: boolean;
          /** For relationships: target entity type */
          relatesTo?: string;
        };
      };
    };
  };
}
```

---

## Implementation Phases

### Phase 0: Emergency Stabilization ⚡ (Immediate)

**Goal:** Get to a compilable, testable state.

**Tasks:**
1. ✅ Complete `src/ArtifactWriter.ts` (finish truncated functions)
2. ✅ Verify TypeScript compilation succeeds
3. ✅ Clean git staging area (commit/stash as appropriate)
4. ✅ Run single-repo test to identify runtime issues
5. ✅ Document current working state

**Success Criteria:**
- `npm run typecheck` passes
- `npm run build` succeeds
- Single test query completes without crashes

**Estimated Time:** 1 hour

---

### Phase 1: Foundation Refactoring 🏗️ (Week 1)

**Goal:** Restructure into layered architecture without breaking functionality.

**Tasks:**
1. Create new directory structure (`core/`, `backends/`, `analyzers/`)
2. Define `BackendWriter` interface in `backends/BackendWriter.ts`
3. Define core types in `core/types.ts`
4. Move and rename existing files:
   - `SchemaMapGenerator.ts` → `core/SchemaIntrospector.ts`
   - `GraphQLObjectToArrowTransformer.ts` → `core/ResponseTransformer.ts`
5. Extract DuckDB logic from `ArtifactWriter.ts` → `backends/DuckDBBackend.ts`
6. Update imports throughout codebase
7. Verify tests still pass

**Success Criteria:**
- New directory structure in place
- All tests pass
- Same functionality as before refactoring
- Zero ESLint errors

**Estimated Time:** 2-3 days

---

### Phase 2: Enhanced Audit Logging 📝 (Week 1)

**Goal:** Implement comprehensive audit trail.

**Tasks:**
1. Create `core/AuditLogger.ts`
2. Define `AuditLogEntry` structure
3. Capture query execution metadata
4. Track backend write operations
5. Log errors with full context
6. Write structured JSONL output
7. Update `main.ts` to use AuditLogger

**Success Criteria:**
- Every query execution logged with full context
- Backend operations tracked
- Errors include stack traces
- Audit log is DuckDB-queryable

**Estimated Time:** 1 day

---

### Phase 3: DuckDB Backend (Complete) 🦆 (Week 2)

**Goal:** Fully implement DuckDB backend with lossless metadata.

**Tasks:**
1. Implement `backends/DuckDBBackend.ts` with `BackendWriter` interface
2. Schema comments for all tables and columns
3. Generate `hydrate_metadata.sql` script
4. Parquet files with rich KV metadata
5. Generate `schema.md` documentation from GraphQL SDL
6. Performance optimization for large datasets
7. Integration tests

**Success Criteria:**
- DuckDB backend fully implements interface
- All schema descriptions preserved in comments
- Generated documentation is accurate
- Performance benchmarks meet targets

**Estimated Time:** 3-4 days

---

### Phase 4: Dgraph Backend (New) 🔷 (Week 3)

**Goal:** Add Dgraph as optional backend for graph storage.

**Tasks:**
1. Research Dgraph schema format and mutation API
2. Implement `backends/DgraphBackend.ts`
3. Transform GraphQL schema → Dgraph schema
4. Preserve descriptions in Dgraph predicates
5. Implement relationship mapping
6. Data mutation with proper node/edge structure
7. Configuration for Dgraph endpoint
8. Test GraphQL roundtrip (write to Dgraph, query back)
9. Documentation on Dgraph setup

**Success Criteria:**
- DgraphBackend implements `BackendWriter`
- Schema transformation preserves all metadata
- Relationships correctly represented
- Can query back via Dgraph's GraphQL endpoint
- Optional: disabled if Dgraph unavailable

**Estimated Time:** 4-5 days

---

### Phase 5: Domain Analyzer Refactoring 🎯 (Week 4)

**Goal:** Separate GitHub-specific logic into optional analyzer.

**Tasks:**
1. Create `analyzers/github/` directory
2. Move analysis logic from old `analysis.ts`
3. Implement `SupplyChainAnalyzer` class
4. Define analyzer interface for extensibility
5. Make analyzer execution optional (CLI flag)
6. Update tests for analyzer
7. Document how to create new analyzers

**Success Criteria:**
- GitHub analysis is optional and pluggable
- Core engine has zero GitHub-specific code
- Pattern established for future analyzers
- Documentation explains extensibility

**Estimated Time:** 2-3 days

---

### Phase 6: Documentation & Polish 📚 (Week 4)

**Goal:** Complete documentation and prepare for production use.

**Tasks:**
1. Update `README.md` with new architecture
2. Create `docs/BACKENDS.md` (how to add backends)
3. Create `docs/ANALYZERS.md` (how to add analyzers)
4. Update `HACKING.md` with new structure
5. Add integration tests for full pipeline
6. Performance benchmarks
7. Example configurations
8. Update CLI help text

**Success Criteria:**
- All documentation current and accurate
- New developers can add backends/analyzers
- README explains architecture clearly
- Integration tests cover key paths

**Estimated Time:** 2-3 days

---

## Migration Strategy

### Keeping It Working During Refactoring

**Principle:** Every commit should leave the codebase in a working state.

**Approach:**
1. **Copy, Don't Move:** Create new files before deleting old ones
2. **Incremental Imports:** Update imports file-by-file, test frequently
3. **Feature Flags:** Use environment variables to toggle new code paths
4. **Parallel Implementations:** Run old and new side-by-side initially
5. **Comprehensive Tests:** Verify output matches before/after

### Git Branch Strategy

```
main (stable)
  ↓
my-wip-parquet (current broken state)
  ↓
feature/phase-0-stabilization    ← Complete ArtifactWriter.ts
  ↓
feature/phase-1-architecture     ← Restructure directories
  ↓
feature/phase-2-audit-logging    ← Enhanced audit trail
  ↓
feature/phase-3-duckdb-backend   ← Complete DuckDB
  ↓
feature/phase-4-dgraph-backend   ← Add Dgraph
  ↓
feature/phase-5-analyzers        ← Separate domain logic
  ↓
feature/phase-6-docs             ← Documentation
  ↓
main (merge all phases)
```

Each phase branch merges to main after PR review.

---

## Configuration System

### Enhanced CLI Options

```bash
# Generic GraphQL query execution
graphql-collect \
  --endpoint https://api.github.com/graphql \
  --query queries/repo-artifacts.graphql \
  --input repos.jsonl \
  --output output/run-2025-10-11 \
  --backends duckdb,dgraph \
  --analyzers github-supply-chain \
  --audit-log audit.jsonl

# Backends (comma-separated list)
--backends duckdb              # DuckDB only (default)
--backends duckdb,dgraph       # Both backends
--backends all                 # All available backends

# Analyzers (comma-separated, optional)
--analyzers github-supply-chain  # GitHub analysis
--analyzers none                 # Skip analysis (generic mode)

# Backend-specific config (optional)
--dgraph-endpoint http://localhost:8080
--dgraph-schema-out dgraph-schema.graphql
```

### Configuration File (Optional)

```yaml
# graphql-collect.config.yaml
endpoint: https://api.github.com/graphql
query: queries/repo-artifacts.graphql
input: repos.jsonl
output: output/

backends:
  - name: duckdb
    enabled: true
    options:
      embed_metadata: true
      compression: zstd
  
  - name: dgraph
    enabled: true
    endpoint: http://localhost:8080
    options:
      batch_size: 100
      preserve_relationships: true

analyzers:
  - name: github-supply-chain
    enabled: true
    options:
      detect_sboms: true
      detect_signatures: true

audit:
  enabled: true
  output: audit.jsonl
  include_response_data: false  # Don't duplicate raw responses
```

---

## Success Metrics

### Technical Metrics
- ✅ All phases complete without breaking functionality
- ✅ Zero TypeScript/ESLint errors
- ✅ 100% test coverage for core modules
- ✅ DuckDB backend performance: <5s for 100 repos
- ✅ Dgraph backend functional with roundtrip queries
- ✅ Audit log captures all operations

### Architecture Metrics
- ✅ Core modules have zero domain-specific imports
- ✅ New backend can be added in <200 lines
- ✅ New analyzer can be added in <300 lines
- ✅ All interfaces properly documented

### Usability Metrics
- ✅ README explains architecture in <5 minutes
- ✅ New developer can add backend in <4 hours
- ✅ Configuration options are clear and intuitive

---

## Risk Mitigation

### Risk 1: Dgraph Complexity
**Mitigation:** Start with read-only mode, add mutations incrementally

### Risk 2: Performance Regression
**Mitigation:** Benchmark before/after each phase, optimize hotspots

### Risk 3: Breaking Changes During Refactor
**Mitigation:** Incremental approach, run tests after every file move

### Risk 4: Over-Engineering
**Mitigation:** YAGNI principle - only add abstraction when 2nd use case appears

---

## Future Enhancements (Post-Phase 6)

### Org-Level Reporting
- CLI flag: `--scope org` to query entire organization
- Aggregation queries across all repos
- Comparison reports (before/after snapshots)

### Additional Backends
- PostgreSQL backend (relational)
- MongoDB backend (document)
- Neo4j backend (graph)

### Additional Analyzers
- SBOM diff analyzer (compare versions)
- Dependency vulnerability scanner
- License compliance checker

### Performance Optimizations
- Parallel backend writes
- Incremental updates (only changed repos)
- Streaming transformations for large datasets

---

## Appendix: Technology Decisions

### Why DuckDB?
- Zero dependencies (embedded)
- Excellent Parquet support
- Fast analytical queries
- Portable `.db` files

### Why Dgraph?
- Native graph storage (relationships first-class)
- GraphQL serving capability (roundtrip!)
- Efficient for relationship queries
- Can serve as data API for dashboards

### Why Apache Arrow?
- Efficient in-memory columnar format
- Zero-copy transformations
- Native Parquet support
- Fast aggregations

### Why Plugin Architecture?
- Easy to add new backends without touching core
- Each backend can be tested independently
- User can disable unused backends
- Prepares for library extraction

---

**Next Steps:** Proceed with Phase 0 (Emergency Stabilization) immediately upon approval.
