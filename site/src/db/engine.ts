/**
 * DuckDB-WASM engine initialization and query runner.
 *
 * Loads Parquet files from /data/ (not a .db file) because the collection
 * pipeline uses @duckdb/node-api v1.4.x (DuckDB 1.4.1) while duckdb-wasm
 * 1.32.0 embeds DuckDB ~1.2.x. The storage formats are incompatible across
 * minor versions, so we use Parquet as the interchange format (Parquet is
 * format-stable across DuckDB versions).
 */
import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

export interface QueryResult {
  columns: string[];
  rows: any[][];
}

/**
 * Initialize DuckDB-WASM and load the base dataset from Parquet files.
 *
 * The manifest at /data/manifest.json lists all exported tables and their
 * corresponding Parquet files. Each file is fetched, registered, and loaded
 * into the in-memory database as a table.
 */
export async function initDB(): Promise<void> {
  if (db) return; // already initialized

  // Select the best available bundle (EH > MVP)
  const DUCKDB_BUNDLES = await duckdb.selectBundle({
    mvp: {
      mainModule: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
        import.meta.url,
      ).href,
      mainWorker: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
        import.meta.url,
      ).href,
    },
    eh: {
      mainModule: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
        import.meta.url,
      ).href,
      mainWorker: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
        import.meta.url,
      ).href,
    },
  });

  const logger = new duckdb.ConsoleLogger();
  const worker = new Worker(DUCKDB_BUNDLES.mainWorker!);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(DUCKDB_BUNDLES.mainModule);
  conn = await db.connect();

  // Load base dataset from Parquet files listed in manifest
  await loadBaseData();
}

/**
 * Fetch the Parquet manifest and load each table into memory.
 */
async function loadBaseData(): Promise<void> {
  if (!db || !conn) throw new Error('DuckDB not initialized');

  try {
    const manifestResp = await fetch(`${import.meta.env.BASE_URL}data/manifest.json`);
    if (!manifestResp.ok) {
      console.warn(
        'No data manifest found at /data/manifest.json — running without base data',
      );
      return;
    }

    const manifest: { tables: Array<{ name: string; file: string }> } =
      await manifestResp.json();

    for (const table of manifest.tables) {
      const url = `${import.meta.env.BASE_URL}data/${table.file}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`Failed to fetch ${url}, skipping table ${table.name}`);
        continue;
      }

      const buffer = new Uint8Array(await resp.arrayBuffer());
      await db.registerFileBuffer(table.file, buffer);
      const safeName = `"${table.name.replace(/"/g, '""')}"`;
      const safeFile = table.file.replace(/'/g, "''");
      await conn.query(
        `CREATE TABLE ${safeName} AS SELECT * FROM read_parquet('${safeFile}')`,
      );
    }

    console.log(
      `Loaded ${manifest.tables.length} tables from base dataset`,
    );
  } catch (err) {
    console.error('Error loading base data:', err);
  }
}

/**
 * Execute a SQL query and return structured results.
 */
export async function runQuery(sql: string): Promise<QueryResult> {
  if (!conn) throw new Error('DuckDB not initialized — call initDB() first');

  const result = await conn.query(sql);
  const columns = result.schema.fields.map((f) => f.name);
  const rows: any[][] = [];

  for (let i = 0; i < result.numRows; i++) {
    const row: any[] = [];
    for (let j = 0; j < columns.length; j++) {
      const col = result.getChildAt(j);
      row.push(col?.get(i));
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Get the current connection (for advanced usage).
 */
export function getConnection(): duckdb.AsyncDuckDBConnection | null {
  return conn;
}
