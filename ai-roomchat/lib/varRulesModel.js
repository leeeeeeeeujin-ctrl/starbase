// lib/varRulesModel.js

export function sanitizeVarRules(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(x => ({
    name: typeof x?.name === 'string' ? x.name : '',
    condition: typeof x?.condition === 'string' ? x.condition : '',
  }));
}

export function isSameVarRules(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.name !== b[i]?.name) return false;
    if (a[i]?.condition !== b[i]?.condition) return false;
  }
  return true;
}
