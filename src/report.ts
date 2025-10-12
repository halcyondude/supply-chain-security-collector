#!/usr/bin/env ts-node
import { Command } from 'commander';
import { DuckDBInstance } from '@duckdb/node-api';
import chalk from 'chalk';
import * as fs from 'fs/promises';

type DuckDBConnection = Awaited<ReturnType<DuckDBInstance['connect']>>;

class ReportGenerator {
    private dbPath: string;
    private db?: DuckDBInstance;
    private con?: DuckDBConnection;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    async connect() {
        if (!this.db) {
            this.db = await DuckDBInstance.create(this.dbPath);
            this.con = await this.db.connect();
        }
    }

    async close() {
        if (this.con) {
            this.con.closeSync();
        }
        this.con = undefined;
        this.db = undefined;
    }

    async generateMarkdownReport(): Promise<string> {
        await this.connect();
        const sections: string[] = [];
        sections.push('# Supply Chain Security Analysis Report\n');
        sections.push(`Generated: ${new Date().toISOString()}\n`);
        sections.push(`Database: ${this.dbPath}\n`);
        sections.push(await this.generateExecutiveSummary());
        sections.push(await this.generateScorecard());
        sections.push(await this.generateToolAdoption());
        sections.push(await this.generateSbomAnalysis());
        sections.push(await this.generateDetailedFindings());
        return sections.join('\n');
    }

    private async generateExecutiveSummary(): Promise<string> {
        const result = await this.con!.run(`
            SELECT 
                COUNT(*) as total_repos,
                SUM(CASE WHEN has_sbom_artifact THEN 1 ELSE 0 END) as repos_with_sbom,
                SUM(CASE WHEN has_signature_artifact THEN 1 ELSE 0 END) as repos_with_signatures,
                SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) as repos_using_cosign,
                SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) as repos_using_syft,
                SUM(CASE WHEN uses_codeql THEN 1 ELSE 0 END) as repos_using_codeql,
                ROUND(AVG(security_maturity_score), 2) as avg_maturity,
                MAX(security_maturity_score) as max_maturity,
                MIN(security_maturity_score) as min_maturity
            FROM agg_repo_summary
        `);
        const rows = await result.getRows();
        if (rows.length === 0) return '';
        const [total, withSbom, withSig, cosign, syft, codeql, avgMat, maxMat, minMat] = rows[0];
        const totalNum = Number(total);
        const sbomPct = totalNum > 0 ? Math.round((Number(withSbom) / totalNum) * 100) : 0;
        const sigPct = totalNum > 0 ? Math.round((Number(withSig) / totalNum) * 100) : 0;
        return `
## Executive Summary

**Repositories Analyzed:** ${total}

**Supply Chain Security Posture:**
- **SBOM Adoption:** ${withSbom} repositories (${sbomPct}%)
- **Signature Adoption:** ${withSig} repositories (${sigPct}%)
- **Average Security Maturity Score:** ${avgMat}/10
- **Score Range:** ${minMat} - ${maxMat}

**Tool Usage:**
- **Cosign:** ${cosign} repositories
- **Syft:** ${syft} repositories  
- **CodeQL:** ${codeql} repositories
`;
    }

    private async generateScorecard(): Promise<string> {
        const result = await this.con!.run(`
            SELECT repository_name, security_maturity_score, total_releases,
                   has_sbom_artifact, has_signature_artifact,
                   uses_cosign, uses_syft, uses_codeql
            FROM agg_repo_summary
            ORDER BY security_maturity_score DESC, repository_name
        `);
        const rows = await result.getRows();
        let table = `
## Repository Security Scorecard

| Repository | Score | Releases | SBOM | Signatures | Cosign | Syft | CodeQL |
|------------|------:|----------|------|------------|--------|------|--------|
`;
        for (const row of rows) {
            const [name, score, releases, sbom, sig, cosign, syft, codeql] = row;
            table += `| ${name} | ${score}/10 | ${releases} | ${this.checkMark(sbom)} | ${this.checkMark(sig)} | ${this.checkMark(cosign)} | ${this.checkMark(syft)} | ${this.checkMark(codeql)} |\n`;
        }
        return table;
    }

    private async generateToolAdoption(): Promise<string> {
        const result = await this.con!.run(`
            WITH tool_counts AS (
                SELECT 'Cosign' as tool, SUM(CASE WHEN uses_cosign THEN 1 ELSE 0 END) as count FROM agg_repo_summary
                UNION ALL SELECT 'Syft', SUM(CASE WHEN uses_syft THEN 1 ELSE 0 END) FROM agg_repo_summary
                UNION ALL SELECT 'Trivy', SUM(CASE WHEN uses_trivy THEN 1 ELSE 0 END) FROM agg_repo_summary
                UNION ALL SELECT 'CodeQL', SUM(CASE WHEN uses_codeql THEN 1 ELSE 0 END) FROM agg_repo_summary
                UNION ALL SELECT 'Grype', SUM(CASE WHEN uses_grype THEN 1 ELSE 0 END) FROM agg_repo_summary
                UNION ALL SELECT 'Snyk', SUM(CASE WHEN uses_snyk THEN 1 ELSE 0 END) FROM agg_repo_summary
                UNION ALL SELECT 'Dependabot', SUM(CASE WHEN uses_dependabot THEN 1 ELSE 0 END) FROM agg_repo_summary
            ),
            total AS (SELECT COUNT(*) as total_repos FROM agg_repo_summary)
            SELECT tool, count, ROUND(100.0 * count / total_repos, 1) as percentage
            FROM tool_counts, total WHERE count > 0 ORDER BY count DESC
        `);
        const rows = await result.getRows();
        let section = `
## Tool Adoption Analysis

`;
        if (rows.length === 0) {
            section += '*No security tools detected in analyzed repositories.*\n';
            return section;
        }
        section += `| Tool | Repositories | Adoption Rate |\n`;
        section += `|------|-------------:|--------------:|\n`;
        for (const row of rows) {
            const [tool, count, pct] = row;
            section += `| ${tool} | ${count} | ${pct}% |\n`;
        }
        return section;
    }

