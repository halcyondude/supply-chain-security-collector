// fetch-cncf-landscape.ts - Generate CNCF input files with comprehensive metadata
// 
// This script:
// 1. Downloads landscape.yml
// 2. Generates 3 input files:
//    - cncf-full-landscape.json (complete dataset)
//    - test-single-project.json (quick testing)
//    - test-three-projects.json (three projects for testing)
//
// Run with: npm run fetch-landscape

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// ============================================================================
// CONFIGURATION - Easy to change
// ============================================================================

const TEST_PROJECTS = {
  single: 'Kubernetes',      // Well-known graduated project
  triple: [
    'Kubernetes',            // Graduated
    'Harbor',                // Graduated
    'Atlantis'               // Sandbox, single repo
  ]
};

const CNCF_YML_URL = 'https://raw.githubusercontent.com/cncf/landscape/refs/heads/master/landscape.yml';

const SCRIPTS_DIR = __dirname;
const INPUT_DIR = path.join(__dirname, '../input');
const YML_FILE = path.join(SCRIPTS_DIR, 'landscape.yml');

// ============================================================================
// TYPES
// ============================================================================

interface RepositoryRef {
  owner: string;
  name: string;
  primary: boolean;
  branch?: string;
}

// Landscape YAML structure (minimal typing for what we use)
interface LandscapeItem {
  name: string;
  description?: string;
  project?: string;
  repo_url?: string;
  branch?: string;
  homepage_url?: string;
  docker_url?: string;
  url_for_bestpractices?: string;
  crunchbase?: string;
  twitter?: string;
  license?: string;
  additional_repos?: Array<{
    repo_url?: string;
    branch?: string;
  }>;
  extra?: {
    accepted?: string;
    incubating?: string;
    graduated?: string;
    archived?: string;
    package_manager_url?: string;
    docker_url?: string;
    documentation_url?: string;
    blog_url?: string;
    clomonitor_name?: string;
    summary_business_use_case?: string;
    summary_integrations?: string;
    summary_integration?: string;
    summary_personas?: string;
    summary_tags?: string;
    summary_use_case?: string;
    summary_release_rate?: string;
    dev_stats_url?: string;
    audits?: Array<{
      date?: string;
      vendor?: string;
    }>;
    parent_project?: string;
    tag?: string[];
    annual_review_date?: string;
    annual_review_url?: string;
  };
}

interface LandscapeSubcategory {
  name: string;
  items?: LandscapeItem[];
}

interface LandscapeCategory {
  name: string;
  subcategories?: LandscapeSubcategory[];
}

interface LandscapeData {
  landscape?: LandscapeCategory[];
  categories?: LandscapeCategory[];
}

