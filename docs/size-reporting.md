# File Size Reporting

## Overview

The tool automatically generates a comprehensive file size report (`SIZE-REPORT.md`) in each output directory. This report tracks storage usage for all generated artifacts and is designed to be committed to git for tracking storage growth over time.

## Generated Report

The `SIZE-REPORT.md` file is created automatically after each run and includes:

### Report Structure

```markdown
# Output Size Report

**Generated:** 2025-10-08T21:57:27.115Z
**Dataset:** GetRepoDataArtifacts
**Repositories:** 200 (195 successful, 5 failed)

## Files by Category

### Raw Responses
- `raw-responses.jsonl`: 2.4 MB

### Analyzed Data
- `graduated-analyzed.parquet`: 187 KB
- `graduated.csv`: 98 KB
- `graduated-analyzed.json`: 456 KB

### Schema Documentation
- `graduated-schema.json`: 8 KB

## Summary

| Category | Files | Total Size |
|----------|-------|------------|
| Raw Responses | 1 | 2.4 MB |
| Analyzed Data | 3 | 741 KB |
| Schema Documentation | 1 | 8 KB |
| **Total** | **5** | **3.1 MB** |
```

## File Categories

Files are automatically categorized for easy tracking:

- **Raw Responses**: JSONL files containing raw GitHub API responses
- **Analyzed Data**: Processed outputs (Parquet, CSV, analyzed JSON)
- **Schema Documentation**: Schema definitions and field documentation
- **Reports**: Size reports and other metadata

## Console Output

During execution, the tool displays a summary in the console:

```
📊 Output Size Summary
────────────────────────────────────────────────────────────

Analyzed Data:
  graduated-analyzed.parquet                       187.23 KB
  graduated.csv                                     98.45 KB
  graduated-analyzed.json                          456.12 KB

Schema Documentation:
  graduated-schema.json                              8.15 KB

Raw Responses:
  raw-responses.jsonl                                2.40 MB

────────────────────────────────────────────────────────────
Total: 5 files, 3.14 MB
────────────────────────────────────────────────────────────

✅ Size report saved: output/graduated-2025-10-08T21-57-27/SIZE-REPORT.md
```

## Git Integration

### Tracking in Version Control

The `.gitignore` file is configured to allow `SIZE-REPORT.md` files to be committed:

```gitignore
# Output and cache
output/
# But allow SIZE-REPORT.md to be committed for tracking storage growth
!output/*/SIZE-REPORT.md
```

This enables tracking storage growth over time in git history.

### Weekly CI Commits

When running in CI (see [CI Deployment Guide](./ci-deployment.md)), each weekly run commits the size report along with Parquet and CSV files:

```bash
git add output/**/*.parquet
git add output/**/*.csv
git add output/**/SIZE-REPORT.md
git commit -m "chore: weekly data collection - 2025-01-08"
```

### Viewing Size History

To track size growth over time:

```bash
# View all size reports in git history
git log --all --oneline -- "**/SIZE-REPORT.md"

# Show size report from a specific run
git show abc123:output/graduated-2025-01-08T00-00-00/SIZE-REPORT.md

# Compare sizes between two runs
diff \
  <(git show abc123:output/graduated-2025-01-01T00-00-00/SIZE-REPORT.md) \
  <(git show def456:output/graduated-2025-01-08T00-00-00/SIZE-REPORT.md)
```

## Expected File Sizes

Based on actual measurements:

### Small Dataset (1-5 repos)
```
Raw Responses:      10-50 KB
Analyzed JSON:      2-10 KB
Parquet:            1-5 KB (70-80% smaller than JSON)
CSV:                2-5 KB
Schema:             8 KB (constant)
Total:              ~25-80 KB
```

### Medium Dataset (20-50 repos)
```
Raw Responses:      200-500 KB
Analyzed JSON:      40-100 KB
Parquet:            20-50 KB
CSV:                10-25 KB
Schema:             8 KB
Total:              ~280-680 KB
```

### Large Dataset (200+ repos)
```
Raw Responses:      2-5 MB (grows ~15 KB per repo)
Analyzed JSON:      400-800 KB
Parquet:            150-300 KB
CSV:                100-200 KB
Schema:             8 KB
Total:              ~2.6-6 MB
```

## Storage Optimization

The size report helps identify opportunities for optimization:

### Parquet Compression

Parquet files achieve 70-80% compression compared to JSON:
- **JSON**: 456 KB
- **Parquet**: 187 KB (59% smaller)
- **Savings**: 269 KB per dataset

### Selective Commits

For CI workflows, you can commit only the most efficient formats:

**Option 1: Parquet + CSV only (Recommended)**
- Excludes raw-responses.jsonl and analyzed JSON
- ~300 KB per weekly run for 200 repos
- Sustainable without Git LFS

**Option 2: All files with Git LFS**
- Includes raw responses for reproducibility
- ~3 MB per weekly run for 200 repos
- Requires Git LFS after ~300 MB

The size report makes it easy to make informed decisions about storage strategy.

## Automation

The size report is generated automatically as part of the normal `generateReports()` flow. No additional configuration or flags are required.

### Implementation

The report is generated by the `generateSizeReport()` function in `src/sizeReport.ts`, which:

1. Scans the output directory for all generated files
2. Calculates file sizes using `fs.stat()`
3. Groups files by category
4. Calculates subtotals and total size
5. Generates both console output and markdown file
6. Uses human-readable formatting (KB, MB, GB)

### Extensibility

The size report can be extended to include additional metrics:

- Compression ratios
- Growth rates compared to previous runs
- Per-repository size breakdown
- Storage projections

These enhancements can be added by modifying `src/sizeReport.ts`.

## Related Documentation

- [CI Deployment Guide](./ci-deployment.md) - Weekly automation and storage strategies
- [Output Architecture](./output-architecture.md) - Output directory structure
- [Data Model](./data-model.md) - Understanding generated files
