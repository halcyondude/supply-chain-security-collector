// Collection-stage test: typed GraphQL responses -> writeArtifacts -> SQL models.
// Exercises the normalizers, ArtifactWriter and SecurityAnalyzer end to end
// without calling the GitHub API.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { writeArtifacts } from '../src/ArtifactWriter';
import { SecurityAnalyzer } from '../src/SecurityAnalyzer';
import type { ProjectMetadata } from '../src/config';
import { queryObjects } from './helpers';
import { repoResponse } from './fixtures/extended-info';

const QUERY = 'GetRepoDataExtendedInfo';

const SIGNED = repoResponse({
    owner: 'acme',
    name: 'signed',
    releases: {
        'v1.1.0': ['signed_linux_amd64.tar.gz', 'signed_linux_amd64.tar.gz.sig', 'signed.spdx.json'],
        'v1.0.0': ['signed_linux_amd64.tar.gz'],
    },
    workflows: {
        'release.yml': [
            'on: push',
            'jobs:',
            '  release:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      - uses: sigstore/cosign-installer@v3',
            '      - run: cosign sign-blob dist/signed.tar.gz',
        ].join('\n'),
    },
});

const PLAIN = repoResponse({
    owner: 'acme',
    name: 'plain',
    releases: { 'v0.1.0': ['plain.zip'] },
    workflows: {
        // File names that mention tools must not count: detection reads content.
        'codeql.yml': 'on: push\njobs:\n  noop:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi',
        // Hyphenated tool names must match as a whole, not per token:
        // 'docker' alone is not docker-scout, 'github' + 'generate' is not slsa-github-generator.
        'docker-build.yml': [
            'jobs:',
            '  build:',
            '    steps:',
            '      - uses: docker/build-push-action@v6',
            '      - run: ./hack/generate-release-notes.sh --github',
        ].join('\n'),
        // Stemming makes 'generate' match 'generator': an SPDX SBOM step is not
        // spdx-sbom-generator, and SLSA provenance via GitHub is not slsa-github-generator.
        'provenance.yml': [
            'jobs:',
            '  sbom:',
            '    steps:',
            '      - name: Generate SPDX SBOM',
            '        run: make sbom FORMAT=spdx-json',
            '      - name: Generate SLSA provenance with GitHub attestations',
            '        uses: actions/attest-build-provenance@v2',
        ].join('\n'),
    },
});

const SCANNED = repoResponse({
    owner: 'acme',
    name: 'scanned',
    workflows: {
        // One workflow, two tools in the same category: both must be recorded.
        'sbom.yml': [
            'jobs:',
            '  sbom:',
            '    steps:',
            '      - uses: anchore/sbom-action@v0  # syft',
            '      - uses: aquasecurity/trivy-action@0.28.0',
            '      - uses: docker/scout-action@v1',
        ].join('\n'),
    },
});

const PROJECT: ProjectMetadata = {
    project_name: 'Acme',
    display_name: 'Acme',
    maturity: 'sandbox',
    repos: [
        { owner: 'acme', name: 'signed', primary: true },
        { owner: 'acme', name: 'plain', primary: false },
        { owner: 'acme', name: 'scanned', primary: false },
    ],
    // Deliberately sparse: optional metadata (category, description, dates...)
    // is absent, as it is for many sandbox projects.
};

describe('collection → analysis', () => {
    let dir: string;
    let db: DuckDBInstance;
    let con: DuckDBConnection;

    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sscc-collect-'));
        const metadata = PROJECT.repos.map((r) => ({ repo: { owner: r.owner, name: r.name }, metadata: PROJECT }));
        await writeArtifacts([SIGNED, PLAIN, SCANNED], dir, QUERY, metadata, false);
        const analyzer = new SecurityAnalyzer(path.join(dir, 'database.db'));
        await analyzer.analyze(false);
        await analyzer.close();
        db = await DuckDBInstance.create(path.join(dir, 'database.db'));
        con = await db.connect();
    });

    after(() => {
        con?.closeSync();
        db?.closeSync();
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    test('normalizes responses into base_* tables', async () => {
        const expected: Record<string, number> = {
            base_repositories: 3,
            base_releases: 3,
            base_release_assets: 5,
            base_workflows: 5,
            base_cncf_projects: 1,
            base_cncf_project_repos: 3,
        };
        for (const [table, n] of Object.entries(expected)) {
            const [row] = await queryObjects(con, `SELECT COUNT(*) AS n FROM ${table}`);
            assert.equal(Number(row.n), n, table);
        }
    });

    test('exports base_* tables to Parquet', () => {
        for (const table of ['base_repositories', 'base_releases', 'base_release_assets', 'base_workflows']) {
            assert.ok(fs.existsSync(path.join(dir, 'parquet', `${table}.parquet`)), table);
        }
    });

    test('detects SBOM, signature and cosign per repo', async () => {
        const rows = await queryObjects(con, `
            SELECT nameWithOwner, has_sbom_artifact, has_signature_artifact, uses_cosign
            FROM agg_repo_summary ORDER BY nameWithOwner`);
        assert.deepEqual(rows, [
            { nameWithOwner: 'acme/plain', has_sbom_artifact: false, has_signature_artifact: false, uses_cosign: false },
            { nameWithOwner: 'acme/scanned', has_sbom_artifact: false, has_signature_artifact: false, uses_cosign: false },
            { nameWithOwner: 'acme/signed', has_sbom_artifact: true, has_signature_artifact: true, uses_cosign: true },
        ]);
    });

    test('detects CI tools from workflow content, not file names', async () => {
        const rows = await queryObjects(con, `
            SELECT nameWithOwner AS repo, workflow_name AS workflow, tool_category AS category, tool_name AS tool
            FROM agg_workflow_tools ORDER BY ALL`);
        assert.deepEqual(rows, [
            { repo: 'acme/scanned', workflow: 'sbom.yml', category: 'container-scanner', tool: 'docker-scout' },
            { repo: 'acme/scanned', workflow: 'sbom.yml', category: 'container-scanner', tool: 'trivy' },
            { repo: 'acme/scanned', workflow: 'sbom.yml', category: 'sbom-generator', tool: 'syft' },
            { repo: 'acme/scanned', workflow: 'sbom.yml', category: 'sbom-generator', tool: 'trivy' },
            { repo: 'acme/scanned', workflow: 'sbom.yml', category: 'vulnerability-scanner', tool: 'anchore' },
            { repo: 'acme/signed', workflow: 'release.yml', category: 'signer', tool: 'cosign' },
            // sigstore/cosign-installer is Sigstore tooling, so both rows are expected.
            { repo: 'acme/signed', workflow: 'release.yml', category: 'signer', tool: 'sigstore' },
        ]);
    });

    test('keeps the full base_cncf_projects schema when optional metadata is absent', async () => {
        const cols = await queryObjects(con, `SELECT column_name FROM (DESCRIBE base_cncf_projects)`);
        const names = cols.map((c) => c.column_name);
        for (const c of ['category', 'subcategory', 'description', 'date_accepted', 'has_security_audits']) {
            assert.ok(names.includes(c), c);
        }
    });

    test('rolls repos up to the CNCF project', async () => {
        const [row] = await queryObjects(con, `
            SELECT total_repos, repos_with_sbom, repos_with_signatures, repos_using_cosign
            FROM agg_cncf_project_summary WHERE project_name = 'Acme'`);
        assert.deepEqual(
            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)])),
            { total_repos: 3, repos_with_sbom: 1, repos_with_signatures: 1, repos_using_cosign: 1 },
        );
    });
});
