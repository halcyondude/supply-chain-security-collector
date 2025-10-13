import * as fs from 'fs';
import * as path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import type { GetRepoDataArtifactsQuery, GetRepoDataExtendedInfoQuery } from './generated/graphql';
import type { ProjectMetadata, RepositoryTarget } from './config';
import { 
    normalizeGetRepoDataArtifacts, 
    getNormalizationStats as getArtifactsStats 
} from './normalizers/GetRepoDataArtifactsNormalizer';
import { 
    normalizeGetRepoDataExtendedInfo, 
    getNormalizationStats as getExtendedStats 
} from './normalizers/GetRepoDataExtendedInfoNormalizer';

/**
 * Write artifacts to database and Parquet files
 * - Raw JSON responses in a normalized table
 * - Normalized relational tables (repositories, releases, release_assets)
 * - Parquet files for all tables
 * - Optional CNCF metadata tables (base_cncf_projects, base_cncf_project_repos)
 */
export async function writeArtifacts(
    responses: unknown[],
    outputDir: string,
    queryName: string, // Base name of the query file (e.g., "GetRepoDataArtifacts")
    responseMetadata?: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }> // Optional CNCF metadata
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
        await createNormalizedTables(con, responses as GetRepoDataArtifactsQuery[], queryName, outputDir, responseMetadata);

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
    outputDir: string,
    responseMetadata?: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }>
) {
    console.log(`  Query type: ${queryName}`);
    
    // Dispatch to the appropriate normalizer based on query name
    if (queryName === 'GetRepoDataExtendedInfo') {
        await createTablesForExtendedInfoQuery(con, responses as GetRepoDataExtendedInfoQuery[], outputDir, responseMetadata);
    } else if (queryName === 'GetRepoDataArtifacts') {
        // Legacy query - kept for compatibility
        await createTablesForArtifactsQuery(con, responses as GetRepoDataArtifactsQuery[], outputDir, responseMetadata);
    } else {
        console.warn(`  ⚠️  Unknown query type: ${queryName}. Skipping normalization.`);
        console.warn(`  💡 To add support, create a normalizer and add handling here.`);
    }
    
    // Generate CNCF tables if we have metadata
    if (responseMetadata && responseMetadata.some(r => r.metadata)) {
        await createCNCFTables(con, responseMetadata, outputDir);
    }
}

/**
 * Create normalized tables for GetRepoDataArtifacts query
 */
async function createTablesForArtifactsQuery(
    con: DuckDBConnection,
    responses: GetRepoDataArtifactsQuery[],
    outputDir: string,
    _responseMetadata?: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }>
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
    outputDir: string,
    _responseMetadata?: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }>
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

/**
 * Create CNCF-specific tables from project metadata
 * Generates base_cncf_projects and base_cncf_project_repos tables
 */
async function createCNCFTables(
    con: DuckDBConnection,
    responseMetadata: Array<{ repo: RepositoryTarget; metadata?: ProjectMetadata }>,
    outputDir: string
) {
    // Extract unique projects (de-duplicate by project_name)
    const projectsMap = new Map<string, ProjectMetadata>();
    
    for (const item of responseMetadata) {
        if (item.metadata) {
            projectsMap.set(item.metadata.project_name, item.metadata);
        }
    }
    
    const projects = Array.from(projectsMap.values());
    
    if (projects.length === 0) {
        return; // No CNCF metadata
    }
    
    // Create base_cncf_projects table
    interface CNCFProject {
        project_name: string;
        display_name?: string;
        description?: string;
        maturity?: string;
        category?: string;
        subcategory?: string;
        date_accepted?: string;
        date_incubating?: string;
        date_graduated?: string;
        date_archived?: string;
        homepage_url?: string;
        repo_url?: string;
        package_manager_url?: string;
        docker_url?: string;
        documentation_url?: string;
        blog_url?: string;
        url_for_bestpractices?: string;
        clomonitor_name?: string;
        summary_business_use_case?: string;
        summary_integrations?: string;
        summary_personas?: string;
        summary_tags?: string;
        summary_use_case?: string;
        summary_release_rate?: string;
        dev_stats_url?: string;
        has_security_audits?: boolean;
        security_audit_count?: number;
        latest_audit_date?: string;
        latest_audit_vendor?: string;
        crunchbase?: string;
        twitter?: string;
        parent_project?: string;
        tag_associations?: string;
        annual_review_date?: string;
        annual_review_url?: string;
        license?: string;
        default_branch?: string;
    }
    
    const projectRecords: CNCFProject[] = projects.map(p => ({
        project_name: p.project_name,
        display_name: p.display_name,
        description: p.description,
        maturity: p.maturity,
        category: p.category,
        subcategory: p.subcategory,
        date_accepted: p.date_accepted,
        date_incubating: p.date_incubating,
        date_graduated: p.date_graduated,
        date_archived: p.date_archived,
        homepage_url: p.homepage_url,
        repo_url: p.repo_url,
        package_manager_url: p.package_manager_url,
        docker_url: p.docker_url,
        documentation_url: p.documentation_url,
        blog_url: p.blog_url,
        url_for_bestpractices: p.url_for_bestpractices,
        clomonitor_name: p.clomonitor_name,
        summary_business_use_case: p.summary_business_use_case,
        summary_integrations: p.summary_integrations,
        summary_personas: p.summary_personas,
        summary_tags: p.summary_tags,
        summary_use_case: p.summary_use_case,
        summary_release_rate: p.summary_release_rate,
        dev_stats_url: p.dev_stats_url,
        has_security_audits: p.has_security_audits,
        security_audit_count: p.security_audit_count,
        latest_audit_date: p.latest_audit_date,
        latest_audit_vendor: p.latest_audit_vendor,
        crunchbase: p.crunchbase,
        twitter: p.twitter,
        parent_project: p.parent_project,
        tag_associations: p.tag_associations,
        annual_review_date: p.annual_review_date,
        annual_review_url: p.annual_review_url,
        license: p.license,
        default_branch: p.default_branch,
    }));
    
    const tempProjectsPath = path.join(outputDir, 'temp_cncf_projects.json');
    fs.writeFileSync(tempProjectsPath, JSON.stringify(projectRecords));
    await con.run(`
        CREATE TABLE base_cncf_projects AS 
        SELECT * FROM read_json('${tempProjectsPath}', format='array', auto_detect=true)
    `);
    fs.unlinkSync(tempProjectsPath);
    console.log(`  ✅ Created table: base_cncf_projects (${projectRecords.length} rows)`);
    
    // Create base_cncf_project_repos junction table
    interface CNCFProjectRepo {
        project_name: string;
        owner: string;
        name: string;
        primary: boolean;
        branch?: string;
    }
    
    const projectRepoRecords: CNCFProjectRepo[] = [];
    
    for (const project of projects) {
        for (const repo of project.repos) {
            projectRepoRecords.push({
                project_name: project.project_name,
                owner: repo.owner,
                name: repo.name,
                primary: repo.primary,
                branch: repo.branch,
            });
        }
    }
    
    const tempReposPath = path.join(outputDir, 'temp_cncf_project_repos.json');
    fs.writeFileSync(tempReposPath, JSON.stringify(projectRepoRecords));
    await con.run(`
        CREATE TABLE base_cncf_project_repos AS 
        SELECT * FROM read_json('${tempReposPath}', format='array', auto_detect=true)
    `);
    fs.unlinkSync(tempReposPath);
    console.log(`  ✅ Created table: base_cncf_project_repos (${projectRepoRecords.length} rows)`);
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

