
// RepositoryTarget defines the shape of a repository to analyze
export interface RepositoryTarget {
  owner: string; // GitHub organization or user
  name: string;  // Repository name
}

// Note: Repository list is now provided via input JSONL files for all test and production runs.
// This file is not used for test automation or CLI runs with --input.
