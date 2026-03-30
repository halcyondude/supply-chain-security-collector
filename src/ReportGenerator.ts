import { DuckDBInstance } from '@duckdb/node-api';
import * as path from 'path';
import chalk from 'chalk';
import { installAndLoadExtensions } from './duckdb-extensions';

type DuckDBConnection = Awaited<ReturnType<DuckDBInstance['connect']>>;

interface ReportOptions {
    database: string;
    output?: string;
    title?: string;
}

/**
 * ReportGenerator — produces structured markdown reports from agg_* tables
 * for sharing with CNCF TOC and stakeholders.
 */
export class ReportGenerator {
    private dbPath: string;
    private db?: DuckDBInstance;
    private con?: DuckDBConnection;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    private async connect() {
        if (!this.db) {
            this.db = await DuckDBInstance.create(this.dbPath);
            this.con = await this.db.connect();
            await installAndLoadExtensions(this.con);
        }
    }

    /**
     * Run a query and return rows as arrays
     */
    private async query(sql: string): Promise<unknown[][]> {
        const result = await this.con!.run(sql);
        return await result.getRows();
    }

    /**
     * Run a query and return rows as objects with named columns
     */
    private async queryObjects(sql: string): Promise<Record<string, unknown>[]> {
        const result = await this.con!.run(sql);
        const rows = await result.getRows();
        const columns = result.columnNames();
        return rows.map(row =>
            Object.fromEntries(columns.map((col, i) => [col, row[i]]))
        );
    }

    /**
     * Format a value for display, converting null/undefined to '0'
     */
    private n(val: unknown): string | number {
        if (val === null || val === undefined) return 0;
        return val as string | number;
    }

    /**
     * Check if a table exists in the database
     */
    private async tableExists(tableName: string): Promise<boolean> {
        const rows = await this.query(
            `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${tableName}'`
        );
        return Number(rows[0]?.[0]) > 0;
    }

    /**
     * Generate the full markdown report
     */
    async generate(options: ReportOptions): Promise<string> {
        await this.connect();
        const title = options.title || 'CNCF Supply Chain Security Report';
        const timestamp = new Date().toISOString().split('T')[0];
        const sections: string[] = [];

        sections.push(`# ${title}\n`);
        sections.push(`*Generated: ${timestamp} | Database: \`${path.basename(options.database)}\`*\n`);

        // Executive Summary
        sections.push(await this.generateExecutiveSummary());

        // Maturity breakdown (if CNCF data present)
        if (await this.tableExists('agg_cncf_project_summary')) {
            sections.push(await this.generateMaturityBreakdown());
        }

        // Tool Adoption
        if (await this.tableExists('agg_tool_summary')) {
            sections.push(await this.generateToolAdoption());
        }

        // SBOM & Signing Coverage
        sections.push(await this.generateSbomSigningCoverage());

        // Security Insights
        if (await this.tableExists('base_si_documents')) {
            sections.push(await this.generateSecurityInsights());
        }

        // Recommendations
        if (await this.tableExists('agg_cncf_project_summary')) {
            sections.push(await this.generateRecommendations());
        }

        return sections.join('\n');
    }

    private async generateExecutiveSummary(): Promise<string> {
        const lines: string[] = ['## Executive Summary\n'];

        if (await this.tableExists('agg_executive_summary')) {
            const rows = await this.queryObjects('SELECT * FROM agg_executive_summary');
            if (rows.length > 0) {
                const s = rows[0];
                lines.push(`| Metric | Value |`);
                lines.push(`|--------|------:|`);
                lines.push(`| Total Repositories | ${s.total_repos} |`);
                lines.push(`| Total Releases | ${s.total_releases} |`);
                lines.push(`| Total Release Assets | ${s.total_assets} |`);
                lines.push(`| Total Workflows Analyzed | ${s.total_workflows} |`);
                lines.push(``);
                lines.push(`### Artifact Adoption\n`);
                lines.push(`| Artifact Type | Repos | Adoption |`);
                lines.push(`|---------------|------:|---------:|`);
                lines.push(`| SBOM | ${s.repos_with_sbom} | ${s.sbom_percentage}% |`);
                lines.push(`| Signatures | ${s.repos_with_signatures} | ${s.signature_percentage}% |`);
                lines.push(`| Attestations | ${s.repos_with_attestations} | ${s.attestation_percentage}% |`);
                lines.push(``);
                lines.push(`### CI/CD Security Tool Adoption\n`);
                lines.push(`| Tool Category | Repos |`);
                lines.push(`|---------------|------:|`);
                lines.push(`| SBOM Generators | ${s.repos_using_sbom_generators} |`);
                lines.push(`| Signing Tools | ${s.repos_using_signers} |`);
                lines.push(`| Vulnerability Scanners | ${s.repos_using_vuln_scanners} |`);
                lines.push(`| Dependency Scanners | ${s.repos_using_dep_scanners} |`);
                lines.push(`| Code Scanners | ${s.repos_using_code_scanners} |`);
                lines.push(`| Container Scanners | ${s.repos_using_container_scanners} |`);
            }
        } else {
            lines.push('*Executive summary table not available.*');
        }

        return lines.join('\n') + '\n';
    }

