
// RepositoryTarget defines the shape of a repository to analyze
export interface RepositoryTarget {
  owner: string; // GitHub organization or user
  name: string;  // Repository name
}

/**
 * List of repositories to analyze.
 * - Add or remove entries to control which repos are scanned.
 * - Used by main.ts to drive analysis and reporting.
 * - In mock mode, only repos present in src/mockData.ts will return data.
 */
export const repositories: RepositoryTarget[] = [
  { owner: 'sigstore', name: 'cosign' }, // Example: repo with SBOMs/signatures
  { owner: 'anchore', name: 'syft' },    // Example: repo with CI security tools
  { owner: 'github', name: 'docs' },     // Example: large/simple repo
  { owner: 'nonexistent-org', name: 'nonexistent-repo-123' }, // Example: triggers error handling
];
