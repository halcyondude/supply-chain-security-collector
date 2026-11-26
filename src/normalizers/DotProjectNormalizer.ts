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

// NOTE: These types describe the *expected* shape. Because .project files are
// hand-edited and often violate the schema, the parser treats every field as
// untrusted (uses `unknown`-safe accessors) and never assumes an array/object
// is actually an array/object. The optional fields below are documentation of
// intent, not a runtime guarantee.
export interface DotProjectYaml {
  schema_version?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  type?: unknown;
  project_lead?: unknown;
  repositories?: unknown;
  website?: unknown;
  maturity_log?: unknown;
  audits?: unknown;
  security?: unknown;
  package_managers?: unknown;
  landscape?: unknown;
  // We capture but don't deep-expand governance / legal / documentation
  [key: string]: unknown;
}

/** Expected shape of maintainers.yaml (also treated as untrusted at runtime). */
export interface MaintainersYaml {
  maintainers?: unknown;
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

export interface DotProjectMaintainer {
  /** FK → dot_project.org */
  org: string;
  /** project_id from maintainers.yaml (should match slug in project.yaml) */
  project_id: string | null;
  /** GitHub org from the maintainer entry (may differ from probe org) */
  maintainer_org: string | null;
  /** Team name (e.g. project-maintainers) */
  team: string | null;
  /** GitHub handle (normalized: trimmed, leading @ stripped) */
  member: string;
}

export interface DotProjectNormalized {
  dot_project: DotProjectRecord[];
  dot_project_repositories: DotProjectRepository[];
  dot_project_maturity_log: DotProjectMaturityEntry[];
  dot_project_audits: DotProjectAudit[];
  dot_project_maintainers: DotProjectMaintainer[];
  /** Non-fatal schema violations encountered while parsing (for logging) */
  warnings: DotProjectWarning[];
}

// ---------------------------------------------------------------------------
// Helpers — all defensive: real .project files in the wild are hand-edited and
// frequently violate the schema. Never throw; coerce/skip and keep going.
// ---------------------------------------------------------------------------

/**
 * A warning accumulated during parsing (schema violations that we tolerate).
 * Surfaced to the caller for logging, but does not abort the parse.
 */
export interface DotProjectWarning {
  org: string;
  field: string;
  message: string;
}

/**
 * Parse a github.com URL and return { owner, name } or null.
 * Handles https://github.com/org/repo and https://github.com/org/repo.git
 * Returns null for non-string input or non-github URLs (e.g. relative paths).
 */
function parseGithubUrl(url: unknown): { owner: string; name: string } | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/#? ]+)/);
  if (!match) return null;
  return {
    owner: match[1],
    name: match[2].replace(/\.git$/, ''),
  };
}

/**
 * Coerce a YAML value into an array of items.
 * - already an array → returned as-is
 * - a single scalar (string/object) → wrapped in a one-element array
 * - null/undefined → empty array
 * This absorbs the common schema violation where a field that should be a
 * sequence is written as a single scalar (e.g. `repositories: "https://..."`).
 */
function coerceToArray<T>(val: T | T[] | null | undefined): T[] {
  if (val === null || val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

/** Coerce a date value (string or Date) to ISO string or null. Never throws. */
function toIsoString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    const t = val.getTime();
    return Number.isNaN(t) ? null : val.toISOString();
  }
  if (typeof val === 'string') {
    const s = val.trim();
    return s || null;
  }
  // Numbers / booleans / objects are not valid dates — drop rather than coerce.
  return null;
}

/**
 * Serialize project_lead. Per schema it is a GitHub handle or `org/team-name`,
 * as a single string or a list of strings. Non-string entries (numbers, nulls,
 * objects) are INVALID data — they are skipped with a warning, not coerced to
 * "42" (which would be wrong data landing in the DB).
 *
 * @returns the serialized value plus any warnings for skipped entries
 */
function serializeProjectLead(
  org: string,
  lead: unknown
): { value: string | null; warnings: DotProjectWarning[] } {
  const warnings: DotProjectWarning[] = [];
  if (lead === null || lead === undefined) return { value: null, warnings };

  const rawItems = Array.isArray(lead) ? lead : [lead];
  const valid: string[] = [];

  for (const item of rawItems) {
    if (typeof item === 'string') {
      // Strip a leading @ per schema handle-normalization rules.
      const s = item.trim().replace(/^@/, '');
      if (s) valid.push(s);
    } else {
      warnings.push({
        org,
        field: 'project_lead',
        message: `skipped non-string entry (${typeof item}: ${JSON.stringify(item)})`,
      });
    }
  }

  return { value: valid.length > 0 ? valid.join(', ') : null, warnings };
}

/** Coerce a value to a trimmed non-empty string, or null. Never throws. */
function toStringOrNull(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const s = val.trim();
  return s || null;
}

