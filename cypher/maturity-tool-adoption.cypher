// Tool category adoption by CNCF maturity level
MATCH (p:CNCFProject)<-[:BELONGS_TO]-(r:Repository)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_TOOL]->(t:Tool)-[:IN_CATEGORY]->(tc:ToolCategory)
RETURN p.maturity, tc.category_name, count(DISTINCT r) AS repo_count
ORDER BY p.maturity, repo_count DESC
