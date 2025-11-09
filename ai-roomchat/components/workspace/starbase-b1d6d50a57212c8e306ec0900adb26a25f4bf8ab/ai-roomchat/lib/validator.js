export function validateTemplate(t) {
  const errors = [];
  if (!t || typeof t !== "object") {
    return { ok: false, errors: ["Template must be an object."] };
  }
  for (const key of ["id", "name", "version"]) {
    if (!t[key] || typeof t[key] !== "string") errors.push(`${key} must be a non-empty string`);
  }
  if (!Array.isArray(t.nodes) || t.nodes.length === 0) errors.push("nodes must be a non-empty array");
  if (!Array.isArray(t.edges)) errors.push("edges must be an array");
  if (Array.isArray(t.nodes)) {
    const ids = new Set();
    for (const n of t.nodes) {
      if (!n || typeof n !== "object") { errors.push("node must be an object"); continue; }
      if (!n.id || typeof n.id !== "string") errors.push("node.id must be a string");
      if (!n.type || typeof n.type !== "string") errors.push(`node(${n.id || "?"}).type must be a string`);
      if (n.id) {
        if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
        ids.add(n.id);
      }
    }
  }
  if (Array.isArray(t.edges)) {
    for (const e of t.edges) {
      if (!e || typeof e !== "object") { errors.push("edge must be an object"); continue; }
      if (!e.from || typeof e.from !== "string") errors.push("edge.from must be a string");
      if (!e.to || typeof e.to !== "string") errors.push("edge.to must be a string");
    }
  }
  return { ok: errors.length === 0, errors };
}

