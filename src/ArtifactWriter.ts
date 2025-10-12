import * as fs from 'fs';
import * as path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import type { GetRepoDataArtifactsQuery, GetRepoDataExtendedInfoQuery } from './generated/graphql';
import { 
    normalizeGetRepoDataArtifacts, 
    getNormalizationStats as getArtifactsStats 
} from './normalizers/GetRepoDataArtifactsNormalizer';
import { 
    normalizeGetRepoDataExtendedInfo, 
    getNormalizationStats as getExtendedStats 
} from './normalizers/GetRepoDataExtendedInfoNormalizer';

/**
 * Write GraphQL response data to DuckDB and Parquet artifacts
 * 
 * Creates:
 * - Raw table with complete nested JSON structure
 * - Normalized relational tables (repositories, releases, release_assets)
 * - Parquet files for all tables
 */
export async function writeArtifacts(
    responses: unknown[],
    outputDir: string,
    queryName: string // Base name of the query file (e.g., "GetRepoDataArtifacts")
) {
    // Create database file
    const dbPath = path.join(outputDir, 'database.db');
    const db = await DuckDBInstance.create(dbPath);
    const con = await db.connect();

    try {
        // Install and load required extensions
        await con.run("INSTALL 'json'");
        await con.run("LOAD 'json'");
        await con.run("INSTALL 'parquet'");
        await con.run("LOAD 'parquet'");

        console.log('✅ DuckDB extensions loaded (json, parquet)');

        // Write responses to temporary JSON file for DuckDB to load
        const tempJsonPath = path.join(outputDir, 'temp_responses.json');
        fs.writeFileSync(tempJsonPath, JSON.stringify(responses, null, 2));

        // Create table name based on query name to avoid collisions
        const rawTableName = `raw_${queryName}`;

        // Load JSON into DuckDB using read_json with enhanced settings
        // This preserves the nested structure
        await con.run(`
            CREATE TABLE ${rawTableName} AS 
            SELECT * FROM read_json('${tempJsonPath}', 
                auto_detect=true, 
                format='array',
                maximum_depth=-1,
                sample_size=-1
            )
        `);

        console.log(`✅ Loaded JSON data into raw table: ${rawTableName}`);

        // Create normalized relational tables from typed GraphQL responses
        // This leverages TypeScript's type system and language features
        console.log('⏳ Creating normalized tables from typed GraphQL responses...');
        await createNormalizedTables(con, responses as GetRepoDataArtifactsQuery[], queryName, outputDir);

        // Export all tables to Parquet using DuckDB's native Parquet writer
        const parquetDir = path.join(outputDir, 'parquet');
        fs.mkdirSync(parquetDir, { recursive: true });
        
        console.log('⏳ Exporting tables to Parquet...');
        await exportTablesToParquet(con, parquetDir);

        // Clean up temp file
        fs.unlinkSync(tempJsonPath);

        console.log(`✅ DuckDB database written to ${dbPath}`);
        console.log(`✅ All artifacts written to ${outputDir}`);
    } finally {
        // Ensure connection is properly closed and all changes are flushed
        try {
            // Force checkpoint to write WAL to database file
            await con.run('CHECKPOINT');
            // Explicitly close the connection
            con.closeSync();
            console.log('✅ Database connection closed');
        } catch (error) {
            console.warn('Warning: Could not properly close database connection:', error);
        }
    }
}

/**
 * Create normalized relational tables from typed GraphQL responses
 * 
 * Dispatches to the appropriate normalizer based on query name.
 * Each normalizer extracts entities with proper FKs.
 * 
 * To add support for a new query:
 * 1. Create a normalizer function in src/normalizers/GetRepoDataMetricsNormalizer.ts
 *    - Export a normalize function that returns typed entities
 *    - Export a getNormalizationStats function for logging
 * 2. Import the types and functions at the top of this file
 * 3. Add a new else-if branch below for your query name
 * 4. Call your createTablesForMetricsQuery function (or similar)
 */