interface ProjectMetadata {
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function downloadFile(url: string, destination: string): Promise<void> {
  console.log(`📥 Downloading ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const content = await response.text();
  fs.writeFileSync(destination, content);
  console.log(`   ✅ Saved to ${path.basename(destination)}`);
}

function normalizeMaturity(project?: string): 'graduated' | 'incubating' | 'sandbox' | 'archived' | undefined {
  if (!project) return undefined;
  const normalized = project.toLowerCase().replace('incubating', 'incubation');
  
  if (normalized === 'graduated') return 'graduated';
  if (normalized === 'incubation') return 'incubating';
  if (normalized === 'sandbox') return 'sandbox';
  if (normalized === 'archived') return 'archived';
  
  return undefined;
}

function extractRepositories(item: LandscapeItem): RepositoryRef[] {
  const repos: RepositoryRef[] = [];
  
  // Primary repository
  if (item.repo_url && typeof item.repo_url === 'string') {
    const match = item.repo_url.match(/github\.com\/([^/]+)\/([^/]+)$/);
    if (match) {
      repos.push({
        owner: match[1],
        name: match[2],
        primary: true,
        branch: item.branch
      });
    }
  }
  
  // Additional repositories
  if (Array.isArray(item.additional_repos)) {
    for (const additionalRepo of item.additional_repos) {
      if (additionalRepo.repo_url) {
        const match = additionalRepo.repo_url.match(/github\.com\/([^/]+)\/([^/]+)$/);
        if (match) {
          repos.push({
            owner: match[1],
            name: match[2],
            primary: false,
            branch: additionalRepo.branch
          });
        }
      }
    }
  }
  
  return repos;
}

function extractProjectMetadata(item: LandscapeItem, category: string, subcategory: string): ProjectMetadata | null {
  // Skip if not a CNCF project (no 'project' field means it's a member or non-CNCF item)
  if (!item.project) {
    return null;
  }
  
  // Skip if no GitHub repository
  const repos = extractRepositories(item);
  if (repos.length === 0) {
    return null;
  }
  
  const extra = item.extra || {};
  const audits = extra.audits || [];
  
  // Generate project name from display name (clean for use as ID)
  const project_name = item.name.replace(/[^a-zA-Z0-9-_. ]/g, '');
  
  const metadata: ProjectMetadata = {
    // Identity
    project_name,
    display_name: item.name,
    description: item.description,
    repos,
    
    // Maturity
    maturity: normalizeMaturity(item.project),
    
    // Categorization
    category,
    subcategory,
    
    // Lifecycle Dates
    date_accepted: extra.accepted,
    date_incubating: extra.incubating,
    date_graduated: extra.graduated,
    date_archived: extra.archived,
    
    // URLs
    homepage_url: item.homepage_url,
    repo_url: item.repo_url,
    package_manager_url: extra.package_manager_url,
    docker_url: extra.docker_url || item.docker_url,
    documentation_url: extra.documentation_url,
    blog_url: extra.blog_url,
    
    // OpenSSF & Compliance
    url_for_bestpractices: item.url_for_bestpractices,
    clomonitor_name: extra.clomonitor_name,
    
    // Summary Fields
    summary_business_use_case: extra.summary_business_use_case,
    summary_integrations: extra.summary_integrations || extra.summary_integration,
    summary_personas: extra.summary_personas,
    summary_tags: extra.summary_tags,
    summary_use_case: extra.summary_use_case,
    summary_release_rate: extra.summary_release_rate,
    
    // Activity
    dev_stats_url: extra.dev_stats_url,
    
    // Security & Audits
    has_security_audits: audits.length > 0,
    security_audit_count: audits.length,
    latest_audit_date: audits.length > 0 ? audits[audits.length - 1].date : undefined,
    latest_audit_vendor: audits.length > 0 ? audits[audits.length - 1].vendor : undefined,
    
    // Organization
    crunchbase: item.crunchbase,
    twitter: item.twitter,
    
    // Relationships
    parent_project: extra.parent_project,
    tag_associations: Array.isArray(extra.tag) ? extra.tag.join(',') : undefined,
    
    // Annual Review
    annual_review_date: extra.annual_review_date,
    annual_review_url: extra.annual_review_url,
    
    // Overrides
    license: item.license,
    default_branch: item.branch
  };
  
  return metadata;
}

function extractProjects(landscapeData: LandscapeData): ProjectMetadata[] {
  const projects: ProjectMetadata[] = [];
  const landscape = landscapeData.landscape || landscapeData.categories || [];
  
  for (const category of landscape) {
    const categoryName = category.name;
    
    for (const subcategory of category.subcategories || []) {
      const subcategoryName = subcategory.name;
      
      for (const item of subcategory.items || []) {
        const metadata = extractProjectMetadata(item, categoryName, subcategoryName);
        if (metadata) {
          projects.push(metadata);
        }
      }
    }
  }
  
  return projects;
}

function writeJsonFile(filename: string, data: ProjectMetadata[]): void {
  const outputPath = path.join(INPUT_DIR, filename);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`✅ Generated ${filename} (${data.length} projects)`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('🚀 CNCF Landscape Parser');
  console.log('='.repeat(50));
  console.log('');
  
  // Ensure directories exist
  if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
  }
  
  // Download landscape.yml
  await downloadFile(CNCF_YML_URL, YML_FILE);
  
  console.log('');
  console.log('📊 Parsing landscape...');
  
  // Parse YAML
  const ymlText = fs.readFileSync(YML_FILE, 'utf-8');
  const landscapeData = yaml.parse(ymlText);
  
  // Extract all projects
  const allProjects = extractProjects(landscapeData);
  console.log(`   Found ${allProjects.length} CNCF projects`);
  
  // Generate output files
  console.log('');
  console.log('📝 Generating input files...');
  
  // 1. Full landscape
  writeJsonFile('cncf-full-landscape.json', allProjects);
  
  // 2. Minimal example (already exists, just confirm)
  const minimalPath = path.join(INPUT_DIR, 'minimal-example.json');
  if (fs.existsSync(minimalPath)) {
    console.log(`✅ minimal-example.json (already exists)`);
  }
  
  // 3. Single project test file
  const singleProject = allProjects.find(p => p.display_name === TEST_PROJECTS.single);
  if (singleProject) {
    writeJsonFile('test-single-project.json', [singleProject]);
  } else {
    console.warn(`⚠️  Test project "${TEST_PROJECTS.single}" not found`);
  }
  
  // 4. Three projects test file
  const threeProjects = allProjects.filter(p => 
    TEST_PROJECTS.triple.includes(p.display_name || '')
  );
  if (threeProjects.length > 0) {
    writeJsonFile('test-three-projects.json', threeProjects);
  } else {
    console.warn(`⚠️  Test projects not found`);
  }
  
  console.log('');
  console.log('✅ Done!');
  console.log('');
  console.log('Generated files:');
  console.log('  - input/cncf-full-landscape.json');
  console.log('  - input/test-single-project.json');
  console.log('  - input/test-three-projects.json');
  console.log('');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
