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
        sections.push(await this.generateRepositorySummary());
        sections.push(await this.generateToolAdoption());
        sections.push(await this.generateSbomAnalysis());
        sections.push(await this.generateAdvancedArtifactsAnalysis());
        sections.push(await this.generateDetailedFindings());
        return sections.join('\n');
    }

    private async generateExecutiveSummary(): Promise<string> {
        // Query the pre-computed executive summary view
        const result = await this.con!.run('SELECT * FROM agg_executive_summary');
        const rows = await result.getRows();
        if (rows.length === 0) return '';
        
        const row = rows[0];
        const totalRepos = Number(row[0]); // total_repos
        const reposWithSbom = Number(row[1]); // repos_with_sbom
        const reposWithSigs = Number(row[2]); // repos_with_signatures
        const reposWithAttest = Number(row[3]); // repos_with_attestations
        const sbomPct = Number(row[4]); // sbom_percentage
        const sigPct = Number(row[5]); // signature_percentage
        const attestPct = Number(row[6]); // attestation_percentage
        
        return `
## Executive Summary

**Repositories Analyzed:** ${totalRepos}

**Supply Chain Security Posture:**
- **SBOM Adoption:** ${reposWithSbom} repositories (${sbomPct}%)
- **Signature Adoption:** ${reposWithSigs} repositories (${sigPct}%)
- **Attestation Adoption:** ${reposWithAttest} repositories (${attestPct}%)
`;
    }

    private async generateRepositorySummary(): Promise<string> {
        // Simple query - all logic is in the SQL table
        const result = await this.con!.run('SELECT * FROM agg_repo_summary_sorted');
        const rows = await result.getRows();
        let table = `
## Repository Summary

| Repository | Releases | SBOM | Signatures | Attestations | SBOM Gen | Signer | Code Scan |
|------------|----------|------|------------|--------------|----------|--------|-----------|
`;
        for (const row of rows) {
            const [name, releases, sbom, sig, attest, sbomGen, signer, codeScan] = row;
            table += `| ${name} | ${releases} | ${this.checkMark(sbom)} | ${this.checkMark(sig)} | ${this.checkMark(attest)} | ${this.checkMark(sbomGen)} | ${this.checkMark(signer)} | ${this.checkMark(codeScan)} |\n`;
        }
        return table;
    }

    private async generateToolAdoption(): Promise<string> {
        // Query the pre-computed tool summary view
        const result = await this.con!.run('SELECT * FROM agg_tool_summary');
        const rows = await result.getRows();
        
        let section = `
## Tool Adoption Analysis

`;
        if (rows.length === 0) {
            section += '*No security tools detected in analyzed repositories.*\n';
            return section;
        }
        
        section += `| Tool | Category | Repositories | Workflows | Adoption Rate |\n`;
        section += `|------|----------|-------------:|----------:|--------------:|\n`;
        for (const row of rows) {
            const [toolName, toolCategory, repoCount, workflowCount, percentage] = row;
            section += `| ${toolName} | ${toolCategory} | ${repoCount} | ${workflowCount} | ${percentage}% |\n`;
        }
        return section;
    }

    private async generateSbomAnalysis(): Promise<string> {
        // Simple query - all logic is in the SQL table
        const result = await this.con!.run('SELECT * FROM agg_sbom_summary');
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

    private async generateAdvancedArtifactsAnalysis(): Promise<string> {
        // Simple queries - all logic is in the SQL tables
        const artifactResult = await this.con!.run('SELECT * FROM agg_advanced_artifacts');
        const toolResult = await this.con!.run('SELECT * FROM agg_tool_category_summary');

        const artifactRows = await artifactResult.getRows();
        const toolRows = await toolResult.getRows();

        if (artifactRows.length === 0 && toolRows.length === 0) {
            return `
## Advanced Supply Chain Artifacts

*No advanced supply chain artifacts detected in analyzed repositories.*
`;
        }

        let section = `
## Advanced Supply Chain Artifacts

`;

        if (artifactRows.length > 0 && artifactRows[0] && Number(artifactRows[0][0]) > 0) {
            const [repos, vex, slsa, intotoLink, intotoLayout, sigstore, swid, container, license, attestation] = artifactRows[0];
            section += `**Repositories with Advanced Artifacts:** ${repos}

**Detected Artifact Types:**
- VEX Documents: ${vex} artifacts
- SLSA Provenance: ${slsa} artifacts  
- In-toto Links: ${intotoLink} artifacts
- In-toto Layouts: ${intotoLayout} artifacts
- Sigstore Bundles: ${sigstore} artifacts
- SWID Tags: ${swid} artifacts
- Container Attestations: ${container} artifacts
- License Files: ${license} artifacts
- Generic Attestations: ${attestation} artifacts

`;
        }

        if (toolRows.length > 0) {
            // Group tools by category
            const toolsByCategory = new Map<string, Array<{name: string, repos: number, workflows: number}>>();
            for (const row of toolRows) {
                const [category, name, repoCount, workflowCount] = row;
                const categoryStr = String(category);
                if (!toolsByCategory.has(categoryStr)) {
                    toolsByCategory.set(categoryStr, []);
                }
                toolsByCategory.get(categoryStr)!.push({
                    name: String(name),
                    repos: Number(repoCount),
                    workflows: Number(workflowCount)
                });
            }

            section += `**Detected Security Tools by Category:**\n\n`;
            for (const [category, tools] of toolsByCategory) {
                const categoryLabel = category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                section += `*${categoryLabel}:*\n`;
                for (const tool of tools) {
                    section += `- ${tool.name}: ${tool.repos} repositories, ${tool.workflows} workflows\n`;
                }
                section += '\n';
            }
        }

        return section;
    }

    private async generateDetailedFindings(): Promise<string> {
        // Simple query - all logic is in the SQL table
        const result = await this.con!.run('SELECT * FROM agg_repo_detail');
        const rows = await result.getRows();
        
        if (rows.length === 0) {
            return `
## Detailed Repository Findings

*No repositories analyzed.*
`;
        }

        let section = `
## Detailed Repository Findings

`;
        for (const row of rows) {
            const [name, releases, assets, sboms, sigs, sbomGen, signer, vulnScan, codeScan] = row;
            section += `
### ${name}

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
