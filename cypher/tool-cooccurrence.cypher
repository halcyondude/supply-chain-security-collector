// Tool co-occurrence: which tools tend to appear together in workflows?
MATCH (w:Workflow)-[:USES_TOOL]->(t1:Tool),
      (w)-[:USES_TOOL]->(t2:Tool)
WHERE t1.tool_name < t2.tool_name
RETURN t1.tool_name, t2.tool_name, count(*) AS co_occurrence
ORDER BY co_occurrence DESC
LIMIT 20
