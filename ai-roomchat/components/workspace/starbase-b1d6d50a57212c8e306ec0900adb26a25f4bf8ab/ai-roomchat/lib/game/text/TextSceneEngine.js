// Minimal text/choice scene engine suitable for session-scoped narrative games.

// Scene graph format example:
// {
//   start: "intro",
//   nodes: {
//     intro: { text: "Hello {{name}}", choices: [ { label: "Go", to: "room" } ] },
//     room: { text: "A dark room.", choices: [ { label: "Light", to: "lit", effects: [{ set: ["hasLight", true] }] } ] },
//     lit: { text: "You see a key.", choices: [] }
//   }
// }

export function createTextEngine(script, initialVars = {}) {
  let currentId = script?.start || null;
  const nodes = script?.nodes || {};
  const vars = { ...initialVars };
  const subs = new Set();

  function interpolate(text) {
    return String(text || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
      return String(k.split('.').reduce((a, b) => (a ? a[b] : ''), vars) ?? "");
    });
  }

  function applyEffects(effects = []) {
    for (const eff of effects) {
      if (eff && Array.isArray(eff.set) && eff.set.length === 2) {
        const [key, val] = eff.set;
        vars[key] = val;
      }
    }
  }

  function current() {
    const raw = nodes[currentId] || { text: "", choices: [] };
    return {
      id: currentId,
      text: interpolate(raw.text),
      choices: (raw.choices || []).filter(ch => !ch.when || !!vars[ch.when]).map((ch, i) => ({ ...ch, id: ch.id || `${currentId}:${i}` })),
      vars: { ...vars },
    };
  }

  function choose(choiceId) {
    const node = nodes[currentId];
    if (!node) return current();
    const ch = (node.choices || []).find(c => (c.id || "") === choiceId || c.label === choiceId || c.to === choiceId);
    if (!ch) return current();
    applyEffects(ch.effects);
    currentId = ch.to || currentId;
    const cur = current();
    subs.forEach(fn => fn(cur));
    return cur;
  }

  function goto(id) {
    if (nodes[id]) currentId = id;
    const cur = current();
    subs.forEach(fn => fn(cur));
    return cur;
  }

  return {
    current,
    choose,
    goto,
    setVar(k, v) { vars[k] = v; const cur = current(); subs.forEach(fn => fn(cur)); return cur; },
    get vars() { return { ...vars }; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