    private async generateMaturityBreakdown(): Promise<string> {
        const lines: string[] = ['## Supply Chain Security by Maturity Level\n'];

        const rows = await this.queryObjects(`
            SELECT
                maturity,
                COUNT(*) as projects,
                SUM(total_repos) as repos,
                SUM(repos_with_sbom) as with_sbom,
                SUM(repos_with_signatures) as with_sigs,
                SUM(repos_with_attestations) as with_attestations,
                SUM(repos_using_cosign) as using_cosign,
                SUM(repos_using_trivy) as using_trivy,
                SUM(repos_using_codeql) as using_codeql,
                ROUND(AVG(sbom_adoption_rate) * 100, 1) as avg_sbom_pct
            FROM agg_cncf_project_summary
            GROUP BY maturity
            ORDER BY
                CASE maturity
                    WHEN 'graduated' THEN 1
                    WHEN 'incubating' THEN 2
                    WHEN 'sandbox' THEN 3
                    ELSE 4
                END
        `);

        if (rows.length > 0) {
            lines.push(`| Maturity | Projects | Repos | SBOM Repos | Signed Repos | Attested Repos | Avg SBOM % |`);
            lines.push(`|----------|-------:|------:|-----------:|-------------:|---------------:|-----------:|`);
            for (const r of rows) {
                lines.push(`| ${r.maturity} | ${r.projects} | ${r.repos} | ${r.with_sbom} | ${r.with_sigs} | ${r.with_attestations} | ${r.avg_sbom_pct}% |`);
            }
            lines.push(``);

            // Tool adoption by maturity
            lines.push(`### Tool Adoption by Maturity\n`);
            lines.push(`| Maturity | Cosign | Trivy | CodeQL |`);
            lines.push(`|----------|-------:|------:|-------:|`);
            for (const r of rows) {
                lines.push(`| ${r.maturity} | ${r.using_cosign} | ${r.using_trivy} | ${r.using_codeql} |`);
            }
        }

        return lines.join('\n') + '\n';
    }

    private async generateToolAdoption(): Promise<string> {
        const lines: string[] = ['## Tool Adoption Landscape\n'];

        const rows = await this.queryObjects(`
            SELECT tool_name, tool_category, repo_count, workflow_count, adoption_percentage
            FROM agg_tool_summary
            ORDER BY repo_count DESC
        `);

        if (rows.length > 0) {
            lines.push(`| Tool | Category | Repos | Workflows | Adoption |`);
            lines.push(`|------|----------|------:|----------:|---------:|`);
            for (const r of rows) {
                const category = String(r.tool_category).replace(/-/g, ' ');
                lines.push(`| ${r.tool_name} | ${category} | ${r.repo_count} | ${r.workflow_count} | ${r.adoption_percentage}% |`);
            }
            lines.push(``);

            // Group by category
            lines.push(`### By Category\n`);
            if (await this.tableExists('agg_tool_category_summary')) {
                const catRows = await this.queryObjects(`
                    SELECT tool_category, SUM(repo_count) as total_repos, COUNT(DISTINCT tool_name) as tools
                    FROM agg_tool_category_summary
                    GROUP BY tool_category
                    ORDER BY total_repos DESC
                `);
                lines.push(`| Category | Total Repos | Unique Tools |`);
                lines.push(`|----------|------------:|-------------:|`);
                for (const r of catRows) {
                    const category = String(r.tool_category).replace(/-/g, ' ');
                    lines.push(`| ${category} | ${r.total_repos} | ${r.tools} |`);
                }
            }
        } else {
            lines.push('*No tool detections found.*');
        }

        return lines.join('\n') + '\n';
    }

