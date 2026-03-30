// Which graduated projects don't use any signing tools?
MATCH (p:CNCFProject {maturity: 'graduated'})<-[:BELONGS_TO]-(r:Repository)
WHERE NOT EXISTS {
    MATCH (r)-[:HAS_WORKFLOW]->(:Workflow)-[:USES_TOOL]->(:Tool)<-[:IN_CATEGORY]-(:ToolCategory {category_name: 'signer'})
}
RETURN p.display_name, r.nameWithOwner
ORDER BY p.display_name