async function createNormalizedTables(
    con: DuckDBConnection, 
    responses: unknown[], 
    queryName: string,
    outputDir: string
) {
    console.log(`  Query type: ${queryName}`);
    
    // Dispatch to the appropriate normalizer based on query name
    if (queryName === 'GetRepoDataExtendedInfo') {
        await createTablesForExtendedInfoQuery(con, responses as GetRepoDataExtendedInfoQuery[], outputDir);
    } else if (queryName === 'GetRepoDataArtifacts') {
        // Legacy query - kept for compatibility
        await createTablesForArtifactsQuery(con, responses as GetRepoDataArtifactsQuery[], outputDir);
    } else {
        console.warn(`  ⚠️  Unknown query type: ${queryName}. Skipping normalization.`);
        console.warn(`  💡 To add support, create a normalizer and add handling here.`);
    }
}

/**
 * Create normalized tables for GetRepoDataArtifacts query
 */
async function createTablesForArtifactsQuery(
    con: DuckDBConnection,
    responses: GetRepoDataArtifactsQuery[],
    outputDir: string
) {
    const normalized = normalizeGetRepoDataArtifacts(responses);
    console.log(getArtifactsStats(normalized));

    // Write each table to a temp JSON file and load into DuckDB
    // Create base entity tables from normalized data
    if (normalized.base_repositories.length > 0) {
        const tempPath = path.join(outputDir, 'temp_repositories.json');
        fs.writeFileSync(tempPath, JSON.stringify(normalized.base_repositories));
        await con.run(`
            CREATE TABLE base_repositories AS 
            SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true)
        `);
        fs.unlinkSync(tempPath);
        console.log(`  ✅ Created table: base_repositories (${normalized.base_repositories.length} rows)`);
    }

    if (normalized.base_releases.length > 0) {
        const tempPath = path.join(outputDir, 'temp_releases.json');
        fs.writeFileSync(tempPath, JSON.stringify(normalized.base_releases));
        await con.run(`
            CREATE TABLE base_releases AS 
            SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true)
        `);
        fs.unlinkSync(tempPath);
        console.log(`  ✅ Created table: base_releases (${normalized.base_releases.length} rows)`);
    }

    if (normalized.base_release_assets.length > 0) {
        const tempPath = path.join(outputDir, 'temp_release_assets.json');
        fs.writeFileSync(tempPath, JSON.stringify(normalized.base_release_assets));
        await con.run(`
            CREATE TABLE base_release_assets AS 
            SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true)
        `);
        fs.unlinkSync(tempPath);
        console.log(`  ✅ Created table: base_release_assets (${normalized.base_release_assets.length} rows)`);
    }
}

/**
 * Create normalized tables for GetRepoDataExtendedInfo query
 */
async function createTablesForExtendedInfoQuery(
    con: DuckDBConnection,
    responses: GetRepoDataExtendedInfoQuery[],
    outputDir: string
) {
    const normalized = normalizeGetRepoDataExtendedInfo(responses);
    console.log(getExtendedStats(normalized));

    // Helper to write table from array with base_ prefix
    const writeTable = async (tableName: string, data: unknown[]) => {
        if (data.length === 0) return;
        
        const tempPath = path.join(outputDir, `temp_${tableName}.json`);
        fs.writeFileSync(tempPath, JSON.stringify(data));
        await con.run(`
            CREATE TABLE base_${tableName} AS 
            SELECT * FROM read_json('${tempPath}', format='array', auto_detect=true)
        `);
        fs.unlinkSync(tempPath);
        console.log(`  ✅ Created table: base_${tableName} (${data.length} rows)`);
    };

    // Create all base entity tables
    await writeTable('repositories', normalized.base_repositories);
    await writeTable('branch_protection_rules', normalized.base_branch_protection_rules);
    await writeTable('releases', normalized.base_releases);
    await writeTable('release_assets', normalized.base_release_assets);
    await writeTable('workflows', normalized.base_workflows);
}

async function exportTablesToParquet(con: DuckDBConnection, parquetDir: string) {
    // Get list of tables
    const result = await con.run(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' 
        AND table_type = 'BASE TABLE'
    `);

    const tables = await result.getRows();
    
    for (const row of tables) {
        const tableName = row[0];
        const parquetPath = path.join(parquetDir, `${tableName}.parquet`);
        
        await con.run(`
            COPY ${tableName} TO '${parquetPath}' 
            (FORMAT PARQUET, COMPRESSION 'ZSTD', ROW_GROUP_SIZE 100000)
        `);
        
        console.log(`✅ Exported ${tableName} to Parquet`);
    }
}

