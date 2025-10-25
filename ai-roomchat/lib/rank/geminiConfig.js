export const DEFAULT_GEMINI_MODE = 'v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export const GEMINI_MODE_OPTIONS = [
  { value: 'v1beta', label: '베타 (v1beta)' },
  { value: 'v1', label: '안정판 (v1)' },
];

const FALLBACK_MODEL_CATALOG = {
  v1beta: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Experimental' },
    { id: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash Latest' },
    { id: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro Latest' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
    { id: 'gemini-1.0-pro-001', label: 'Gemini 1.0 Pro (001)' },
  ],
  v1: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.0-pro-001', label: 'Gemini 1.0 Pro (001)' },
  ],
};

export function normalizeGeminiMode(value) {
  if (value === 'v1') return 'v1';
  return 'v1beta';
}

export function normalizeGeminiModelId(value) {
  if (typeof value !== 'string') return '';
  let trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    trimmed = parts[parts.length - 1] || trimmed;
  }
  if (trimmed.endsWith(':generateContent')) {
    trimmed = trimmed.slice(0, trimmed.indexOf(':generateContent'));
  }
  return trimmed;
}

export function getFallbackGeminiModels(mode) {
  const normalized = normalizeGeminiMode(mode);
  return FALLBACK_MODEL_CATALOG[normalized] || [];
}

export function ensureModelInCatalog(mode, model) {
  const normalizedMode = normalizeGeminiMode(mode);
  const normalizedModel = normalizeGeminiModelId(model);
  if (!normalizedModel) {
    return getFallbackGeminiModels(normalizedMode);
  }
  const base = getFallbackGeminiModels(normalizedMode);
  const exists = base.some(entry => entry.id === normalizedModel);
  if (exists) {
    return base;
  }
  return [{ id: normalizedModel, label: normalizedModel }, ...base];
}

function appendIfNew(list, value) {
  const normalized = normalizeGeminiModelId(value);
  if (!normalized) return;
  if (list.includes(normalized)) return;
  list.push(normalized);
}

function expandStableVariant(id) {
  if (!id) return [];
  const variants = [];
  if (id.endsWith('-latest')) {
    const base = id.replace(/-latest$/, '');
    appendIfNew(variants, base);
    appendIfNew(variants, `${base}-001`);
  }
  if (id.endsWith('-001')) {
    appendIfNew(variants, id.replace(/-001$/, ''));
  }
  return variants;
}

export function buildGeminiModelCandidates(mode, model) {
  const normalizedMode = normalizeGeminiMode(mode);
  const seeds = [];
  appendIfNew(seeds, model);
  getFallbackGeminiModels(normalizedMode).forEach(entry => {
    appendIfNew(seeds, entry?.id);
  });
  if (!seeds.length) {
    appendIfNew(seeds, DEFAULT_GEMINI_MODEL);
  }

  const candidates = [];
  seeds.forEach(seed => {
    appendIfNew(candidates, seed);
    if (normalizedMode === 'v1') {
      expandStableVariant(seed).forEach(variant => appendIfNew(candidates, variant));
    } else {
      // v1beta 모델도 latest/001 변형을 허용하되, base 모델을 함께 시도해 호환성을 높인다.
      if (seed.endsWith('-latest')) {
        appendIfNew(candidates, seed.replace(/-latest$/, '-001'));
        appendIfNew(candidates, seed.replace(/-latest$/, ''));
      }
      if (seed.endsWith('-001')) {
        appendIfNew(candidates, seed.replace(/-001$/, ''));
      }
    }
  });

  return candidates;
}

export function formatGeminiOptionLabel(entry) {
  if (!entry) return '';
  const id = normalizeGeminiModelId(entry.id || entry.name);
  const display = typeof entry.label === 'string' ? entry.label.trim() : '';
  if (display && display.toLowerCase() !== id.toLowerCase()) {
    return `${display} (${id})`;
  }
  if (display) {
    return display;
  }
  return id;
}
