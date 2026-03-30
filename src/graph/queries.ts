/**
 * Pre-built Cypher queries for CNCF supply chain security analysis.
 * These can be executed against the LadybugDB graph built by GraphBuilder.
 */

export interface CypherQuery {
    name: string;
    description: string;
    cypher: string;
}

export const CYPHER_QUERIES: CypherQuery[] = [
    {
        name: 'graduated-no-signing',
        description: 'Graduated projects without any signing tools in workflows',
        cypher: `
MATCH (p:CNCFProject {maturity: 'graduated'})<-[:BELONGS_TO]-(r:Repository)
WHERE NOT EXISTS {
    MATCH (r)-[:HAS_WORKFLOW]->(:Workflow)-[:USES_TOOL]->(:Tool)<-[:IN_CATEGORY]-(:ToolCategory {category_name: 'signer'})
}
RETURN p.display_name, r.nameWithOwner
ORDER BY p.display_name
        `.trim(),
    },
    {
        name: 'tool-cooccurrence',
        description: 'Tool co-occurrence: which tools tend to appear together in workflows',
        cypher: `
MATCH (w:Workflow)-[:USES_TOOL]->(t1:Tool),
      (w)-[:USES_TOOL]->(t2:Tool)
WHERE t1.tool_name < t2.tool_name
RETURN t1.tool_name, t2.tool_name, count(*) AS co_occurrence
ORDER BY co_occurrence DESC
LIMIT 20
        `.trim(),
    },
    {
        name: 'full-pipeline',
        description: 'Repos with full SBOM + signing pipeline (SBOM assets + cosign/sigstore)',
        cypher: `
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)-[:HAS_RELEASE]->(rel:Release)-[:HAS_ASSET]->(a:ReleaseAsset)
MATCH (r)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool)
WHERE a.name CONTAINS 'sbom' AND t.tool_name IN ['cosign', 'sigstore']
RETURN p.display_name, r.nameWithOwner, count(DISTINCT rel) AS signed_releases
ORDER BY signed_releases DESC
        `.trim(),
    },
    {
        name: 'maturity-tool-adoption',
        description: 'Tool category adoption by CNCF maturity level',
        cypher: `
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool)-[:IN_CATEGORY]->(tc:ToolCategory)
RETURN p.maturity, tc.category_name, count(DISTINCT r) AS repo_count
ORDER BY p.maturity, repo_count DESC
        `.trim(),
    },
    {
        name: 'project-tool-summary',
        description: 'All tools used by each CNCF project',
        cypher: `
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool)
RETURN p.display_name, p.maturity, collect(DISTINCT t.tool_name) AS tools, count(DISTINCT r) AS repos
ORDER BY p.display_name
        `.trim(),
    },
    {
        name: 'repos-by-tool',
        description: 'Repositories using a specific tool (parameterize tool_name)',
        cypher: `
MATCH (r:Repository)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool {tool_name: 'cosign'})
RETURN r.nameWithOwner, w.filename
ORDER BY r.nameWithOwner
        `.trim(),
    },
    {
        name: 'unmonitored-graduated',
        description: 'Graduated projects with no detected CI security tools at all',
        cypher: `
MATCH (p:CNCFProject {maturity: 'graduated'})<-[:BELONGS_TO]-(r:Repository)
WHERE NOT EXISTS {
    MATCH (r)-[:HAS_WORKFLOW]->(:Workflow)-[:USES_TOOL]->(:Tool)
}
RETURN p.display_name, r.nameWithOwner
ORDER BY p.display_name
        `.trim(),
    },
];

/**
 * Get a named query by name
 */
export function getQuery(name: string): CypherQuery | undefined {
    return CYPHER_QUERIES.find(q => q.name === name);
}

/**
 * List all available query names
 */
export function listQueries(): string[] {
    return CYPHER_QUERIES.map(q => `${q.name}: ${q.description}`);
}
