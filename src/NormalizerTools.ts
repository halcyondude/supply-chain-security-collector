// NormalizerTools.js
// Generic processors for YAML, Markdown, Dockerfile, and more

import yaml from 'yaml';

export function processYaml(content: string): any {
    try {
        return yaml.parse(content);
    } catch (err) {
        return null;
    }
}

export function processMarkdown(content: string): { headings: string[] } {
    // Simple heading extraction; can be replaced with a full markdown parser
    const headings = content.match(/^#+\s.+/gm) || [];
    return { headings };
}

export function processDockerfile(content: string): { instructions: string[] } {
    // Simple Dockerfile instruction extraction
    const instructions = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && /^[A-Z]+/.test(line));
    return { instructions };
}

// Add more processors as needed (e.g., CSV, TOML, etc.)
