// src/parquetWriter.ts
// DuckDB-based Parquet file generation with schema metadata preservation

import * as fs from 'fs/promises';
import duckdb from 'duckdb';
import chalk from 'chalk';

/**
 * Runtime metadata about the data collection run
 */
export type RunMetadata = {
  queryType: string;
  timestamp: string;
  totalRepos: number;
  successfulRepos: number;
  failedRepos: number;
};

/**
 * Schema field definition from our schema.json files
 */
type SchemaField = {
  type: string;
  description: string;
  example: unknown;
  category: string;
};

/**
 * Our custom schema documentation format
 */
type SchemaDocumentation = {
  title: string;
  version: string;
  description: string;
  generated_at: string;
  fields: Record<string, SchemaField>;
};

/**
 * Generate Parquet files from JSON data using DuckDB.
 * Embeds field descriptions from our schema.json as Parquet key-value metadata.
 * 
 * @param basePath - Base path for output files (without extension)
 * @param analyzedJsonPath - Path to the analyzed JSON file
 * @param schemaJsonPath - Path to our schema documentation JSON
 * @param runMetadata - Optional runtime metadata to embed
 */
export async function generateParquetFiles(
  basePath: string,
  analyzedJsonPath: string,
  schemaJsonPath: string,
  runMetadata?: RunMetadata
): Promise<void> {
  try {
    // Check if input files exist
    await fs.access(analyzedJsonPath);
    await fs.access(schemaJsonPath);
    
    // Load schema to extract field descriptions
    const schemaContent = await fs.readFile(schemaJsonPath, 'utf-8');
    const schema: SchemaDocumentation = JSON.parse(schemaContent);
    
    // Build KV_METADATA from schema fields
    const kvMetadata = buildKvMetadataFromSchema(schema, runMetadata);
    
    // Generate Parquet file
    const parquetPath = `${basePath}-analyzed.parquet`;
    await convertJsonToParquet(analyzedJsonPath, parquetPath, kvMetadata);
    
    console.log(chalk.green(`✅ Parquet file: ${parquetPath}`));
    
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow(`⚠️  Skipping Parquet generation: Input files not found`));
    } else {
      console.error(chalk.red(`Failed to generate Parquet files:`), error);
    }
  }
}

/**
 * Build DuckDB KV_METADATA clause from our schema documentation
 */
function buildKvMetadataFromSchema(
  schema: SchemaDocumentation,
  runMetadata?: RunMetadata
): Record<string, string> {
  const kv: Record<string, string> = {
    // Schema-level metadata
    'schema_title': schema.title,
    'schema_version': schema.version,
    'schema_description': schema.description,
    'schema_generated_at': schema.generated_at,
  };
  
  // Add runtime metadata if provided
  if (runMetadata) {
    kv['run_query_type'] = runMetadata.queryType;
    kv['run_timestamp'] = runMetadata.timestamp;
    kv['run_total_repos'] = runMetadata.totalRepos.toString();
    kv['run_successful_repos'] = runMetadata.successfulRepos.toString();
    kv['run_failed_repos'] = runMetadata.failedRepos.toString();
  }
  
  // Add all field descriptions from schema
  Object.entries(schema.fields).forEach(([fieldName, fieldDef]) => {
    kv[`field_${fieldName}`] = fieldDef.description;
  });
  
  return kv;
}

/**
 * Convert JSON file to Parquet using DuckDB with custom key-value metadata
 */
async function convertJsonToParquet(
  jsonPath: string,
  parquetPath: string,
  kvMetadata: Record<string, string>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(':memory:');
    
    // Build KV_METADATA SQL clause
    const kvMetadataEntries = Object.entries(kvMetadata)
      .map(([key, value]) => {
        // Escape single quotes in values for SQL
        const escapedValue = value.replace(/'/g, "''");
        return `${key}: '${escapedValue}'`;
      })
      .join(',\n        ');
    
    const sql = `
      COPY (
        SELECT * FROM read_json_auto('${jsonPath}')
      ) TO '${parquetPath}' (
        FORMAT PARQUET,
        COMPRESSION ZSTD,
        ROW_GROUP_SIZE 100000,
        KV_METADATA {
          ${kvMetadataEntries}
        }
      );
    `;
    
    db.exec(sql, (err: Error | null) => {
      db.close();
      
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Query Parquet key-value metadata (for validation/debugging)
 */
export async function readParquetMetadata(parquetPath: string): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(':memory:');
    
    db.all(
      `SELECT * FROM parquet_kv_metadata('${parquetPath}')`,
      (err: Error | null, rows: unknown[]) => {
        db.close();
        
        if (err) {
          reject(err);
        } else {
          // Convert rows to key-value map
          const metadata: Record<string, string> = {};
          (rows as Array<{ key: string; value: string }>).forEach(row => {
            metadata[row.key] = row.value;
          });
          resolve(metadata);
        }
      }
    );
  });
}
