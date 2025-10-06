// src/rawResponseWriter.ts
// This module handles writing raw API responses to JSONL files with metadata.
// Each line contains: {"metadata": {...}, "response": {...}}

import * as fs from 'fs/promises';
import chalk from 'chalk';

/**
 * Metadata attached to each raw API response
 */
export type RawResponseMetadata = {
  queryType: string;  // e.g., 'GetRepoDataArtifacts', 'GetRepoDataExtendedInfo'
  timestamp?: string; // ISO 8601 timestamp
  owner: string;      // Repository owner
  repo: string;       // Repository name
  inputs?: Record<string, unknown>; // Query variables used (optional)
};

/**
 * Structure of each line in the JSONL file
 */
export type RawResponseEntry = {
  metadata: RawResponseMetadata;
  response: unknown; // The full GraphQL API response
};

/**
 * Appends a raw API response to a JSONL file with metadata.
 * Creates the file if it doesn't exist.
 * 
 * @param filePath - Absolute path to the JSONL file
 * @param data - Object containing queryType, owner, repo, and response
 */
export async function appendRawResponse(
  filePath: string,
  data: {
    queryType: string;
    owner: string;
    repo: string;
    response: unknown;
    inputs?: Record<string, unknown>;
  }
): Promise<void> {
  const entry: RawResponseEntry = {
    metadata: {
      queryType: data.queryType,
      timestamp: new Date().toISOString(),
      owner: data.owner,
      repo: data.repo,
      inputs: data.inputs || { owner: data.owner, name: data.repo },
    },
    response: data.response,
  };

  try {
    // Append as a single line (JSONL format)
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filePath, line, 'utf-8');
  } catch (error) {
    console.error(chalk.red(`Failed to write raw response to ${filePath}:`), error);
  }
}

/**
 * TODO (Phase 2): Read raw responses from JSONL file for mock mode
 * 
 * @param filePath - Absolute path to the JSONL file
 * @param owner - Repository owner to filter by
 * @param repo - Repository name to filter by
 * @returns The most recent raw response for the given repo, or null if not found
 */
export async function readRawResponse(
  filePath: string,
  owner: string,
  repo: string
): Promise<unknown | null> {
  // TODO: Implement for Phase 1 mock mode integration
  // 1. Read file line by line
  // 2. Parse each line as JSON
  // 3. Filter by owner/repo
  // 4. Return most recent entry (highest timestamp)
  // 5. Return null if not found
  
  // Stub: acknowledge parameters to avoid lint errors
  void filePath;
  void owner;
  void repo;
  
  console.warn(chalk.yellow(`TODO: readRawResponse not yet implemented. Falling back to src/mockdata/`));
  return null;
}

/**
 * TODO (Phase 2): Export individual mock files from JSONL
 * 
 * @param sourcePath - Path to source JSONL file
 * @param destDir - Destination directory for individual files
 */
export async function exportMocksFromJsonl(
  sourcePath: string,
  destDir: string
): Promise<void> {
  // TODO: Implement for Phase 2 export-mocks subcommand
  // 1. Read JSONL file line by line
  // 2. For each entry, create file: GetRepoData_{owner}_{repo}.json
  // 3. File contains just the response field (not metadata)
  // 4. Overwrite existing files
  
  // Stub: acknowledge parameters to avoid lint errors
  void sourcePath;
  void destDir;
  
  console.warn(chalk.yellow(`TODO: exportMocksFromJsonl not yet implemented`));
}
