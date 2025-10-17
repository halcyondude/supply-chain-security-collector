/**
 * Centralized DuckDB Extension Management
 * 
 * This module provides a declarative registry of all DuckDB extensions used in the toolkit.
 * All extensions are loaded automatically when connecting to the database.
 */

import { DuckDBInstance } from '@duckdb/node-api';
import chalk from 'chalk';

type DuckDBConnection = Awaited<ReturnType<DuckDBInstance['connect']>>;

/**
 * Configuration for a DuckDB extension
 */
export interface ExtensionConfig {
  /** Extension name (as used in INSTALL/LOAD commands) */
  name: string;
  
  /** Human-readable description of what this extension provides */
  description: string;
}

/**
 * Registry of all DuckDB extensions used in the toolkit
 * 
 * This is the single source of truth for extension management.
 * To add a new extension, simply add an entry here.
 * All extensions are loaded automatically.
 */
export const EXTENSION_REGISTRY: ExtensionConfig[] = [
  {
    name: 'json',
    description: 'JSON parsing and querying for GraphQL responses',
  },
  {
    name: 'parquet',
    description: 'Parquet file I/O for exporting analytics-ready data',
  },
  {
    name: 'fts',
    description: 'Full-text search for workflow content and descriptions',
  },
  {
    name: 'autocomplete',
    description: 'Auto-completion support for SQL queries',
  },
  {
    name: 'ui',
    description: 'User interface extensions for data visualization',
  },
  {
    name: 'httpfs',
    description: 'HTTP/HTTPS file system support for reading remote files',
  },
];

/**
 * Install and load all DuckDB extensions
 * 
 * This is the primary function used by ArtifactWriter and SecurityAnalyzer.
 * It handles installation, loading, and logging in a consistent way.
 * 
 * @param con - DuckDB connection
 * @param options - Optional configuration
 * @returns Promise that resolves when all extensions are loaded
 * 
 * @example
 * ```typescript
 * await installAndLoadExtensions(con);
 * await installAndLoadExtensions(con, { verbose: true });
 * ```
 */
export async function installAndLoadExtensions(
  con: DuckDBConnection,
  options: {
    /** Enable verbose logging with extension descriptions */
    verbose?: boolean;
    /** Custom logger function (defaults to console.log with chalk) */
    logger?: (message: string) => void;
  } = {}
): Promise<void> {
  const { verbose = false, logger = console.log } = options;
  
  logger(chalk.gray('  Loading DuckDB extensions...'));
  
  for (const ext of EXTENSION_REGISTRY) {
    try {
      // Install extension
      await con.run(`INSTALL '${ext.name}';`);
      
      // Load extension
      await con.run(`LOAD '${ext.name}';`);
      
      // Log success
      if (verbose) {
        logger(chalk.gray(`    ✓ ${ext.name} - ${ext.description}`));
      } else {
        logger(chalk.gray(`    ✓ ${ext.name}`));
      }
    } catch (error) {
      // Non-fatal error - log warning and continue
      logger(chalk.yellow(`    ⚠ Failed to load extension '${ext.name}': ${error}`));
    }
  }
}

/**
 * Get a summary of all registered extensions
 * Useful for documentation and debugging
 */
export function getExtensionSummary(): string {
  const lines: string[] = [
    'DuckDB Extension Registry:',
    '',
  ];
  
  for (const ext of EXTENSION_REGISTRY) {
    lines.push(`  • ${ext.name} - ${ext.description}`);
  }
  
  return lines.join('\n');
}
