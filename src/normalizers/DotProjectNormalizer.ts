/**
 * DotProjectNormalizer.ts
 *
 * Parses fetched project.yaml text (from the <org>/.project repository) and
 * normalizes it into flat relational records suitable for DuckDB insert.
 *
 * Schema source: ~/gh/f/cncf/automation/utilities/dot-project/SCHEMA.md
 *
 * Tables produced:
 *   dot_project              — one row per project org (top-level fields)
 *   dot_project_repositories — one row per URL in repositories[]
 *   dot_project_maturity_log — one row per maturity_log entry
 *   dot_project_audits       — one row per audits[] entry
 */

import * as yaml from 'yaml';

// ---------------------------------------------------------------------------
// Raw .project YAML shape (what we care about)
// ---------------------------------------------------------------------------

export interface DotProjectYaml {
  schema_version?: string;
  slug?: string;
  name?: string;
  description?: string;
  type?: string;
  project_lead?: string | string[];
  repositories?: string[];
  website?: string;
  maturity_log?: Array<{
    phase?: string;
    date?: string | Date;
    issue?: string;
  }>;
  audits?: Array<{
    date?: string | Date;
    type?: string;
    url?: string;
  }>;
  security?: {
    policy?: { path?: string };
    threat_model?: { path?: string };
    contact?: {
      email?: string;
      advisory_url?: string;
    };
  };
  package_managers?: Record<string, string | string[]>;
  landscape?: {
    category?: string;
    subcategory?: string;
  };
  // We capture but don't deep-expand governance / legal / documentation
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalized record types (DuckDB row shapes)
// ---------------------------------------------------------------------------

export interface DotProjectRecord {
  /** Synthetic primary key: the GitHub org login */
  org: string;
  /** Source URL: https://github.com/<org>/.project/blob/HEAD/project.yaml */
  source_url: string;
  schema_version: string | null;
  slug: string | null;
  name: string | null;
  description: string | null;
  type: string | null;
  /**
   * project_lead serialized as a comma-separated string
   * (handles both string and string[] schema variants)
   */
  project_lead: string | null;
  repository_count: number;
  website: string | null;
  /** Current/latest maturity phase (last entry in maturity_log) */
  current_maturity: string | null;
  /** Date of current/latest maturity phase transition */
  current_maturity_date: string | null;
  audit_count: number;
  /** Security policy path */
  security_policy_path: string | null;
  /** Threat model path */
  security_threat_model_path: string | null;
  /** Security contact email */
  security_contact_email: string | null;
  /** Security advisory URL */
  security_advisory_url: string | null;
  /** Landscape category */
  landscape_category: string | null;
  /** Landscape subcategory */
  landscape_subcategory: string | null;
  /** package_managers serialized as JSON string */
  package_managers_json: string | null;
  fetched_at: string;
}

export interface DotProjectRepository {
  /** FK → dot_project.org */
  org: string;
  /** Ordinal position in repositories[] (0-indexed) */
  position: number;
  /** Raw URL from repositories[] */
  repo_url: string;
  /** Parsed GitHub owner (null if not a github.com URL) */
  repo_owner: string | null;
  /** Parsed GitHub repo name (null if not a github.com URL) */
  repo_name: string | null;
}

export interface DotProjectMaturityEntry {
  /** FK → dot_project.org */
  org: string;
  /** Ordinal position in maturity_log[] (0-indexed, chronological) */
  position: number;
  phase: string | null;
  date: string | null;
  issue: string | null;
}

export interface DotProjectAudit {
  /** FK → dot_project.org */
  org: string;
  /** Ordinal position in audits[] (0-indexed) */
  position: number;
  date: string | null;
  type: string | null;
  url: string | null;
}

export interface DotProjectNormalized {
  dot_project: DotProjectRecord[];
  dot_project_repositories: DotProjectRepository[];
  dot_project_maturity_log: DotProjectMaturityEntry[];
  dot_project_audits: DotProjectAudit[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a github.com URL and return { owner, name } or null.
 * Handles https://github.com/org/repo and https://github.com/org/repo.git
 */
function parseGithubUrl(url: string): { owner: string; name: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/#? ]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    name: match[2].replace(/\.git$/, ''),
  };
}

/** Coerce a date value (string or Date) to ISO string or null */
function toIsoString(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

/** Coerce project_lead (string | string[]) to a comma-separated string */
function serializeProjectLead(lead: string | string[] | null | undefined): string | null {
  if (!lead) return null;
  if (Array.isArray(lead)) {
    const flat = lead.map(s => String(s).trim()).filter(Boolean);
    return flat.length > 0 ? flat.join(', ') : null;
  }
  const s = String(lead).trim();
  return s || null;
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse a single project.yaml text blob fetched from <org>/.project
 * and return normalized records.
 *
 * @param org - GitHub org login (used as FK / PK)
 * @param projectYamlText - Raw YAML text of project.yaml
 * @param sourceUrl - Canonical source URL for provenance
 * @returns Normalized records, or null if YAML is invalid / empty
 */
export function parseDotProject(
  org: string,
  projectYamlText: string,
  sourceUrl: string
): DotProjectNormalized | null {
  let parsed: DotProjectYaml;
  try {
    parsed = yaml.parse(projectYamlText) as DotProjectYaml;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const now = new Date().toISOString();

  // ── maturity_log ──────────────────────────────────────────────────────────
  const maturityLog = parsed.maturity_log ?? [];
  const maturityEntries: DotProjectMaturityEntry[] = maturityLog.map((entry, i) => ({
    org,
    position: i,
    phase: entry.phase ?? null,
    date: toIsoString(entry.date),
    issue: entry.issue ?? null,
  }));

  // Current maturity = last chronological entry
  const lastMaturity = maturityLog.length > 0 ? maturityLog[maturityLog.length - 1] : null;

  // ── audits ────────────────────────────────────────────────────────────────
  const rawAudits = parsed.audits ?? [];
  const auditEntries: DotProjectAudit[] = rawAudits.map((audit, i) => ({
    org,
    position: i,
    date: toIsoString(audit.date),
    type: audit.type ?? null,
    url: audit.url ?? null,
  }));

  // ── repositories ──────────────────────────────────────────────────────────
  const rawRepos = parsed.repositories ?? [];
  const repoEntries: DotProjectRepository[] = rawRepos.map((url, i) => {
    const gh = parseGithubUrl(url);
    return {
      org,
      position: i,
      repo_url: url,
      repo_owner: gh?.owner ?? null,
      repo_name: gh?.name ?? null,
    };
  });

  // ── package_managers ──────────────────────────────────────────────────────
  let packageManagersJson: string | null = null;
  if (parsed.package_managers && typeof parsed.package_managers === 'object') {
    try {
      packageManagersJson = JSON.stringify(parsed.package_managers);
    } catch {
      packageManagersJson = null;
    }
  }

  // ── top-level record ──────────────────────────────────────────────────────
  const record: DotProjectRecord = {
    org,
    source_url: sourceUrl,
    schema_version: parsed.schema_version ?? null,
    slug: parsed.slug ?? null,
    name: parsed.name ?? null,
    description: parsed.description ?? null,
    type: parsed.type ?? null,
    project_lead: serializeProjectLead(parsed.project_lead),
    repository_count: rawRepos.length,
    website: parsed.website ?? null,
    current_maturity: lastMaturity?.phase ?? null,
    current_maturity_date: toIsoString(lastMaturity?.date),
    audit_count: rawAudits.length,
    security_policy_path: parsed.security?.policy?.path ?? null,
    security_threat_model_path: parsed.security?.threat_model?.path ?? null,
    security_contact_email: parsed.security?.contact?.email ?? null,
    security_advisory_url: parsed.security?.contact?.advisory_url ?? null,
    landscape_category: parsed.landscape?.category ?? null,
    landscape_subcategory: parsed.landscape?.subcategory ?? null,
    package_managers_json: packageManagersJson,
    fetched_at: now,
  };

  return {
    dot_project: [record],
    dot_project_repositories: repoEntries,
    dot_project_maturity_log: maturityEntries,
    dot_project_audits: auditEntries,
  };
}

/**
 * Merge multiple parseDotProject results into a single DotProjectNormalized.
 * Skips any null results (parse errors / missing repos).
 */
export function mergeDotProjectResults(
  results: (DotProjectNormalized | null)[]
): DotProjectNormalized {
  const merged: DotProjectNormalized = {
    dot_project: [],
    dot_project_repositories: [],
    dot_project_maturity_log: [],
    dot_project_audits: [],
  };

  for (const r of results) {
    if (!r) continue;
    merged.dot_project.push(...r.dot_project);
    merged.dot_project_repositories.push(...r.dot_project_repositories);
    merged.dot_project_maturity_log.push(...r.dot_project_maturity_log);
    merged.dot_project_audits.push(...r.dot_project_audits);
  }

  return merged;
}

export function getDotProjectStats(normalized: DotProjectNormalized): string {
  return [
    `Normalized ${normalized.dot_project.length} .project records`,
    `  ${normalized.dot_project_repositories.length} repositories`,
    `  ${normalized.dot_project_maturity_log.length} maturity_log entries`,
    `  ${normalized.dot_project_audits.length} audits`,
  ].join('\n');
}
