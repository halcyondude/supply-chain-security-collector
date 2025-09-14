export interface RepositoryTarget {
  owner: string;
  name: string;
}

export const repositories: RepositoryTarget[] = [
  { owner: 'sigstore', name: 'cosign' }, // SBOMs/signatures
  { owner: 'anchore', name: 'syft' },    // CI security tools
  { owner: 'github', name: 'docs' },     // Simple/large repo
  { owner: 'nonexistent-org', name: 'nonexistent-repo-123' }, // Error handling
];
