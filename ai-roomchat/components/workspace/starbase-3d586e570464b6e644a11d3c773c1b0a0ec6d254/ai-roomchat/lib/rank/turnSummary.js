import { parseOutcome } from '@/lib/promptEngine/outcome';

function trimToString(value) {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.trim();
}

function sanitizeArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  value.forEach(item => {
    const trimmed = trimToString(item);
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    result.push(trimmed);
  });
  return result;
}

function pickPreview(text, limit = 240) {
  const trimmed = trimToString(text);
  if (!trimmed) return '';
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1)}…`;
}

export function normalizeTurnSummaryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const preview = trimToString(payload.preview);
  const promptPreview = trimToString(payload.promptPreview);
  const role = trimToString(payload.role);
  const actors = sanitizeArray(payload.actors);

  let outcomeLine = '';
  const outcome = payload.outcome && typeof payload.outcome === 'object' ? payload.outcome : null;
  if (outcome?.lastLine) {
    outcomeLine = trimToString(outcome.lastLine);
  }

  const tagValues = [...sanitizeArray(payload.tags), ...sanitizeArray(outcome?.variables)];

  if (payload.extra && typeof payload.extra === 'object') {
    tagValues.push(...sanitizeArray(payload.extra.tags));
    tagValues.push(...sanitizeArray(payload.extra.labels));
  }

  if (!preview && !promptPreview && !role && !actors.length && !outcomeLine && !tagValues.length) {
    return null;
  }

  const tags = Array.from(new Map(tagValues.map(tag => [tag.toLowerCase(), tag])).values());

  return {
    preview,
    promptPreview,
    role,
    actors,
    outcomeLine,
    tags,
  };
}

export function buildTurnSummaryPayload({
  role,
  content,
  prompt,
  session,
  idx,
  actors,
  extra,
} = {}) {
  const trimmedContent = trimToString(content);
  if (!trimmedContent) {
    return null;
  }

  const payload = {
    role: trimToString(role) || 'narration',
    preview: pickPreview(trimmedContent),
  };

  const trimmedPrompt = trimToString(prompt);
  if (trimmedPrompt) {
    payload.promptPreview = pickPreview(trimmedPrompt);
  }

  if (session && typeof session === 'object') {
    const sessionId = trimToString(session.id);
    const sessionTurn = Number(session.turn);
    if (sessionId) {
      payload.session = { id: sessionId };
    }
    if (Number.isFinite(sessionTurn)) {
      payload.session = payload.session || {};
      payload.session.turn = sessionTurn;
    }
  }

  if (Number.isFinite(idx)) {
    payload.index = idx;
  }

  const normalizedActors = sanitizeArray(actors);
  if (normalizedActors.length) {
    payload.actors = normalizedActors;
  }

  if (payload.role !== 'system') {
    const outcome = parseOutcome(trimmedContent);
    if (outcome) {
      const { lastLine, variables, actors: outcomeActors } = outcome;
      const normalizedVariables = sanitizeArray(variables);
      const normalizedOutcomeActors = sanitizeArray(outcomeActors);
      payload.outcome = {};
      if (lastLine) {
        payload.outcome.lastLine = lastLine;
      }
      if (normalizedVariables.length) {
        payload.outcome.variables = normalizedVariables;
      }
      if (normalizedOutcomeActors.length) {
        payload.outcome.actors = normalizedOutcomeActors;
      }
      if (!Object.keys(payload.outcome).length) {
        delete payload.outcome;
      }
    }
  }

  if (extra && typeof extra === 'object') {
    payload.extra = extra;
  }

  return payload;
}
