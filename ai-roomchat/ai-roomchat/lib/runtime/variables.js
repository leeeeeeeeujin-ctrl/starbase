// Runtime variables loader/saver for workspace VFS-backed files
// Path: /game/state/variables.json

export const VARS_PATH = '/game/state/variables.json';

export function loadVariablesFromFiles(files) {
  try {
    const meta = files && files[VARS_PATH];
    if (!meta || typeof meta.content !== 'string') return {};
    const obj = JSON.parse(meta.content || '{}');
    return (obj && typeof obj === 'object') ? obj : {};
  } catch {
    return {};
  }
}

export function saveVariablesToFiles(files, variables) {
  try {
    if (!files) return;
    const content = JSON.stringify(variables || {}, null, 2) + "\n";
    files[VARS_PATH] = { ...(files[VARS_PATH] || {}), content, readonly: false };
  } catch {}
}

export function mergeVariables(base, patch) {
  try {
    const out = { ...(base || {}) };
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = mergeVariables(out[k] || {}, v);
      } else {
        out[k] = v;
      }
    });
    return out;
  } catch {
    return { ...(base || {}) };
  }
}

