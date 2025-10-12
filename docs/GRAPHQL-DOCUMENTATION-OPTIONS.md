# GraphQL Documentation Options for Static HTML Generation

**Date:** October 11, 2025  
**Context:** Research for static documentation that integrates with GraphQL Codegen

---

## Executive Summary

**Best Options for Static HTML Documentation:**

1. **SpectaQL** ⭐ (Recommended) - Beautiful, theme-able, static HTML from GraphQL schema
2. **GraphDoc** - Simpler alternative, also generates static HTML
3. **GraphQL Markdown** + Static Site Generator - More flexible but requires extra tooling

All can be integrated with the GraphQL Code Generator ecosystem and hosted on GitHub Pages.

---

## Option 1: SpectaQL ⭐ (Recommended)

### What It Is
SpectaQL is a **powerful, professional-grade static documentation generator** specifically designed for GraphQL APIs. It produces beautiful, fully-featured HTML documentation sites.

### Key Features
- ✅ **Static HTML output** - Perfect for GitHub Pages
- ✅ **Beautiful, responsive UI** - Professional appearance
- ✅ **Interactive** - Try queries, see examples
- ✅ **Themeable** - Customize appearance
- ✅ **Introspection-based** - Works from schema or endpoint
- ✅ **Markdown support** - Add custom content
- ✅ **Examples** - Include query/mutation examples
- ✅ **Authentication docs** - Document auth requirements

### How It Works

```bash
# Install
npm install --save-dev spectaql

# Generate docs
npx spectaql config.yml
```

**Configuration (`spectaql.yml`):**

```yaml
spectaql:
  # Target the introspection JSON from codegen!
  introspection:
    schemaFile: ./schema/introspection.json
    
  # Or use the SDL
  # schemaFile: ./schema/schema.graphql
  
  # Output directory
  targetDir: ./docs/api
  
  # Metadata
  info:
    title: GitHub Repository Supply Chain API
    description: |
      GraphQL API for querying GitHub repository supply chain security data
    version: 1.0.0
    contact:
      name: API Support
      url: https://github.com/halcyondude/github-repo-supply-chain-datacollector
  
  # Servers
  servers:
    - url: https://api.github.com/graphql
      description: GitHub GraphQL API
      production: true
  
  # Customize appearance
  logo: ./assets/logo.png
  themeDir: ./theme  # Optional custom theme
  
  # Options
  options:
    targetDir: ./docs/api
    logoFile: ./assets/logo.png
    
    # Include examples from your queries!
    examplesFromFile: ./src/graphql/**/*.graphql
```

### Output Structure

```
docs/api/
├── index.html              # Main documentation
├── css/
│   └── spectaql.css       # Styles
├── js/
│   └── spectaql.js        # Interactive features
└── assets/
    └── logo.png
```

### Integration with Codegen

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://api.github.com/graphql',
  documents: ['src/graphql/**/*.graphql'],
  
  generates: {
    // 1. Generate introspection JSON for SpectaQL
    'schema/introspection.json': {
      plugins: ['introspection']
    },
    
    // 2. Generate SDL as backup
    'schema/schema.graphql': {
      plugins: ['schema-ast']
    },
    
    // ... other codegen outputs
  }
};

export default config;
```

**NPM Script:**

```json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "docs:generate": "spectaql spectaql.yml",
    "docs:build": "npm run codegen && npm run docs:generate",
    "docs:serve": "npx http-server docs/api -p 8080"
  }
}
```

### Pros
- ✅ Professional, polished output
- ✅ Interactive query explorer
- ✅ Great for public-facing APIs
- ✅ Highly customizable themes
- ✅ Well-maintained project
- ✅ Perfect for GitHub Pages

### Cons
- ⚠️ Requires separate configuration file
- ⚠️ Larger output size (includes JS/CSS)

### GitHub Pages Deployment

```yaml
# .github/workflows/docs.yml
name: Deploy Documentation

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm ci
      - run: npm run docs:build
      
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/api
```

---

## Option 2: GraphDoc

### What It Is
A simpler, lightweight static documentation generator for GraphQL schemas.

### Key Features
- ✅ Static HTML output
- ✅ Simple, clean UI
- ✅ Fast generation
- ✅ No configuration needed
- ✅ GitHub Pages ready

### How It Works

```bash
# Install
npm install --save-dev @2fd/graphdoc

