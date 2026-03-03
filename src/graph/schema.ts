/**
 * Graph Schema — maps the relational DuckDB model to a labeled property graph
 * for LadybugDB. Follows the GUAC schema-export pattern.
 *
 * Node Tables:
 *   Repository, Release, ReleaseAsset, Workflow, CNCFProject, Tool, ToolCategory
 *
 * Relationship Tables:
 *   HAS_RELEASE, HAS_ASSET, HAS_WORKFLOW, BELONGS_TO, USES_TOOL, IN_CATEGORY
 */

export interface NodeTableDef {
    name: string;
    primaryKey: string;
    columns: Array<{ name: string; type: string }>;
    sourceQuery: string;
}

export interface RelTableDef {
    name: string;
    from: string;
    to: string;
    columns: Array<{ name: string; type: string }>;
    sourceQuery: string;
}

export const NODE_TABLES: NodeTableDef[] = [
    {
        name: 'Repository',
        primaryKey: 'id',
        columns: [
            { name: 'id', type: 'STRING' },
            { name: 'name', type: 'STRING' },
            { name: 'nameWithOwner', type: 'STRING' },
            { name: 'url', type: 'STRING' },
            { name: 'description', type: 'STRING' },
        ],
        sourceQuery: `SELECT id, name, nameWithOwner, url, COALESCE(description, '') as description FROM base_repositories`,
    },
    {
        name: 'Release',
        primaryKey: 'id',
        columns: [
            { name: 'id', type: 'STRING' },
            { name: 'name', type: 'STRING' },
            { name: 'tagName', type: 'STRING' },
            { name: 'url', type: 'STRING' },
            { name: 'createdAt', type: 'STRING' },
        ],
        sourceQuery: `SELECT id, COALESCE(name, '') as name, tagName, url, CAST(createdAt AS VARCHAR) as createdAt FROM base_releases`,
    },
    {
        name: 'ReleaseAsset',
        primaryKey: 'id',
        columns: [
            { name: 'id', type: 'STRING' },
            { name: 'name', type: 'STRING' },
            { name: 'downloadUrl', type: 'STRING' },
        ],
        sourceQuery: `SELECT id, name, downloadUrl FROM base_release_assets`,
    },
    {
        name: 'Workflow',
        primaryKey: 'id',
        columns: [
            { name: 'id', type: 'STRING' },
            { name: 'filename', type: 'STRING' },
        ],
        sourceQuery: `SELECT id, filename FROM base_workflows`,
    },
    {
        name: 'CNCFProject',
        primaryKey: 'project_name',
        columns: [
            { name: 'project_name', type: 'STRING' },
            { name: 'display_name', type: 'STRING' },
            { name: 'maturity', type: 'STRING' },
            { name: 'category', type: 'STRING' },
            { name: 'subcategory', type: 'STRING' },
        ],
        sourceQuery: `SELECT project_name, COALESCE(display_name, project_name) as display_name, COALESCE(maturity, '') as maturity, COALESCE(category, '') as category, COALESCE(subcategory, '') as subcategory FROM base_cncf_projects`,
    },
    {
        name: 'Tool',
        primaryKey: 'tool_name',
        columns: [
            { name: 'tool_name', type: 'STRING' },
        ],
        sourceQuery: `SELECT DISTINCT tool_name FROM agg_workflow_tools WHERE tool_name IS NOT NULL`,
    },
    {
        name: 'ToolCategory',
        primaryKey: 'category_name',
        columns: [
            { name: 'category_name', type: 'STRING' },
        ],
        sourceQuery: `SELECT DISTINCT tool_category as category_name FROM agg_workflow_tools WHERE tool_category IS NOT NULL`,
    },
];

export const REL_TABLES: RelTableDef[] = [
    {
        name: 'HAS_RELEASE',
        from: 'Repository',
        to: 'Release',
        columns: [],
        sourceQuery: `SELECT DISTINCT r.repository_id, r.id FROM base_releases r`,
    },
    {
        name: 'HAS_ASSET',
        from: 'Release',
        to: 'ReleaseAsset',
        columns: [],
        sourceQuery: `SELECT DISTINCT ra.release_id, ra.id FROM base_release_assets ra`,
    },
    {
        name: 'HAS_WORKFLOW',
        from: 'Repository',
        to: 'Workflow',
        columns: [],
        sourceQuery: `SELECT DISTINCT w.repository_id, w.id FROM base_workflows w`,
    },
    {
        name: 'BELONGS_TO',
        from: 'Repository',
        to: 'CNCFProject',
        columns: [],
        sourceQuery: `
            SELECT DISTINCT r.id, pr.project_name
            FROM base_cncf_project_repos pr
            JOIN base_repositories r ON pr.owner = SPLIT_PART(r.nameWithOwner, '/', 1)
                                     AND pr.name = SPLIT_PART(r.nameWithOwner, '/', 2)
        `,
    },
    {
        name: 'USES_TOOL',
        from: 'Workflow',
        to: 'Tool',
        columns: [],
        sourceQuery: `SELECT DISTINCT wt.workflow_id, wt.tool_name FROM agg_workflow_tools wt WHERE wt.tool_name IS NOT NULL`,
    },
    {
        name: 'IN_CATEGORY',
        from: 'Tool',
        to: 'ToolCategory',
        columns: [],
        sourceQuery: `SELECT DISTINCT wt.tool_name, wt.tool_category FROM agg_workflow_tools wt WHERE wt.tool_name IS NOT NULL AND wt.tool_category IS NOT NULL`,
    },
];
