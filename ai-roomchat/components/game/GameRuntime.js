/**
 * Lightweight, environment-agnostic game runtime.
 * - Pure JS (no DOM / Node-only APIs)
 * - Can compile templates against a variables map
 * - Execute a node (simple AI simulation: returns compiled template)
 * - Emits events for runs and score changes
 */
export default class GameRuntime {
  constructor({ variables = {}, nodes = [] } = {}) {
    this.variables = { ...(variables || {}) };
    this.nodes = Array.isArray(nodes) ? nodes.slice() : [];
    this.listeners = {};
    this.score = 0;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event].add(cb);
    return () => this.listeners[event] && this.listeners[event].delete(cb);
  }

  off(event, cb) {
    this.listeners[event] && this.listeners[event].delete(cb);
  }

  emit(event, payload) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => {
      try {
        cb(payload);
      } catch (e) {
        // swallow
      }
    });
  }

  setVariables(obj) {
    this.variables = { ...this.variables, ...(obj || {}) };
    this.emit('variablesChanged', this.getVariables());
  }

  setVariable(key, value) {
    this.variables = { ...this.variables, [key]: value };
    this.emit('variablesChanged', this.getVariables());
  }

  getVariables() {
    return { ...this.variables };
  }

  updateNodes(nodes) {
    this.nodes = Array.isArray(nodes) ? nodes.slice() : [];
  }

  // simple template compiler supporting {{var}} and {{path.dot}}
  compileTemplate(template = '', vars = {}) {
    let out = String(template || '');
    try {
      out = out.replace(/{{\s*([\w.\-{}가-힣]+)\s*}}/g, (_, path) => {
        // allow keys both with and without surrounding braces
        const key = path;
        const parts = key.split('.');
        let v = vars;
        for (const p of parts) {
          if (v && Object.prototype.hasOwnProperty.call(v, p)) v = v[p];
          else {
            // try full-brace-style keys like {{캐릭터.이름}} stored literally
            if (Object.prototype.hasOwnProperty.call(vars, `{{${key}}}`)) return String(vars[`{{${key}}}`]);
            return '';
          }
        }
        return v == null ? '' : String(v);
      });
    } catch (e) {
      // fallback: return raw template
    }
    return out;
  }

  // Execute a node (synchronous). For AI nodes, we simulate by compiling the template.
  // node: { id, type, template }
  runNode(node) {
    const n = node || {};
    const compiled = this.compileTemplate(n.template || '', this.variables);
    let response = compiled;
    let scoreDelta = 0;
    if (n.score) {
      const v = Number(n.score) || 0;
      scoreDelta = v;
      this.score += scoreDelta;
      this.emit('score', { delta: scoreDelta, total: this.score });
    }

    const result = {
      nodeId: n.id || null,
      response,
      variables: this.getVariables(),
      scoreDelta,
      totalScore: this.score,
    };

    this.emit('run', result);
    return result;
  }

  // Run a sequence of nodes by id list
  runSequence(nodeIds = []) {
    const out = [];
    for (const id of nodeIds) {
      const node = this.nodes.find(n => n.id === id);
      if (!node) continue;
      out.push(this.runNode(node));
    }
    return out;
  }
}
