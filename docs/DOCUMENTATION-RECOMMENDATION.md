# Documentation Strategy: GraphQL Schema + Static HTML

**Date:** October 11, 2025  
**Decision:** Use SpectaQL for static HTML documentation integrated with GraphQL Codegen

---

## The Solution: SpectaQL + GraphQL Codegen

### What We Get

**SpectaQL** generates beautiful, interactive static HTML documentation from GraphQL schemas. It's:

- ✅ **Perfect for GitHub Pages** - Pure static HTML/CSS/JS
- ✅ **Professional** - Used by companies like Stripe, Twilio
- ✅ **Interactive** - Users can explore types and relationships
- ✅ **Integrates with Codegen** - Uses introspection JSON we already generate
- ✅ **Zero backend** - Just commit the HTML and deploy

### Live Example

See what SpectaQL produces: [Anvil's API docs](https://docs.anvil.com/graphql)

---

## Implementation

### Step 1: Update Codegen Configuration

```typescript
// codegen.ts
const config: CodegenConfig = {
  schema: 'https://api.github.com/graphql',
  documents: ['src/graphql/**/*.graphql'],
  
  generates: {
    // Types for runtime
    'src/generated/types.ts': {
      plugins: ['typescript', 'typescript-operations']
    },
    
    // For SpectaQL documentation (ADD THIS)
    'schema/introspection.json': {
      plugins: ['introspection'],
      config: {
        descriptions: true,
        minify: false
      }
    },
    
    // SDL for viewing/backup
    'schema/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true,
        commentDescriptions: false
      }
    },
    
    // Backend metadata
    'src/generated/backend-metadata.json': {
      plugins: [backendMetadataPlugin]
    }
  }
};
```

### Step 2: Install SpectaQL

```bash
npm install --save-dev spectaql
```

### Step 3: Create `spectaql.yml`

```yaml
spectaql:
  # Use introspection JSON from codegen
  introspection:
    schemaFile: ./schema/introspection.json
  
  # Output directory
  targetDir: ./docs/api
  
  # Metadata
  info:
    title: GitHub Repository Supply Chain Security API
    description: |
      This API provides access to GitHub repository data with a focus on 
      supply chain security artifacts including SBOMs, signatures, and CI/CD workflows.
    version: 1.0.0
    contact:
      name: Project Repository
      url: https://github.com/halcyondude/github-repo-supply-chain-datacollector
  
  # The actual API we're documenting
  servers:
    - url: https://api.github.com/graphql
      description: GitHub GraphQL API v4
      production: true
  
  # Options
  options:
    # Include example queries from our GraphQL files
    examplesFromFile: ./src/graphql/**/*.graphql
    
    # Generate a single-page app
    oneFile: false
    
    # Display options
    displayAllServers: true
```

### Step 4: Add NPM Scripts

```json
{
  "scripts": {
    "codegen": "graphql-codegen",
    "docs:generate": "spectaql spectaql.yml",
    "docs:build": "npm run codegen && npm run docs:generate",
    "docs:serve": "npx http-server docs/api -p 8080 -o"
  }
}
```

### Step 5: Generate Documentation

```bash
# Generate everything
npm run docs:build

# Preview locally
npm run docs:serve
# Opens http://localhost:8080
```

---

## What Gets Generated

```text
docs/api/
├── index.html              # Main schema documentation
├── queries.html            # Query operations
├── mutations.html          # Mutation operations
├── types.html              # Type reference
├── css/
│   └── spectaql.min.css   # Styles
├── js/
│   └── spectaql.min.js    # Interactive features
└── assets/
    └── logo.png           # Optional branding
```

### Features in the Output

1. **Schema Overview** - Complete type system visualization
2. **Type Explorer** - Click through types and relationships
3. **Query Examples** - From your `.graphql` files
4. **Searchable** - Find types and fields quickly
5. **Responsive** - Works on mobile
6. **Dark Mode** - Built-in theme support

---

## GitHub Pages Deployment

### Option A: Manual (Simple)

```bash
# 1. Generate docs
npm run docs:build

# 2. Commit and push
git add docs/api
git commit -m "docs: update API documentation"
git push

# 3. Enable GitHub Pages
# Go to Settings > Pages > Source: /docs folder
```

### Option B: GitHub Actions (Automated)

```yaml
# .github/workflows/docs.yml
name: Generate and Deploy Documentation

on:
  push:
    branches: [main]
    paths:
      - 'schema/**'
      - 'src/graphql/**'
      - 'spectaql.yml'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate documentation
        run: npm run docs:build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/api
          destination_dir: api
```

**Result:** Docs automatically update on every push to main!

---

## Integration with Our Architecture

### How It Fits

```text
npm run codegen
    ↓
1. Generate introspection.json  ← SpectaQL reads this
2. Generate types.ts            ← Runtime uses this
3. Generate backend-metadata.json ← Backends use this
    ↓
npm run docs:generate
    ↓
SpectaQL reads introspection.json
    ↓
Generates docs/api/index.html
    ↓
Commit to git
    ↓
GitHub Pages serves it
```

### Workflow

```bash
# Developer changes schema or queries
vim src/graphql/GetRepoData.graphql

# Regenerate everything
npm run docs:build

# Preview locally
npm run docs:serve

# Commit
git add schema/ docs/api/ src/graphql/
git commit -m "feat: add new query fields"
git push

# GitHub Pages automatically updates (if using Actions)
```

---

## Customization Options

### Theme

```yaml
# spectaql.yml
spectaql:
  themeDir: ./theme
  
  # Custom CSS
  stylesheets:
    - ./theme/custom.css
  
  # Custom JavaScript
  javascripts:
    - ./theme/custom.js
```

### Logo and Branding

```yaml
spectaql:
  options:
    logoFile: ./assets/logo.png
    
  info:
    title: Your Project Name
    description: Your description
```

### Colors

```css
/* theme/custom.css */
:root {
  --primary-color: #0366d6;
  --secondary-color: #586069;
  --background-color: #ffffff;
  --text-color: #24292e;
}
```

---

## Comparison with Alternatives

| Feature | SpectaQL | GraphDoc | Markdown |
|---------|----------|----------|----------|
| Static HTML | ✅ | ✅ | ❌ (needs SSG) |
| Interactive | ✅ | ❌ | ❌ |
| Beautiful UI | ✅ | ⚠️ | ⚠️ |
| Query Examples | ✅ | ❌ | Manual |
| GitHub Pages | ✅ | ✅ | ✅ |
| Setup Time | 10 min | 5 min | 30+ min |
| Maintenance | Low | Low | Medium |

**Winner:** SpectaQL for professional, low-maintenance docs.

---

## Benefits for This Project

1. **Users can explore the schema** without running code
2. **GitHub integration** - See what queries return
3. **Developer reference** - Quick lookup for field types
4. **Public documentation** - Share with team/community
5. **Version history** - Track schema changes in git
6. **No infrastructure** - Just commit HTML files

---

## Next Actions

**Immediate (Phase 0):**

1. ✅ Add introspection plugin to codegen.ts
2. ✅ Install spectaql
3. ✅ Create spectaql.yml
4. ✅ Run `npm run docs:build`
5. ✅ Verify output in docs/api/

**Later (Phase 6 - Documentation):**

1. Add custom logo and branding
2. Write additional guides (getting-started.md, etc.)
3. Set up GitHub Actions for auto-deployment
4. Add examples for common queries
5. Create tutorial content

---

## Example Output

After running `npm run docs:build`, users visiting your GitHub Pages will see:

```text
https://halcyondude.github.io/github-repo-supply-chain-datacollector/api/

┌─────────────────────────────────────────────────┐
│  GitHub Supply Chain Security API               │
│                                                  │
│  [Search types...]                               │
│                                                  │
│  Types                                           │
│  ├─ Repository                                   │
│  ├─ Artifact                                     │
│  ├─ Workflow                                     │
│  └─ SecurityPolicy                               │
│                                                  │
│  Queries                                         │
│  ├─ repository(owner, name)                      │
│  └─ repositories(filter)                         │
│                                                  │
│  [Click any type to explore →]                   │
└─────────────────────────────────────────────────┘
```

Clean, professional, and interactive!

---

**Recommendation:** Implement SpectaQL in Phase 0 alongside completing ArtifactWriter.ts. It's quick to set up and provides immediate value.