# Generate from schema
npx graphdoc -s schema/schema.graphql -o docs/api

# Or from endpoint
npx graphdoc -e https://api.github.com/graphql -o docs/api
```

### Integration with Codegen

```typescript
// codegen.ts - same as above, generate schema.graphql

// package.json
{
  "scripts": {
    "docs:generate": "graphdoc -s schema/schema.graphql -o docs/api",
    "docs:build": "npm run codegen && npm run docs:generate"
  }
}
```

### Pros
- ✅ Zero configuration
- ✅ Fast and simple
- ✅ Lightweight output
- ✅ Easy to get started

### Cons
- ⚠️ Less feature-rich than SpectaQL
- ⚠️ Basic styling
- ⚠️ No query examples
- ⚠️ Less actively maintained

---

## Option 3: GraphQL Markdown + Docusaurus/MkDocs

### What It Is
Generate Markdown from schema, then use a static site generator to create beautiful docs.

### How It Works

```bash
# Install
npm install --save-dev graphql-markdown

# Generate Markdown
npx graphql-markdown --schema schema/schema.graphql --output docs/schema.md
```

**Then use a static site generator:**

#### Option 3A: Docusaurus

```bash
npm install --save-dev @docusaurus/core @docusaurus/preset-classic

# Docusaurus creates a full documentation site
npx docusaurus init docs classic
```

**Structure:**
```
docs/
├── api/
│   └── schema.md         # Generated from schema
├── guides/
│   └── getting-started.md
└── intro.md
```

#### Option 3B: MkDocs (Python-based)

```bash
pip install mkdocs mkdocs-material

# mkdocs.yml
site_name: GraphQL API Documentation
theme:
  name: material
nav:
  - Home: index.md
  - API Reference: schema.md
```

### Pros
- ✅ Maximum flexibility
- ✅ Integrate with other docs
- ✅ Full control over styling
- ✅ Can add tutorials, guides, etc.

### Cons
- ⚠️ More setup required
- ⚠️ Need to maintain site generator
- ⚠️ Markdown is less interactive than HTML

---

## Option 4: Custom Codegen Plugin

### What It Is
Write a custom GraphQL Codegen plugin that generates HTML directly.

### How It Works

```typescript
// src/codegen-plugins/html-docs.ts
import { PluginFunction } from '@graphql-codegen/plugin-helpers';

