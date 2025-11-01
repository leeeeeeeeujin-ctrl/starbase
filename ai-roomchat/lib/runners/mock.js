export class MockRunner {
  constructor(opts = {}) {
    this.opts = opts;
  }

  async run(template, variables = {}) {
    const logs = [];
    const outputs = {};
    const byId = new Map((template.nodes || []).map(n => [n.id, n]));

    function render(str, vars) {
      if (typeof str !== "string") return "";
      return str.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, k) => String(getVar(vars, k) ?? ""));
    }

    function getVar(vars, path) {
      const parts = path.split(".");
      let cur = vars;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    }

    const mergedVars = { ...(template.variables || {}), ...(variables || {}) };

    const visited = new Set();
    let current = (template.nodes || [])[0];
    let steps = 0;
    while (current && steps < 100) {
      steps++;
      visited.add(current.id);
      if (current.type === "prompt") {
        const text = render(current.prompt || "", mergedVars);
        logs.push({ node: current.id, type: "prompt", text });
        outputs[current.id] = { text };
      } else if (current.type === "decision") {
        const branch = mergedVars.branch || (current.params?.paths?.[0] ?? "default");
        logs.push({ node: current.id, type: "decision", branch });
        outputs[current.id] = { branch };
      } else if (current.type === "tool") {
        logs.push({ node: current.id, type: "tool", status: "ok" });
        outputs[current.id] = { status: "ok" };
      } else if (current.type === "output") {
        logs.push({ node: current.id, type: "end" });
        break;
      }

      const next = nextNode(template, current, mergedVars, outputs);
      current = next ? byId.get(next) : undefined;
    }

    return { ok: true, logs, outputs };
  }
}

function nextNode(template, node, vars, outputs) {
  const edges = template.edges || [];
  const outgoing = edges.filter(e => e.from === node.id);
  if (node.type === "decision") {
    const branch = vars.branch || outputs[node.id]?.branch;
    const e = outgoing.find(x => x.mapping?.branch === branch) || outgoing[0];
    return e?.to;
  }
  return outgoing[0]?.to;
}

