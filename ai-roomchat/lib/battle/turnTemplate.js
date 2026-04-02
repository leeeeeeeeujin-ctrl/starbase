export const TURN_META_VERSION = 1;
export const TURN_INPUT_MODES = ['none', 'text', 'choice', 'ability', 'target'];
export const TURN_EXECUTION_TYPES = ['ai_prompt', 'user_response'];
export const TURN_STATE_WRITE_SOURCES = [
  'always',
  'input',
  'gameResult',
  'teamOutcome',
  'participantOutcome',
];

function normalizeStateWriteRule(rule, index = 0) {
  const source = rule && typeof rule === 'object' ? rule : {};
  const sourceType = TURN_STATE_WRITE_SOURCES.includes(source.sourceType)
    ? source.sourceType
    : 'always';
  const key = String(source.key || '').trim();
  if (!key) return null;

  return {
    id: String(source.id || `state-write-${index + 1}`).trim(),
    sourceType,
    sourceKey: String(source.sourceKey || '').trim(),
    equals: String(source.equals ?? '').trim(),
    value: String(source.value ?? '').trim(),
  };
}

export function getDefaultTurnMeta(slotType = 'ai') {
  const common = {
    version: TURN_META_VERSION,
    title: '',
    display: '',
    executionType: 'ai_prompt',
    actorScope: 'self',
    inputMode: 'none',
    inputLabel: '',
    inputPlaceholder: '',
    choiceGenerationPrompt: '',
    choiceCount: 3,
    resultKey: '',
    outputFormat: 'json',
    outputSchema: '',
    participantScope: [],
    visibilityScope: ['all'],
    stateWrites: [],
  };

  if (slotType === 'user_action') {
    return {
      ...common,
      title: '유저 응답',
      executionType: 'user_response',
      inputMode: 'text',
      outputFormat: 'text',
    };
  }

  if (slotType === 'system') {
    return {
      ...common,
      title: 'AI 실행',
    };
  }

  return {
    ...common,
    title: 'AI 실행',
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
  const executionType = TURN_EXECUTION_TYPES.includes(source.executionType)
    ? source.executionType
    : base.executionType;
  const stateWrites = Array.isArray(source.stateWrites)
    ? source.stateWrites
        .map((rule, index) => normalizeStateWriteRule(rule, index))
        .filter(Boolean)
    : [];

  return {
    ...base,
    ...source,
    version: TURN_META_VERSION,
    title: String(source.title ?? base.title),
    display: String(source.display ?? ''),
    executionType,
    actorScope: String(source.actorScope ?? base.actorScope).trim() || base.actorScope,
    inputMode,
    inputLabel: String(source.inputLabel ?? ''),
    inputPlaceholder: String(source.inputPlaceholder ?? ''),
    choiceGenerationPrompt: String(source.choiceGenerationPrompt ?? ''),
    choiceCount: Number.isFinite(Number(source.choiceCount))
      ? Math.max(1, Math.min(8, Number(source.choiceCount)))
      : base.choiceCount,
    resultKey: String(source.resultKey ?? ''),
    outputFormat: String(source.outputFormat ?? base.outputFormat).trim() || base.outputFormat,
    outputSchema: String(source.outputSchema ?? ''),
    participantScope,
    visibilityScope,
    stateWrites,
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