export const htmlDocsPlugin: PluginFunction = (schema, documents, config) => {
  const typeMap = schema.getTypeMap();
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>GraphQL Schema Documentation</title>
      <style>
        /* Your styles */
      </style>
    </head>
    <body>
      <h1>GraphQL Schema</h1>
  `;
  
  for (const [typeName, type] of Object.entries(typeMap)) {
    if (typeName.startsWith('__')) continue;
    
    html += `
      <section id="${typeName}">
        <h2>${typeName}</h2>
        <p>${type.description || ''}</p>
        <!-- Generate fields, relationships, etc. -->
      </section>
    `;
  }
  
  html += `
    </body>
    </html>
  `;
  
  return html;
};

// codegen.ts
const config: CodegenConfig = {
  generates: {
    'docs/api/index.html': {
      plugins: [htmlDocsPlugin]
    }
  }
};
```

### Pros
- ✅ Complete control
- ✅ Single source of truth
- ✅ No external dependencies
- ✅ Fully customizable

### Cons
- ⚠️ Most work to implement
- ⚠️ Need to maintain HTML/CSS/JS
- ⚠️ Won't have advanced features without effort

---

## Comparison Matrix

| Feature | SpectaQL | GraphDoc | Markdown + SSG | Custom Plugin |
|---------|----------|----------|----------------|---------------|
| **Setup Complexity** | Medium | Low | High | Very High |
| **Output Quality** | Excellent | Good | Excellent | Depends |
| **Interactive** | Yes | No | No | Depends |
| **Customizable** | High | Low | Very High | Complete |
| **Maintenance** | Low | Low | Medium | High |
| **GitHub Pages** | ✅ | ✅ | ✅ | ✅ |
| **Codegen Integration** | ✅ | ✅ | ✅ | ✅ |
| **Query Examples** | ✅ | ❌ | Manual | Depends |
| **Themes** | ✅ | ❌ | ✅ | Custom |
| **File Size** | ~500KB | ~100KB | Varies | Depends |

---

## Recommended Approach

### For This Project: SpectaQL

**Why:**
1. **Professional output** suitable for public documentation
2. **Interactive features** let users explore the schema
3. **Low maintenance** once configured
4. **Perfect for GitHub Pages** - just commit the output
5. **Integrates seamlessly** with codegen introspection output
6. **Includes examples** from your GraphQL query files

### Implementation Steps

1. **Update `codegen.ts`:**
   ```typescript
   generates: {
     'schema/introspection.json': {
       plugins: ['introspection']
     },
     'schema/schema.graphql': {
       plugins: ['schema-ast']
     }
   }
   ```

2. **Install SpectaQL:**
   ```bash
   npm install --save-dev spectaql
   ```

3. **Create `spectaql.yml`:**
   ```yaml
   spectaql:
     introspection:
       schemaFile: ./schema/introspection.json
     targetDir: ./docs/api
     info:
       title: GitHub Supply Chain Analyzer API
       description: GraphQL schema for repository security analysis
   ```

4. **Add npm scripts:**
   ```json
   {
     "docs:generate": "spectaql spectaql.yml",
     "docs:build": "npm run codegen && npm run docs:generate"
   }
   ```

5. **Configure GitHub Pages:**
   - Set source to `/docs` folder
   - Or use GitHub Actions workflow

---

## Advanced: Hybrid Approach

**Best of all worlds:**

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: 'https://api.github.com/graphql',
  
  generates: {
    // 1. TypeScript types
    'src/generated/types.ts': {
      plugins: ['typescript', 'typescript-operations']
    },
    
    // 2. Introspection for SpectaQL
    'schema/introspection.json': {
      plugins: ['introspection']
    },
    
    // 3. SDL for backup/viewing
    'schema/schema.graphql': {
      plugins: ['schema-ast']
    },
    
    // 4. Backend metadata
    'src/generated/backend-metadata.json': {
      plugins: [backendMetadataPlugin]
    },
    
    // 5. Markdown reference (optional)
    'docs/schema-reference.md': {
      plugins: ['graphql-markdown']  // If using this package
    }
  }
};

// Then run SpectaQL separately
// npm run docs:generate
```

**Result:**
- SpectaQL for beautiful interactive docs → GitHub Pages
- Markdown for embedding in other docs
- JSON for programmatic access
- SDL for schema-first development

---

## Example Output URLs

After deployment to GitHub Pages:

```
https://halcyondude.github.io/github-repo-supply-chain-datacollector/
├── index.html                    # Project README
├── api/                          # SpectaQL documentation
│   ├── index.html               # Schema overview
│   ├── queries.html             # Query docs
│   └── types.html               # Type reference
└── guides/                       # Optional: additional docs
    └── getting-started.html
```

---

## Next Steps

1. ✅ Add introspection plugin to `codegen.ts`
2. ✅ Install SpectaQL: `npm install --save-dev spectaql`
3. ✅ Create `spectaql.yml` configuration
4. ✅ Run: `npm run docs:build`
5. ✅ Commit generated docs to `/docs/api`
6. ✅ Enable GitHub Pages from `/docs` folder
7. ✅ (Optional) Set up GitHub Actions for auto-deployment

---

## Additional Resources

- **SpectaQL:** https://github.com/anvilco/spectaql
- **GraphDoc:** https://github.com/2fd/graphdoc
- **GraphQL Markdown:** https://www.npmjs.com/package/graphql-markdown
- **Docusaurus:** https://docusaurus.io/
- **GitHub Pages:** https://pages.github.com/

---

**Recommendation:** Start with SpectaQL. It provides the best balance of features, maintainability, and professional output for static HTML documentation hosted on GitHub Pages.
