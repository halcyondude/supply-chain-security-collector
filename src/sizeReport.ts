// src/sizeReport.ts
// Generates file size reports for output artifacts

import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Information about a file and its size
 */
type FileSizeInfo = {
  name: string;
  path: string;
  sizeBytes: number;
  sizeFormatted: string;
  category: string;
};

/**
 * Summary statistics for a category of files
 */
type CategorySummary = {
  category: string;
  fileCount: number;
  totalBytes: number;
  totalFormatted: string;
  files: FileSizeInfo[];
};

/**
 * Metadata about the data collection run
 */
type RunMetadata = {
  queryType: string;
  timestamp: string;
  totalRepos: number;
  successfulRepos: number;
  failedRepos: number;
};

/**
 * Format bytes to human-readable string (KB, MB, GB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Categorize a file based on its name pattern
 */
function categorizeFile(filename: string): string {
  if (filename === 'raw-responses.jsonl') {
    return 'Raw Responses';
  }
  if (filename.endsWith('-analyzed.json')) {
    return 'Analyzed Data';
  }
  if (filename.endsWith('-analyzed.parquet')) {
    return 'Analyzed Data';
  }
  if (filename.endsWith('.csv')) {
    return 'Analyzed Data';
  }
  if (filename.endsWith('-schema.json')) {
    return 'Schema Documentation';
  }
  if (filename === 'SIZE-REPORT.md') {
    return 'Reports';
  }
  
  return 'Other';
}

/**
 * Collect file sizes from a directory
 */
async function collectFileSizes(outputDir: string): Promise<FileSizeInfo[]> {
  const fileSizes: FileSizeInfo[] = [];
  
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(outputDir, entry.name);
        const stats = await fs.stat(filePath);
        
        fileSizes.push({
          name: entry.name,
          path: filePath,
          sizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          category: categorizeFile(entry.name),
        });
      }
    }
  } catch (error) {
    console.error(chalk.red('Error collecting file sizes:'), error);
  }
  
  return fileSizes;
}

/**
 * Group files by category and calculate subtotals
 */
function groupFilesByCategory(files: FileSizeInfo[]): CategorySummary[] {
  const categories = new Map<string, FileSizeInfo[]>();
  
  // Group files by category
  files.forEach(file => {
    if (!categories.has(file.category)) {
      categories.set(file.category, []);
    }
    categories.get(file.category)!.push(file);
  });
  
  // Calculate summaries for each category
  const summaries: CategorySummary[] = [];
  
  categories.forEach((categoryFiles, categoryName) => {
    const totalBytes = categoryFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
    
    summaries.push({
      category: categoryName,
      fileCount: categoryFiles.length,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      files: categoryFiles.sort((a, b) => b.sizeBytes - a.sizeBytes), // Sort by size desc
    });
  });
  
  // Sort categories by total size (descending)
  return summaries.sort((a, b) => b.totalBytes - a.totalBytes);
}

/**
 * Generate a Markdown size report
 */
function generateMarkdownReport(
  summaries: CategorySummary[],
  totalBytes: number,
  metadata: RunMetadata
): string {
  const lines: string[] = [];
  
  // Header
  lines.push('# Output Size Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Dataset:** ${metadata.queryType}`);
  lines.push(`**Repositories:** ${metadata.totalRepos} (${metadata.successfulRepos} successful, ${metadata.failedRepos} failed)`);
  lines.push('');
  
  // Files by category
  lines.push('## Files by Category');
  lines.push('');
  
  summaries.forEach(summary => {
    lines.push(`### ${summary.category}`);
    lines.push('');
    
    summary.files.forEach(file => {
      lines.push(`- \`${file.name}\`: ${file.sizeFormatted}`);
    });
    
    lines.push('');
  });
  
  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Files | Total Size |');
  lines.push('|----------|-------|------------|');
  
  summaries.forEach(summary => {
    lines.push(`| ${summary.category} | ${summary.fileCount} | ${summary.totalFormatted} |`);
  });
  
  const totalFileCount = summaries.reduce((sum, s) => sum + s.fileCount, 0);
  lines.push(`| **Total** | **${totalFileCount}** | **${formatBytes(totalBytes)}** |`);
  
  return lines.join('\n');
}

/**
 * Generate a size report for output files and save it to the output directory.
 * Also logs a summary to the console.
 * 
 * @param outputDir - Directory containing the generated output files
 * @param metadata - Metadata about the run
 */
export async function generateSizeReport(
  outputDir: string,
  metadata: RunMetadata
): Promise<void> {
  try {
    // Collect file sizes
    const files = await collectFileSizes(outputDir);
    
    if (files.length === 0) {
      console.log(chalk.yellow('⚠️  No files found for size report'));
      return;
    }
    
    // Group by category
    const summaries = groupFilesByCategory(files);
    
    // Calculate total
    const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
    
    // Generate Markdown report
    const markdown = generateMarkdownReport(summaries, totalBytes, metadata);
    
    // Save to file
    const reportPath = path.join(outputDir, 'SIZE-REPORT.md');
    await fs.writeFile(reportPath, markdown);
    
    // Console output
    console.log(chalk.bold.blue('\n📊 Output Size Summary'));
    console.log(chalk.gray('─'.repeat(60)));
    
    summaries.forEach(summary => {
      console.log(chalk.bold(`\n${summary.category}:`));
      summary.files.forEach(file => {
        const padding = 50 - file.name.length;
        console.log(`  ${chalk.cyan(file.name)}${' '.repeat(Math.max(0, padding))} ${chalk.green(file.sizeFormatted)}`);
      });
    });
    
    console.log(chalk.gray('\n' + '─'.repeat(60)));
    const totalFileCount = summaries.reduce((sum, s) => sum + s.fileCount, 0);
    console.log(chalk.bold(`Total: ${totalFileCount} files, ${chalk.green(formatBytes(totalBytes))}`));
    console.log(chalk.gray('─'.repeat(60)));
    
    console.log(chalk.green(`\n✅ Size report saved: ${reportPath}`));
    
  } catch (error) {
    console.error(chalk.red('Failed to generate size report:'), error);
  }
}
