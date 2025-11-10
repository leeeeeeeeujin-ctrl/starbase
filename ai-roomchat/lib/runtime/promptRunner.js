// Minimal prompt graph runner utilities (read-only helpers for GameRuntimePanel)

export function buildIndex(graph) {
  const nodesById = new Map((graph?.nodes || []).map(n => [n.id, n]));
  const outEdges = new Map();
  for (const e of (graph?.edges || [])) {
    const list = outEdges.get(e.source) || [];
    list.push(e);
    outEdges.set(e.source, list);
  }
  return { nodesById, outEdges };
}

export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return 'Invalid graph: expected { nodes: [], edges: [] }';
  }
  for (const n of graph.nodes) {
    if (!n || !n.id) return 'Invalid node without id';
  }
  for (const e of graph.edges) {
    if (!e || !e.source || !e.target) return 'Invalid edge missing endpoints';
  }
  return '';
}