    private async generateSbomAnalysis(): Promise<string> {
        const result = await this.con!.run(`
            SELECT COUNT(*) as total_repos,
                   SUM(CASE WHEN has_spdx_sbom THEN 1 ELSE 0 END) as spdx_count,
                   SUM(CASE WHEN has_cyclonedx_sbom THEN 1 ELSE 0 END) as cyclonedx_count,
                   SUM(CASE WHEN has_unknown_sbom_format THEN 1 ELSE 0 END) as unknown_count,
                   SUM(CASE WHEN sbom_adoption_rate > 0 THEN 1 ELSE 0 END) as partial_adoption,
                   SUM(CASE WHEN sbom_adoption_rate = 1.0 THEN 1 ELSE 0 END) as full_adoption
            FROM agg_repo_summary WHERE has_sbom_artifact = true
        `);
        const rows = await result.getRows();
        if (rows.length === 0 || rows[0][0] === 0) {
            return `
## SBOM Analysis

*No SBOMs detected in analyzed repositories.*
`;
        }
        const [total, spdx, cyclonedx, unknown, partial, full] = rows[0];
        return `
## SBOM Analysis

**Repositories with SBOMs:** ${total}

**SBOM Formats:**
- SPDX: ${spdx} repositories
- CycloneDX: ${cyclonedx} repositories
- Unknown format: ${unknown} repositories

**Adoption Patterns:**
- Full adoption (all releases): ${full} repositories
- Partial adoption (some releases): ${partial} repositories
`;
    }

    private async generateDetailedFindings(): Promise<string> {
        const result = await this.con!.run(`
            SELECT repository_name, security_maturity_score, total_releases, total_assets,
                   sbom_artifact_count, signature_artifact_count,
                   uses_sbom_generator, uses_signer, uses_vulnerability_scanner, uses_code_scanner
            FROM agg_repo_summary ORDER BY security_maturity_score DESC, repository_name
        `);
        const rows = await result.getRows();
        let section = `
## Detailed Repository Findings

`;
        for (const row of rows) {
            const [name, score, releases, assets, sboms, sigs, sbomGen, signer, vulnScan, codeScan] = row;
            section += `
### ${name}

**Security Score:** ${score}/10

**Assets:**
- ${releases} releases
- ${assets} total release assets
- ${sboms} SBOM artifacts
- ${sigs} signature artifacts

**CI/CD Security Tools:**
- SBOM Generator: ${this.checkMark(sbomGen)}
- Signing Tools: ${this.checkMark(signer)}
- Vulnerability Scanner: ${this.checkMark(vulnScan)}
- Code Scanner: ${this.checkMark(codeScan)}
`;
        }
        return section;
    }

    private checkMark(value: unknown): string {
        return value ? '✅' : '❌';
    }

    async generateHtmlReport(): Promise<string> {
        const markdown = await this.generateMarkdownReport();
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Supply Chain Security Analysis</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1 { color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
        h2 { color: #1e40af; border-bottom: 2px solid #ddd; padding-bottom: 8px; margin-top: 40px; }
        h3 { color: #1e3a8a; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f3f4f6; font-weight: 600; color: #1f2937; }
        tr:nth-child(even) { background-color: #f9fafb; }
        tr:hover { background-color: #f3f4f6; }
    </style>
</head>
<body>${this.markdownToSimpleHtml(markdown)}</body>
</html>`;
    }

    private markdownToSimpleHtml(markdown: string): string {
        let html = markdown;
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        return `<div>${html}</div>`;
    }
}

const program = new Command();

program
    .name('report')
    .description('Generate analysis reports from DuckDB database')
    .requiredOption('-d, --database <path>', 'Path to DuckDB database')
    .option('-o, --output <path>', 'Output file path (default: stdout)')
    .option('-f, --format <format>', 'Output format: markdown or html', 'markdown')
    .action(async (options) => {
        try {
            const generator = new ReportGenerator(options.database);
            console.error(chalk.cyan('🔍 Generating report...'));
            let report: string;
            if (options.format === 'html') {
                report = await generator.generateHtmlReport();
            } else {
                report = await generator.generateMarkdownReport();
            }
            await generator.close();
            if (options.output) {
                await fs.writeFile(options.output, report, 'utf-8');
                console.error(chalk.green(`✅ Report written to ${options.output}`));
            } else {
                console.log(report);
            }
        } catch (error) {
            console.error(chalk.red('❌ Error generating report:'));
            console.error(error);
            process.exit(1);
        }
    });

program.parse();
