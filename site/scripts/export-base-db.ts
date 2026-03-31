/**
 * Export a lightweight Parquet dataset from the full landscape database.
 *
 * Produces individual Parquet files + a manifest.json for the exploration
 * platform's DuckDB-WASM engine to consume.
 *
 * Why Parquet instead of .db?
 *   @duckdb/node-api embeds DuckDB 1.4.1, while @duckdb/duckdb-wasm 1.32.0
 *   embeds DuckDB ~1.2.x. The .db storage format is incompatible across minor
 *   versions. Parquet is format-stable and works with any DuckDB version.
 *
 * Usage:
 *   cd <project-root>
 *   npx ts-node site/scripts/export-base-db.ts \
 *     --database output/cncf-full-landscape/current/database.db \
 *     --output site/public/data
 */

import { DuckDBInstance } from '@duckdb/node-api';
import * as fs from 'fs';
import * as path from 'path';

// Tables to export. Order does not matter.
// base_workflows is included but with content column stripped (too large).
// NO raw_* tables, NO FTS indexes (dict, docs, fields, stats, stopwords, terms).
const TABLES_TO_EXPORT: Array<{ name: string; sql?: string }> = [
  // Base tables
  { name: 'base_repositories' },
  { name: 'base_releases' },
  { name: 'base_release_assets' },
  {
    name: 'base_workflows',
    // Strip the content column — workflow YAML bloats the file
    sql: 'SELECT id, repository_id, filename FROM base_workflows',
  },
  { name: 'base_cncf_projects' },
  { name: 'base_cncf_project_repos' },
  { name: 'base_si_documents' },
  { name: 'base_si_sboms' },
  { name: 'base_branch_protection_rules' },
  { name: 'base_security_md' },

  // Aggregated tables
  { name: 'agg_artifact_patterns' },
  { name: 'agg_workflow_tools' },
  { name: 'agg_repo_summary' },
  { name: 'agg_repo_summary_sorted' },
  { name: 'agg_repo_detail' },
  { name: 'agg_cncf_project_summary' },
  { name: 'agg_executive_summary' },
  { name: 'agg_tool_summary' },
  { name: 'agg_tool_category_summary' },
  { name: 'agg_sbom_summary' },
  { name: 'agg_advanced_artifacts' },
  { name: 'agg_si_attestations' },
];

function parseArgs(): { database: string; output: string } {
  const args = process.argv.slice(2);
  let database = '';
  let output = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--database' && args[i + 1]) {
      database = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i];
    }
  }

  if (!database || !output) {
    console.error(
      'Usage: npx ts-node site/scripts/export-base-db.ts --database <path> --output <dir>',
    );
    process.exit(1);
  }

  return { database, output };
}

async function main() {
  const { database, output } = parseArgs();

  // Validate source database exists
  if (!fs.existsSync(database)) {
    console.error(`Database not found: ${database}`);
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(output, { recursive: true });

  console.log(`Opening database: ${database}`);
  const instance = await DuckDBInstance.create(database, {
    access_mode: 'READ_ONLY',
  });
  const conn = await instance.connect();

  // Get list of tables that actually exist in the source
  const tableResult = await conn.run(
    "SELECT DISTINCT table_name FROM duckdb_tables() WHERE schema_name = 'main'",
  );
  const existingTables = new Set<string>();
  for (const row of await tableResult.getRows()) {
    existingTables.add(row[0] as string);
  }

  const manifest: { tables: Array<{ name: string; file: string; rows: number }> } = {
    tables: [],
  };

  let totalBytes = 0;

  for (const table of TABLES_TO_EXPORT) {
    if (!existingTables.has(table.name)) {
      console.log(`  SKIP ${table.name} (not found in source)`);
      continue;
    }

    const parquetFile = `${table.name}.parquet`;
    const outputPath = path.join(output, parquetFile);
    const selectSql = table.sql ?? `SELECT * FROM ${table.name}`;

    try {
      // Export to Parquet with ZSTD compression
      await conn.run(
        `COPY (${selectSql}) TO '${outputPath}' (FORMAT PARQUET, COMPRESSION ZSTD)`,
      );

      // Get row count
      const countResult = await conn.run(
        `SELECT COUNT(*) FROM (${selectSql})`,
      );
      const countRows = await countResult.getRows();
      const rowCount = Number(countRows[0][0]);

      const stats = fs.statSync(outputPath);
      totalBytes += stats.size;

      manifest.tables.push({
        name: table.name,
        file: parquetFile,
        rows: rowCount,
      });

      console.log(
        `  OK   ${table.name}: ${rowCount} rows, ${(stats.size / 1024).toFixed(1)} KB`,
      );
    } catch (err) {
      console.error(`  FAIL ${table.name}: ${err}`);
    }
  }

  // Write manifest
  const manifestPath = path.join(output, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${manifestPath}`);
  console.log(
    `Total: ${manifest.tables.length} tables, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
  );

  if (totalBytes > 5 * 1024 * 1024) {
    console.warn(
      `WARNING: Total size ${(totalBytes / 1024 / 1024).toFixed(2)} MB exceeds 5MB target`,
    );
  }
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