    private async generateSbomSigningCoverage(): Promise<string> {
        const lines: string[] = ['## SBOM & Signing Coverage\n'];

        if (await this.tableExists('agg_sbom_summary')) {
            const rows = await this.queryObjects('SELECT * FROM agg_sbom_summary');
            if (rows.length > 0) {
                const s = rows[0];
                lines.push(`### SBOM Format Distribution\n`);
                lines.push(`| Format | Repos |`);
                lines.push(`|--------|------:|`);
                lines.push(`| SPDX | ${this.n(s.spdx_count)} |`);
                lines.push(`| CycloneDX | ${this.n(s.cyclonedx_count)} |`);
                lines.push(`| Unknown | ${this.n(s.unknown_count)} |`);
                lines.push(``);
                lines.push(`- **Full adoption** (SBOM in every release): ${this.n(s.full_adoption)} repos`);
                lines.push(`- **Partial adoption** (SBOM in some releases): ${this.n(s.partial_adoption)} repos`);
            }
        }

        if (await this.tableExists('agg_advanced_artifacts')) {
            const rows = await this.queryObjects('SELECT * FROM agg_advanced_artifacts');
            if (rows.length > 0) {
                const s = rows[0];
                lines.push(``);
                lines.push(`### Advanced Artifact Types\n`);
                lines.push(`| Artifact Type | Count |`);
                lines.push(`|---------------|------:|`);
                lines.push(`| SLSA Provenance | ${this.n(s.slsa_count)} |`);
                lines.push(`| Sigstore Bundles | ${this.n(s.sigstore_bundle_count)} |`);
                lines.push(`| in-toto Links | ${this.n(s.intoto_link_count)} |`);
                lines.push(`| in-toto Layouts | ${this.n(s.intoto_layout_count)} |`);
                lines.push(`| VEX Documents | ${this.n(s.vex_count)} |`);
                lines.push(`| Container Attestations | ${this.n(s.container_attestation_count)} |`);
                lines.push(`| SWID Tags | ${this.n(s.swid_tag_count)} |`);
            }
        }

        // Top repos with strongest supply chain posture
        if (await this.tableExists('agg_repo_summary')) {
            const topRepos = await this.queryObjects(`
                SELECT nameWithOwner, has_sbom_artifact, has_signature_artifact, has_attestation_artifact,
                       uses_cosign, uses_syft, uses_trivy, total_releases
                FROM agg_repo_summary
                WHERE has_sbom_artifact AND has_signature_artifact
                ORDER BY total_releases DESC
                LIMIT 15
            `);
            if (topRepos.length > 0) {
                lines.push(``);
                lines.push(`### Repos with SBOM + Signing (Top ${topRepos.length})\n`);
                lines.push(`| Repository | Releases | Attestation | Cosign | Syft | Trivy |`);
                lines.push(`|------------|-------:|:-----------:|:------:|:----:|:-----:|`);
                for (const r of topRepos) {
                    const check = (v: unknown) => v ? 'Y' : '-';
                    lines.push(`| ${r.nameWithOwner} | ${r.total_releases} | ${check(r.has_attestation_artifact)} | ${check(r.uses_cosign)} | ${check(r.uses_syft)} | ${check(r.uses_trivy)} |`);
                }
            }
        }

        return lines.join('\n') + '\n';
    }

