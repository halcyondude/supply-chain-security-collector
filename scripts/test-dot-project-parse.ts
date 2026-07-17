/**
 * test-dot-project-parse.ts
 *
 * Standalone validation script for DotProjectNormalizer.
 * Runs without a GitHub token — tests the YAML parse and normalization logic
 * against the real open-telemetry/.project/project.yaml fetched via
 * unauthenticated raw.githubusercontent.com.
 *
 * Usage:
 *   npx ts-node scripts/test-dot-project-parse.ts
 *
 * Also validates the example from the .project schema:
 *   ~/gh/f/cncf/automation/utilities/dot-project/example/project.yaml
 */

import * as https from 'https';
import { parseDotProject, mergeDotProjectResults, getDotProjectStats } from '../src/normalizers/DotProjectNormalizer';

// ---------------------------------------------------------------------------
// Inline example fixture (mirrors the schema example — kubernetes)
// ---------------------------------------------------------------------------
const KUBERNETES_EXAMPLE_YAML = `
schema_version: "1.0.0"
slug: "kubernetes"
name: "Kubernetes"
description: "Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications."
type: "platform"
project_lead:
  - "thockin"
  - "kubernetes/sig-leads"
maturity_log:
  - phase: "sandbox"
    date: 2016-03-10T00:00:00Z
    issue: "https://github.com/cncf/toc/issues/123"
  - phase: "incubating"
    date: 2017-03-01T00:00:00Z
    issue: "https://github.com/cncf/toc/issues/123"
  - phase: "graduated"
    date: 2018-03-06T00:00:00Z
    issue: "https://github.com/cncf/toc/issues/123"
repositories:
  - "https://github.com/kubernetes/kubernetes"
  - "https://github.com/kubernetes/kubectl"
  - "https://github.com/kubernetes/client-go"
  - "https://github.com/kubernetes/api"
website: "https://kubernetes.io"
audits:
  - date: 2019-08-06T00:00:00Z
    type: "security"
    url: "https://example.com/audit1"
  - date: 2021-05-17T00:00:00Z
    type: "security"
    url: "https://example.com/audit2"
security:
  policy:
    path: "https://github.com/kubernetes/kubernetes/blob/master/SECURITY.md"
  threat_model:
    path: "https://github.com/kubernetes/community/blob/master/sig-security/threat-model.md"
  contact:
    email: security@kubernetes.io
    advisory_url: "https://github.com/kubernetes/kubernetes/security/advisories/new"
landscape:
  category: "Orchestration & Management"
  subcategory: "Scheduling & Orchestration"
package_managers:
  homebrew: "kubernetes-cli"
  chocolatey: "kubernetes-cli"
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode === 404) {
        reject(new Error(`HTTP 404: ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout: ${url}`)));
  });
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: Inline kubernetes example (no network)
// ---------------------------------------------------------------------------

function testKubernetesExample(): void {
  console.log('\n══ Test 1: Kubernetes example (inline fixture, no network) ══\n');

  const result = parseDotProject(
    'kubernetes',
    KUBERNETES_EXAMPLE_YAML,
    'https://github.com/kubernetes/.project/blob/HEAD/project.yaml'
  );

  if (!result) {
    console.error('FAIL: parseDotProject returned null for kubernetes example');
    process.exitCode = 1;
    return;
  }

  const dp = result.dot_project[0];
  console.log('dot_project record:');
  console.log(JSON.stringify(dp, null, 2));

  console.log('\nAssertions:');
  assert(dp.org === 'kubernetes', `org = 'kubernetes' (got '${dp.org}')`);
  assert(dp.slug === 'kubernetes', `slug = 'kubernetes' (got '${dp.slug}')`);
  assert(dp.name === 'Kubernetes', `name = 'Kubernetes' (got '${dp.name}')`);
  assert(dp.type === 'platform', `type = 'platform' (got '${dp.type}')`);
  assert(dp.current_maturity === 'graduated', `current_maturity = 'graduated' (got '${dp.current_maturity}')`);
  assert(dp.project_lead === 'thockin, kubernetes/sig-leads', `project_lead = 'thockin, kubernetes/sig-leads' (got '${dp.project_lead}')`);
  assert(dp.repository_count === 4, `repository_count = 4 (got ${dp.repository_count})`);
  assert(dp.audit_count === 2, `audit_count = 2 (got ${dp.audit_count})`);
  assert(dp.security_policy_path === 'https://github.com/kubernetes/kubernetes/blob/master/SECURITY.md', 'security_policy_path set');
  assert(dp.security_threat_model_path !== null, 'security_threat_model_path set');
  assert(dp.security_contact_email === 'security@kubernetes.io', `security_contact_email set (got '${dp.security_contact_email}')`);
  assert(dp.security_advisory_url !== null, 'security_advisory_url set');
  assert(dp.landscape_category === 'Orchestration & Management', `landscape_category set (got '${dp.landscape_category}')`);
  assert(dp.landscape_subcategory === 'Scheduling & Orchestration', `landscape_subcategory set`);
  assert(dp.package_managers_json !== null, 'package_managers_json set');

  console.log('\ndot_project_repositories:');
  console.log(JSON.stringify(result.dot_project_repositories, null, 2));
  assert(result.dot_project_repositories.length === 4, `4 repositories (got ${result.dot_project_repositories.length})`);
  assert(result.dot_project_repositories[0].repo_owner === 'kubernetes', 'first repo owner = kubernetes');
  assert(result.dot_project_repositories[0].repo_name === 'kubernetes', 'first repo name = kubernetes');

  console.log('\ndot_project_maturity_log:');
  console.log(JSON.stringify(result.dot_project_maturity_log, null, 2));
  assert(result.dot_project_maturity_log.length === 3, `3 maturity entries (got ${result.dot_project_maturity_log.length})`);
  assert(result.dot_project_maturity_log[0].phase === 'sandbox', 'first phase = sandbox');
  assert(result.dot_project_maturity_log[2].phase === 'graduated', 'last phase = graduated');

  console.log('\ndot_project_audits:');
  console.log(JSON.stringify(result.dot_project_audits, null, 2));
  assert(result.dot_project_audits.length === 2, `2 audits (got ${result.dot_project_audits.length})`);
  assert(result.dot_project_audits[0].type === 'security', `audit[0].type = security`);

  console.log('\n' + getDotProjectStats(result));
}

// ---------------------------------------------------------------------------
// Test 2: Real open-telemetry/.project via unauthenticated raw fetch
// ---------------------------------------------------------------------------

async function testOpenTelemetry(): Promise<void> {
  console.log('\n══ Test 2: open-telemetry/.project (live unauthenticated fetch) ══\n');

  const url = 'https://raw.githubusercontent.com/open-telemetry/.project/main/project.yaml';
  let yamlText: string;
  try {
    yamlText = await fetchUrl(url);
    console.log(`Fetched ${yamlText.length} bytes from ${url}`);
  } catch (err) {
    console.warn(`  SKIP: network unavailable or 404 (${err instanceof Error ? err.message : err})`);
    return;
  }

  const result = parseDotProject(
    'open-telemetry',
    yamlText,
    'https://github.com/open-telemetry/.project/blob/HEAD/project.yaml'
  );

  if (!result) {
    console.error('FAIL: parseDotProject returned null for open-telemetry');
    process.exitCode = 1;
    return;
  }

  const dp = result.dot_project[0];
  console.log('dot_project record:');
  console.log(JSON.stringify(dp, null, 2));

  console.log('\nAssertions:');
  assert(dp.org === 'open-telemetry', `org = 'open-telemetry' (got '${dp.org}')`);
  assert(dp.slug === 'opentelemetry', `slug = 'opentelemetry' (got '${dp.slug}')`);
  assert(dp.name === 'OpenTelemetry', `name = 'OpenTelemetry' (got '${dp.name}')`);
  assert(dp.current_maturity === 'graduated', `current_maturity = 'graduated' (got '${dp.current_maturity}')`);
  assert(dp.security_policy_path !== null, 'security_policy_path set');
  assert(dp.security_advisory_url !== null, 'security_advisory_url set');
  assert(dp.landscape_category === 'Observability and Analysis', `landscape_category set (got '${dp.landscape_category}')`);
  assert(result.dot_project_repositories.length >= 1, `at least 1 repository (got ${result.dot_project_repositories.length})`);
  assert(result.dot_project_repositories[0].repo_owner === 'open-telemetry', 'first repo owner = open-telemetry');
  assert(result.dot_project_maturity_log.length >= 1, `at least 1 maturity_log entry (got ${result.dot_project_maturity_log.length})`);

  console.log('\n' + getDotProjectStats(result));
}

// ---------------------------------------------------------------------------
// Test 3: null on invalid YAML
// ---------------------------------------------------------------------------

function testInvalidYaml(): void {
  console.log('\n══ Test 3: Invalid YAML returns null ══\n');
  const result = parseDotProject('test-org', ': this is not valid yaml: [', 'test-url');
  assert(result === null, 'invalid YAML returns null');
}

// ---------------------------------------------------------------------------
// Test 4: merge multiple results
// ---------------------------------------------------------------------------

function testMerge(): void {
  console.log('\n══ Test 4: mergeDotProjectResults ══\n');

  const r1 = parseDotProject('kubernetes', KUBERNETES_EXAMPLE_YAML, 'test-url-1');
  const r2 = null; // parse failure / missing repo
  const r3 = parseDotProject('kubernetes', KUBERNETES_EXAMPLE_YAML, 'test-url-3'); // same org, 2nd entry

  const merged = mergeDotProjectResults([r1, r2, r3]);
  assert(merged.dot_project.length === 2, `merged dot_project has 2 rows (got ${merged.dot_project.length})`);
  assert(merged.dot_project_repositories.length === 8, `merged repos has 8 rows (got ${merged.dot_project_repositories.length})`);
  assert(merged.dot_project_maturity_log.length === 6, `merged maturity_log has 6 rows (got ${merged.dot_project_maturity_log.length})`);
  assert(merged.dot_project_audits.length === 4, `merged audits has 4 rows (got ${merged.dot_project_audits.length})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('DotProjectNormalizer — parse validation');
  console.log('='.repeat(50));

  testKubernetesExample();
  await testOpenTelemetry();
  testInvalidYaml();
  testMerge();

  const exitCode = process.exitCode ?? 0;
  console.log(`\n${'='.repeat(50)}`);
  if (exitCode === 0) {
    console.log('All tests passed.');
  } else {
    console.error(`${exitCode} test(s) failed.`);
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
