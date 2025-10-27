// NormalizerTools.test.ts
// Simple tests for NormalizerTools processors

import { processYaml, processMarkdown, processDockerfile } from './NormalizerTools.js';

// YAML test
const yamlContent = `foo: bar\nlist:\n  - a\n  - b`;
console.log('YAML:', processYaml(yamlContent));

// Markdown test
const mdContent = `# Heading 1\nSome text\n## Heading 2\nMore text`;
console.log('Markdown:', processMarkdown(mdContent));

// Dockerfile test
const dockerContent = `FROM node:18\nCOPY . /app\nRUN npm install\nCMD [\"node\", \"index.js\"]`;
console.log('Dockerfile:', processDockerfile(dockerContent));
