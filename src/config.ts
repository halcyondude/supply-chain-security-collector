

// ============================================================================
// INPUT FORMATS
// ============================================================================

// RepositoryTarget defines the shape of a repository to analyze
export interface RepositoryTarget {
  owner: string; // GitHub organization or user
  name: string;  // Repository name
}

// RepositoryRef extends RepositoryTarget with additional metadata
export interface RepositoryRef extends RepositoryTarget {
  primary: boolean;  // Is this the primary/main repository for the project?
  branch?: string;   // Default branch override (optional)
}

// ProjectMetadata defines comprehensive CNCF project information
export interface ProjectMetadata {
  // Identity (required)
  project_name: string;
  repos: RepositoryRef[];
  
  // Identity (optional)
  display_name?: string;
  description?: string;
  
  // CNCF Maturity
  maturity?: 'graduated' | 'incubating' | 'sandbox' | 'archived';
  
  // Categorization
  category?: string;
  subcategory?: string;
  
  // Lifecycle Dates (ISO format: YYYY-MM-DD)
  date_accepted?: string;
  date_incubating?: string;
  date_graduated?: string;
  date_archived?: string;
  
  // URLs - Discovery & Documentation
  homepage_url?: string;
  repo_url?: string;
  package_manager_url?: string;  // CRITICAL for SBOM discovery
  docker_url?: string;           // CRITICAL for SBOM discovery
  documentation_url?: string;
  blog_url?: string;
  
  // OpenSSF & Compliance
  url_for_bestpractices?: string;
  clomonitor_name?: string;
  
  // Summary Fields
  summary_business_use_case?: string;
  summary_integrations?: string;
  summary_personas?: string;
  summary_tags?: string;
  summary_use_case?: string;
  summary_release_rate?: string;
  
  // Activity
  dev_stats_url?: string;
  
  // Security & Audits (summarized)
  has_security_audits?: boolean;
  security_audit_count?: number;
  latest_audit_date?: string;
  latest_audit_vendor?: string;
  
  // Organization
  crunchbase?: string;
  twitter?: string;
  
  // Relationships
  parent_project?: string;
  tag_associations?: string;  // Comma-separated
  
  // Annual Review
  annual_review_date?: string;
  annual_review_url?: string;
  
  // Overrides
  license?: string;
  default_branch?: string;
}

// Note: Repository list is now provided via input JSON files for all test and production runs.
// This file defines the type interfaces for both simple and rich input formats.
// Simple format: RepositoryTarget[] - just owner/name
// Rich format: ProjectMetadata[] - comprehensive CNCF metadata