/** True if val is a non-null, non-array plain object. */
function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Safe nested string accessor: obj.a.b as a string, else null. Never throws. */
function nestedString(root: unknown, ...keys: string[]): string | null {
  let cur: unknown = root;
  for (const k of keys) {
    if (!isObject(cur)) return null;
    cur = cur[k];
  }
  return toStringOrNull(cur);
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse a single project.yaml text blob fetched from <org>/.project
 * and return normalized records.
 *
 * DEFENSIVE CONTRACT: this function NEVER throws. Real-world .project files are
 * hand-edited and routinely violate the schema (scalar where a list is expected,
 * non-string entries, wrong types). All such cases are coerced or skipped with a
 * warning; one malformed file must never abort a 250-org scan.
 *
 * @param org - GitHub org login (used as FK / PK)
 * @param projectYamlText - Raw YAML text of project.yaml
 * @param sourceUrl - Canonical source URL for provenance (permalink if resolvable)
 * @returns Normalized records, or null if YAML is invalid / empty / not an object
 */
export function parseDotProject(
  org: string,
  projectYamlText: string,
  sourceUrl: string
): DotProjectNormalized | null {
  let parsed: unknown;
  try {
    parsed = yaml.parse(projectYamlText);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;

  const p = parsed as DotProjectYaml;
  const warnings: DotProjectWarning[] = [];
  const now = new Date().toISOString();

  // ── maturity_log ──────────────────────────────────────────────────────────
  // Guard scalar-vs-array; skip non-object entries defensively.
  const rawMaturity = coerceToArray(p.maturity_log);
  if (p.maturity_log !== undefined && !Array.isArray(p.maturity_log)) {
    warnings.push({ org, field: 'maturity_log', message: 'expected a list; coerced single value to a 1-element list' });
  }
  const maturityEntries: DotProjectMaturityEntry[] = [];
  rawMaturity.forEach((entry, i) => {
    if (!isObject(entry)) {
      warnings.push({ org, field: 'maturity_log', message: `skipped non-object entry at index ${i}` });
      return;
    }
    maturityEntries.push({
      org,
      position: maturityEntries.length,
      phase: toStringOrNull(entry.phase),
      date: toIsoString(entry.date),
      issue: toStringOrNull(entry.issue),
    });
  });
  const lastMaturity = maturityEntries.length > 0 ? maturityEntries[maturityEntries.length - 1] : null;

  // ── audits ────────────────────────────────────────────────────────────────
  const rawAudits = coerceToArray(p.audits);
  if (p.audits !== undefined && !Array.isArray(p.audits)) {
    warnings.push({ org, field: 'audits', message: 'expected a list; coerced single value to a 1-element list' });
  }
  const auditEntries: DotProjectAudit[] = [];
  rawAudits.forEach((audit, i) => {
    if (!isObject(audit)) {
      warnings.push({ org, field: 'audits', message: `skipped non-object entry at index ${i}` });
      return;
    }
    auditEntries.push({
      org,
      position: auditEntries.length,
      date: toIsoString(audit.date),
      type: toStringOrNull(audit.type),
      url: toStringOrNull(audit.url),
    });
  });

  // ── repositories ──────────────────────────────────────────────────────────
  // BLOCKING FIX: `repositories:` may be a scalar string (not a sequence), or
  // may contain non-string entries. Coerce scalar→array and skip/warn on
  // non-string entries. Relative (non-github) URLs land with null owner/name + warn.
  const rawRepos = coerceToArray(p.repositories);
  if (p.repositories !== undefined && !Array.isArray(p.repositories)) {
    warnings.push({ org, field: 'repositories', message: 'expected a list; coerced single value to a 1-element list' });
  }
  const repoEntries: DotProjectRepository[] = [];
  rawRepos.forEach((url, i) => {
    if (typeof url !== 'string') {
      warnings.push({ org, field: 'repositories', message: `skipped non-string entry at index ${i} (${typeof url})` });
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      warnings.push({ org, field: 'repositories', message: `skipped empty URL at index ${i}` });
      return;
    }
    const gh = parseGithubUrl(trimmed);
    if (!gh) {
      warnings.push({ org, field: 'repositories', message: `non-github/relative URL stored with null owner/name: ${trimmed}` });
    }
    repoEntries.push({
      org,
      position: repoEntries.length,
      repo_url: trimmed,
      repo_owner: gh?.owner ?? null,
      repo_name: gh?.name ?? null,
    });
  });

  // ── package_managers ──────────────────────────────────────────────────────
  let packageManagersJson: string | null = null;
  if (isObject(p.package_managers)) {
    try {
      packageManagersJson = JSON.stringify(p.package_managers);
    } catch {
      packageManagersJson = null;
    }
  } else if (p.package_managers !== undefined) {
    warnings.push({ org, field: 'package_managers', message: 'expected a map; ignored non-object value' });
  }

  // ── project_lead (validate, don't blindly coerce) ─────────────────────────
  const leadResult = serializeProjectLead(org, p.project_lead);
  warnings.push(...leadResult.warnings);

  // ── top-level record ──────────────────────────────────────────────────────
  const record: DotProjectRecord = {
    org,
    source_url: sourceUrl,
    schema_version: toStringOrNull(p.schema_version),
    slug: toStringOrNull(p.slug),
    name: toStringOrNull(p.name),
    description: toStringOrNull(p.description),
    type: toStringOrNull(p.type),
    project_lead: leadResult.value,
    repository_count: repoEntries.length,
    website: toStringOrNull(p.website),
    current_maturity: lastMaturity?.phase ?? null,
    current_maturity_date: lastMaturity?.date ?? null,
    audit_count: auditEntries.length,
    security_policy_path: nestedString(p.security, 'policy', 'path'),
    security_threat_model_path: nestedString(p.security, 'threat_model', 'path'),
    security_contact_email: nestedString(p.security, 'contact', 'email'),
    security_advisory_url: nestedString(p.security, 'contact', 'advisory_url'),
    landscape_category: nestedString(p.landscape, 'category'),
    landscape_subcategory: nestedString(p.landscape, 'subcategory'),
    package_managers_json: packageManagersJson,
    fetched_at: now,
  };

  return {
    dot_project: [record],
    dot_project_repositories: repoEntries,
    dot_project_maturity_log: maturityEntries,
    dot_project_audits: auditEntries,
    dot_project_maintainers: [],
    warnings,
  };
}

/**
 * Parse a maintainers.yaml text blob into normalized maintainer rows.
 * DEFENSIVE: never throws; skips malformed teams/members with warnings.
 *
 * @param org - GitHub org login the .project repo was fetched from (FK)
 * @param maintainersYamlText - Raw YAML text of maintainers.yaml
 * @returns { maintainers, warnings }
 */
export function parseMaintainers(
  org: string,
  maintainersYamlText: string
): { maintainers: DotProjectMaintainer[]; warnings: DotProjectWarning[] } {
  const warnings: DotProjectWarning[] = [];
  let parsed: unknown;
  try {
    parsed = yaml.parse(maintainersYamlText);
  } catch {
    return { maintainers: [], warnings: [{ org, field: 'maintainers.yaml', message: 'YAML parse error' }] };
  }

  if (!isObject(parsed)) return { maintainers: [], warnings };

  const rows: DotProjectMaintainer[] = [];
  const entries = coerceToArray((parsed as MaintainersYaml).maintainers);

  for (const entry of entries) {
    if (!isObject(entry)) {
      warnings.push({ org, field: 'maintainers', message: 'skipped non-object maintainer entry' });
      continue;
    }
    const projectId = toStringOrNull(entry.project_id);
    const maintainerOrg = toStringOrNull(entry.org);
    const teams = coerceToArray(entry.teams);

    for (const team of teams) {
      if (!isObject(team)) {
        warnings.push({ org, field: 'maintainers.teams', message: 'skipped non-object team' });
        continue;
      }
      const teamName = toStringOrNull(team.name);
      const members = coerceToArray(team.members);
      for (const member of members) {
        if (typeof member !== 'string') {
          warnings.push({ org, field: 'maintainers.members', message: `skipped non-string member (${typeof member})` });
          continue;
        }
        const handle = member.trim().replace(/^@/, '');
        if (!handle) continue;
        rows.push({
          org,
          project_id: projectId,
          maintainer_org: maintainerOrg,
          team: teamName,
          member: handle,
        });
      }
    }
  }

  return { maintainers: rows, warnings };
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
    dot_project_maintainers: [],
    warnings: [],
  };

  for (const r of results) {
    if (!r) continue;
    merged.dot_project.push(...r.dot_project);
    merged.dot_project_repositories.push(...r.dot_project_repositories);
    merged.dot_project_maturity_log.push(...r.dot_project_maturity_log);
    merged.dot_project_audits.push(...r.dot_project_audits);
    merged.dot_project_maintainers.push(...r.dot_project_maintainers);
    merged.warnings.push(...r.warnings);
  }

  return merged;
}

export function getDotProjectStats(normalized: DotProjectNormalized): string {
  const lines = [
    `Normalized ${normalized.dot_project.length} .project records`,
    `  ${normalized.dot_project_repositories.length} repositories`,
    `  ${normalized.dot_project_maturity_log.length} maturity_log entries`,
    `  ${normalized.dot_project_audits.length} audits`,
    `  ${normalized.dot_project_maintainers.length} maintainers`,
  ];
  if (normalized.warnings.length > 0) {
    lines.push(`  ${normalized.warnings.length} schema warnings (tolerated)`);
  }
  return lines.join('\n');
}
