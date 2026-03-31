export const TURN_META_VERSION = 1;
export const TURN_INPUT_MODES = ['none', 'text', 'choice', 'ability', 'target'];

export function getDefaultTurnMeta(slotType = 'ai') {
  const common = {
    version: TURN_META_VERSION,
    title: '',
    display: '',
    inputMode: 'none',
    inputLabel: '',
    inputPlaceholder: '',
    resultKey: '',
    participantScope: [],
    visibilityScope: ['all'],
  };

  if (slotType === 'user_action') {
    return {
      ...common,
      title: '유저 입력 턴',
      inputMode: 'text',
    };
  }

  if (slotType === 'system') {
    return {
      ...common,
      title: '시스템 턴',
    };
  }

  return {
    ...common,
    title: 'AI 턴',
  };
}

export function normalizeTurnMeta(rawMeta, slotType = 'ai') {
  const base = getDefaultTurnMeta(slotType);
  const source = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const participantScope = Array.isArray(source.participantScope)
    ? source.participantScope.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const visibilityScope = Array.isArray(source.visibilityScope)
    ? source.visibilityScope.map(value => String(value || '').trim()).filter(Boolean)
    : base.visibilityScope;
  const inputMode = TURN_INPUT_MODES.includes(source.inputMode) ? source.inputMode : base.inputMode;

  return {
    ...base,
    ...source,
    version: TURN_META_VERSION,
    title: String(source.title ?? base.title),
    display: String(source.display ?? ''),
    inputMode,
    inputLabel: String(source.inputLabel ?? ''),
    inputPlaceholder: String(source.inputPlaceholder ?? ''),
    resultKey: String(source.resultKey ?? ''),
    participantScope,
    visibilityScope,
  };
}

export function parseTurnTemplate(rawTemplate = '', slotType = 'ai') {
  const text = typeof rawTemplate === 'string' ? rawTemplate : '';
  const fallback = {
    meta: getDefaultTurnMeta(slotType),
    body: text,
    metaBlock: '',
    hasMeta: false,
  };

  if (!text.startsWith('---\n')) {
    return fallback;
  }

  const closingIndex = text.indexOf('\n---\n', 4);
  if (closingIndex < 0) {
    return fallback;
  }

  const rawMeta = text.slice(4, closingIndex).trim();
  const body = text.slice(closingIndex + 5);

  try {
    return {
      meta: normalizeTurnMeta(JSON.parse(rawMeta), slotType),
      body,
      metaBlock: rawMeta,
      hasMeta: true,
    };
  } catch {
    return {
      ...fallback,
      body: text,
    };
  }
}

export function serializeTurnTemplate(meta, body, slotType = 'ai') {
  const normalizedMeta = normalizeTurnMeta(meta, slotType);
  return `---\n${JSON.stringify(normalizedMeta, null, 2)}\n---\n${body || ''}`;
}

export function createDefaultTurnTemplate(slotType = 'ai') {
  return serializeTurnTemplate(getDefaultTurnMeta(slotType), '', slotType);
}
