// This file provides mock data for development and testing in MOCK_GITHUB=1 mode.
// The structure matches the shape of the real GitHub GraphQL API response for GetRepoData.


import * as path from 'path';
import * as fs from 'fs';

/**
 * Loads mock data from src/mockdata/ based on query, owner, repo, and optional variant.
 * Returns the full API response shape as returned by GitHub (e.g., { data: { ... } }).
 *
 * Usage:
 *   getMockApiResponse('GetRepoData', 'sigstore', 'cosign')
 *   getMockApiResponse('GetRepoData', 'sigstore', 'cosign', 'release-v0.1.0')
 */

export function getMockApiResponse(query: string, owner: string, repo: string, variant?: string): unknown {
  const base = path.join(__dirname, 'mockdata');
  const fileName = [query, owner, repo, variant].filter(Boolean).join('-') + '.json';
  const filePath = path.join(base, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Mock data file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
}
