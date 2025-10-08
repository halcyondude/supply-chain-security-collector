# Viewing Parquet Data with DuckDB

This guide explains how to explore the generated Parquet files using DuckDB, both via the command line and the web-based DuckDB Shell.

## Overview

The tool generates Parquet files with embedded schema metadata in timestamped output directories. These files can be explored without writing a custom UI using DuckDB's built-in capabilities.

## Installation

### DuckDB CLI

Install DuckDB CLI on macOS:

```bash
# Using the installation script
curl https://install.duckdb.org | sh

# Or using Homebrew
brew install duckdb

# Verify installation
duckdb --version
```

For other platforms, see [DuckDB Installation Guide](https://duckdb.org/docs/installation/).

## Viewing Data

### Option 1: DuckDB Local UI (Recommended)

**Available in DuckDB v1.2.1+**, the DuckDB Local UI is a full-featured web interface that runs entirely on your computer. Your data never leaves your machine.

**Starting the UI:**

```bash
# Launch UI directly
duckdb -ui

# Or from within any DuckDB client (CLI, Python, etc.)
duckdb
> CALL start_ui();
```

This automatically:
1. Installs the `ui` extension (if needed)
2. Starts an embedded HTTP server on localhost
3. Opens the UI in your default browser (default: http://localhost:4213)

**Loading Parquet Files:**

```bash
# Open UI with a Parquet file loaded as a view
duckdb -cmd "CREATE VIEW data AS FROM 'output/run-20250108-120000/test-single-analyzed.parquet';" -ui
```

**Key Features:**

- **Interactive Notebooks**: Write and execute SQL queries in notebook cells with syntax highlighting and autocomplete
- **Visual Schema Browser**: Explore databases, tables, and schemas in a tree view on the left panel
- **Table Summaries**: Click any table to see row counts, column types, and data profiles
- **Column Explorer**: Right panel shows statistical summaries and data distributions for query results
- **Export Controls**: Export results to CSV, JSON, or clipboard directly from the UI
- **Local-First**: All queries run locally - no data sent to external servers (unless you opt-in to MotherDuck)
- **Metadata Access**: Query embedded Parquet metadata using `parquet_kv_metadata()` function

**Example Session:**

```sql
-- Create a view of your Parquet file
CREATE VIEW data AS 
SELECT * FROM 'output/run-20250108-120000/test-single-analyzed.parquet';

-- Browse the data interactively
SELECT * FROM data LIMIT 100;

-- View embedded metadata
SELECT * FROM parquet_kv_metadata('output/run-20250108-120000/test-single-analyzed.parquet');

-- Analyze security coverage
SELECT 
  has_sbom,
  has_signatures,
  has_attestations,
  COUNT(*) as repo_count
FROM data
GROUP BY has_sbom, has_signatures, has_attestations;
```

**Configuration Options:**

```sql
-- Change UI port (default: 4213)
SET ui_local_port = 8080;

-- Start server without opening browser
CALL start_ui_server();

-- Stop the UI server
CALL stop_ui_server();
```

**Files Created:**

The UI stores notebooks and state in `~/.duckdb/extension_data/ui/ui.db`. Export files (CSV, JSON) are temporarily written to the same directory and cleared after export.

### Option 2: DuckDB Command Line (Local)

Use the provided script to explore your Parquet files:

```bash
# View a specific Parquet file
./scripts/view-parquet.sh output/run-20250108-120000/test-single-analyzed.parquet

# Or run DuckDB directly
duckdb -c "SELECT * FROM 'output/run-20250108-120000/test-single-analyzed.parquet' LIMIT 10;"
```

The script provides an interactive DuckDB session with helpful commands:

```sql
-- Show all columns
DESCRIBE SELECT * FROM data;

-- Count total rows
SELECT COUNT(*) FROM data;

-- View schema metadata embedded in the file
SELECT * FROM parquet_kv_metadata('output/run-20250108-120000/test-single-analyzed.parquet');

-- Query specific columns
SELECT repo_owner, repo_name, has_sbom, has_signatures 
FROM data 
WHERE has_sbom = true;

-- Aggregate statistics
SELECT 
  has_sbom,
  has_signatures,
  has_attestations,
  COUNT(*) as count
FROM data
GROUP BY has_sbom, has_signatures, has_attestations
ORDER BY count DESC;

-- Export results to CSV
COPY (SELECT * FROM data WHERE has_sbom = true) 
TO 'sbom-repos.csv' (HEADER, DELIMITER ',');
```

### Option 3: DuckDB Web Shell (No Installation Required)

The DuckDB Shell runs entirely in your browser using WebAssembly. No server or installation needed. This is a different tool from the Local UI - it's purely browser-based with no local DuckDB installation required.

**Access:** <https://shell.duckdb.org/>

**Steps:**

1. Open <https://shell.duckdb.org/> in your browser
2. Upload your Parquet file or reference it via URL (if publicly accessible)
3. Query the data interactively

```sql
-- If file is uploaded to the browser
SELECT * FROM read_parquet('uploaded-file.parquet') LIMIT 10;

-- If file is accessible via HTTPS URL
SELECT * FROM 'https://example.com/path/to/file.parquet' LIMIT 10;

-- View metadata
SELECT * FROM parquet_kv_metadata('uploaded-file.parquet');
```

**Features:**

- Full SQL support in the browser
- Arrow-based columnar processing
- Parquet, CSV, and JSON support
- No data leaves your browser (privacy)
- Share queries via URL encoding

**Limitations:**

- Local files must be uploaded to the browser (no direct filesystem access)
- For large files, CLI may be more performant
- HTTPS required for remote file access
- CORS headers required for cross-origin requests

**Comparison: Local UI vs Web Shell:**

| Feature | DuckDB Local UI | DuckDB Web Shell |
|---------|----------------|------------------|
| Installation | Requires DuckDB CLI | None (browser only) |
| Data Access | Direct filesystem | Upload or HTTPS URLs |
| Performance | Native speed | WebAssembly (slower) |
| Privacy | 100% local | 100% browser-local |
| Persistence | Notebooks saved locally | Session-based |
| Use Case | Regular analysis | Quick exploration |

### Option 4: Python with DuckDB

For programmatic analysis or Jupyter notebooks:

```python
import duckdb

# Connect and query
con = duckdb.connect()
result = con.execute("""
    SELECT * FROM 'output/run-20250108-120000/test-single-analyzed.parquet'
    WHERE has_sbom = true
""").fetchdf()

print(result)

# View embedded metadata
metadata = con.execute("""
    SELECT * FROM parquet_kv_metadata('output/run-20250108-120000/test-single-analyzed.parquet')
""").fetchall()

for key, value in metadata:
    print(f"{key}: {value}")
```

## Embedded Metadata

Each Parquet file contains embedded metadata as key-value pairs:

### Schema-Level Metadata
- `schema_title`: Title of the schema
- `schema_version`: Version of the schema
- `schema_description`: Description of the data structure
- `schema_generated_at`: Timestamp when schema was generated

### Runtime Metadata
- `run_query_type`: Query type used (artifacts/extended)
- `run_timestamp`: When the data collection ran
- `run_total_repos`: Total repositories processed
- `run_successful_repos`: Successfully processed repos
- `run_failed_repos`: Failed repository queries

### Field Descriptions
- `field_<name>`: Description of each field in the dataset

To view all metadata:

```sql
SELECT * FROM parquet_kv_metadata('path/to/file.parquet');
```

## Common Queries

### Security Artifact Coverage

```sql
-- Repos with complete security coverage
SELECT repo_owner, repo_name, repo_url
FROM data
WHERE has_sbom = true 
  AND has_signatures = true 
  AND has_attestations = true;

-- Coverage summary
SELECT 
  CASE 
    WHEN has_sbom AND has_signatures AND has_attestations THEN 'Full Coverage'
    WHEN has_sbom OR has_signatures OR has_attestations THEN 'Partial Coverage'
    ELSE 'No Coverage'
  END as coverage_level,
  COUNT(*) as repo_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM data
GROUP BY coverage_level;
```

### CI/CD Pipeline Analysis

```sql
-- Repos with SBOM generation in CI
SELECT repo_owner, repo_name, release_count
FROM data
WHERE has_sbom_ci = true
ORDER BY release_count DESC;

-- CI adoption rates
SELECT 
  SUM(CASE WHEN has_sbom_ci THEN 1 ELSE 0 END) as sbom_ci_count,
  SUM(CASE WHEN has_sign_ci THEN 1 ELSE 0 END) as sign_ci_count,
  SUM(CASE WHEN has_goreleaser_ci THEN 1 ELSE 0 END) as goreleaser_count,
  COUNT(*) as total_repos
FROM data;
```

### Artifact Analysis

```sql
-- Most common SBOM formats
SELECT sbom_format, COUNT(*) as count
FROM data
WHERE sbom_format IS NOT NULL
GROUP BY sbom_format
ORDER BY count DESC;

-- Signature file patterns
SELECT signature_format, COUNT(*) as count
FROM data
WHERE signature_format IS NOT NULL
GROUP BY signature_format
ORDER BY count DESC;
```

## Tips

1. **Start with the Local UI**: For regular analysis, the Local UI (Option 1) provides the best experience with notebooks, visual exploration, and full filesystem access
2. **Use CLI for Scripts**: The command-line interface (Option 2) is ideal for automation and scripting
3. **Web Shell for Quick Checks**: Use the browser-based shell (Option 3) when you need to quickly explore data without installing anything
4. **Performance**: DuckDB is optimized for analytical queries over columnar Parquet files - even large datasets are processed efficiently
5. **Memory**: Large files are processed via streaming, so you can analyze datasets larger than RAM
6. **Compression**: Files use ZSTD compression for optimal size/speed tradeoff
7. **Schema**: Use `DESCRIBE` to understand the data structure, or click tables in the Local UI
8. **Export**: Results can be exported to CSV, JSON, or other Parquet files from any interface

## Related Documentation

- [Data Model Documentation](./data-model.md) - Understanding raw vs analyzed data
- [Output Architecture](./output-architecture.md) - Directory structure and file organization
- [Schema Documentation](./schema.md) - Field definitions and data types

## External Resources

- [DuckDB Documentation](https://duckdb.org/docs/)
- [DuckDB Web Shell](https://shell.duckdb.org/)
- [Parquet Format Documentation](https://parquet.apache.org/docs/)
- [DuckDB Parquet Guide](https://duckdb.org/docs/data/parquet/overview)
