// Prompt templating with variable interpolation and per-participant context.

function interpolate(template, vars) {
  return String(template || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = k.split('.').reduce((a, b) => (a ? a[b] : undefined), vars);
    return v == null ? "" : String(v);
  });
}

export function renderPrompt({ template, common = {}, character = {}, session = {}, game = {} }) {
  const vars = { ...common, character, session, game };
  return interpolate(template, vars);
}

export function buildAudience({ all = false, players = [], roles = [], characters = [], slots = [] } = {}) {
  const out = [];
  if (all) out.push("all");
  for (const id of players) out.push(`player:${id}`);
  for (const r of roles) out.push(`role:${r}`);
  for (const c of characters) out.push(`character:${c}`);
  for (const s of slots) out.push(`slot:${s}`);
  return out;
}

export function matchesAudience(audience, viewer = {}) {
  if (!audience || audience.length === 0) return true;
  if (audience.includes("all")) return true;
  const v = new Set([
    viewer.id ? `player:${viewer.id}` : null,
    viewer.role ? `role:${viewer.role}` : null,
    viewer.characterId ? `character:${viewer.characterId}` : null,
    viewer.slotId ? `slot:${viewer.slotId}` : null,
  ].filter(Boolean));
  return audience.some((tag) => v.has(tag));
}