    private async generateSecurityInsights(): Promise<string> {
        const lines: string[] = ['## Security Insights (SECURITY-INSIGHTS.yml)\n'];

        const countRows = await this.query('SELECT COUNT(*) FROM base_si_documents');
        const totalDocs = Number(countRows[0]?.[0] || 0);

        if (totalDocs === 0) {
            lines.push('*No SECURITY-INSIGHTS.yml files found across repositories.*');
            return lines.join('\n') + '\n';
        }

        lines.push(`**${totalDocs} repositories** have a SECURITY-INSIGHTS.yml file.\n`);

        // Schema version breakdown
        const versionRows = await this.queryObjects(`
            SELECT schema_version, COUNT(*) as count
            FROM base_si_documents
            GROUP BY schema_version
            ORDER BY count DESC
        `);
        if (versionRows.length > 0) {
            lines.push(`### Schema Versions\n`);
            lines.push(`| Version | Count |`);
            lines.push(`|---------|------:|`);
            for (const r of versionRows) {
                lines.push(`| ${r.schema_version} | ${r.count} |`);
            }
        }

        // Attestations from SI
        if (await this.tableExists('agg_si_attestations')) {
            const attRows = await this.query('SELECT COUNT(*), COUNT(DISTINCT repo_id) FROM agg_si_attestations');
            const totalAtt = Number(attRows[0]?.[0] || 0);
            const attRepos = Number(attRows[0]?.[1] || 0);
            if (totalAtt > 0) {
                lines.push(``);
                lines.push(`### Declared Attestations\n`);
                lines.push(`${totalAtt} attestation(s) declared across ${attRepos} repo(s).`);
            }
        }

        // SBOMs from SI
        if (await this.tableExists('base_si_sboms')) {
            const sbomRows = await this.query('SELECT COUNT(*), COUNT(DISTINCT repo_id) FROM base_si_sboms');
            const totalSbom = Number(sbomRows[0]?.[0] || 0);
            const sbomRepos = Number(sbomRows[0]?.[1] || 0);
            if (totalSbom > 0) {
                lines.push(``);
                lines.push(`### Declared SBOMs\n`);
                lines.push(`${totalSbom} SBOM(s) declared across ${sbomRepos} repo(s).`);
            }
        }

        return lines.join('\n') + '\n';
    }

    private async generateRecommendations(): Promise<string> {
        const lines: string[] = ['## Maturity-Based Recommendations\n'];

        // Graduated projects without signing
        const unsignedGrad = await this.queryObjects(`
            SELECT display_name, project_name, total_repos, repos_with_sbom, repos_with_signatures
            FROM agg_cncf_project_summary
            WHERE maturity = 'graduated' AND repos_with_signatures = 0
            ORDER BY display_name
        `);
        if (unsignedGrad.length > 0) {
            lines.push(`### Graduated Projects Without Release Signing\n`);
            lines.push(`These graduated projects have no signed release artifacts:\n`);
            for (const r of unsignedGrad) {
                lines.push(`- **${r.display_name}** (${r.total_repos} repos, ${r.repos_with_sbom} with SBOM)`);
            }
            lines.push(``);
        }

        // Graduated without SBOM
        const noSbomGrad = await this.queryObjects(`
            SELECT display_name, project_name, total_repos
            FROM agg_cncf_project_summary
            WHERE maturity = 'graduated' AND repos_with_sbom = 0
            ORDER BY display_name
        `);
        if (noSbomGrad.length > 0) {
            lines.push(`### Graduated Projects Without SBOMs\n`);
            lines.push(`These graduated projects have no SBOM artifacts in releases:\n`);
            for (const r of noSbomGrad) {
                lines.push(`- **${r.display_name}** (${r.total_repos} repos)`);
            }
            lines.push(``);
        }

        // Projects with strong posture
        const strongProjects = await this.queryObjects(`
            SELECT display_name, maturity, repos_with_sbom, repos_with_signatures, repos_using_cosign
            FROM agg_cncf_project_summary
            WHERE repos_with_sbom > 0 AND repos_with_signatures > 0
            ORDER BY repos_with_sbom DESC
            LIMIT 10
        `);
        if (strongProjects.length > 0) {
            lines.push(`### Projects with Strong Supply Chain Security\n`);
            lines.push(`These projects have both SBOM and signing in their releases:\n`);
            lines.push(`| Project | Maturity | SBOM Repos | Signed Repos | Cosign Repos |`);
            lines.push(`|---------|----------|----------:|-----------:|-------------:|`);
            for (const r of strongProjects) {
                lines.push(`| ${r.display_name} | ${r.maturity} | ${r.repos_with_sbom} | ${r.repos_with_signatures} | ${r.repos_using_cosign} |`);
            }
        }

        return lines.join('\n') + '\n';
    }

    async close() {
        if (this.con) {
            try {
                this.con.closeSync();
            } catch {
                // Ignore close errors for read-only reports
            }
        }
        this.con = undefined;
        this.db = undefined;
    }
}

/**
 * Generate a report from a database file
 */
export async function generateReport(options: ReportOptions): Promise<string> {
    const generator = new ReportGenerator(options.database);
    try {
        const report = await generator.generate(options);
        console.log(chalk.green(`\n✅ Report generated (${report.split('\n').length} lines)`));
        return report;
    } finally {
        await generator.close();
    }
}
