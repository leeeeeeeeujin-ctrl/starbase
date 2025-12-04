// Helpers for standardised battle/turn logs.
// Goal: keep the event shape consistent across Play, main game, and settlement.

export const BATTLE_EVENT_TYPES = [
  'system',
  'ai_action',
  'user_action',
  'judge',
  'state_change',
  'score_change',
  'effect',
  'dialogue',
  'summary',
];

function safeId(prefix = 'ev') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function isString(x) {
  return typeof x === 'string' && x.length > 0;
}

export function normalizeSpeaker(raw = {}) {
  const out = {};
  if (isString(raw.slotId)) out.slotId = raw.slotId;
  if (isString(raw.ownerId)) out.ownerId = raw.ownerId;
  if (isString(raw.name)) out.name = raw.name;
  if (isString(raw.role)) out.role = raw.role;
  if (isString(raw.team)) out.team = raw.team;
  return out;
}

export function normalizeEvent(ev = {}) {
  const type = isString(ev.type) && BATTLE_EVENT_TYPES.includes(ev.type) ? ev.type : 'system';
  const speaker = normalizeSpeaker(ev.speaker);
  const common = {
    id: isString(ev.id) ? ev.id : safeId(type),
    type,
    turn: typeof ev.turn === 'number' ? ev.turn : null,
    timestamp: ev.timestamp || Date.now(),
    speaker,
    visibility: ev.visibility || 'public',
    summary: ev.summary || '',
    variables: ev.variables || null,
    attachments: Array.isArray(ev.attachments) ? ev.attachments : undefined,
  };
  // Keep original type-specific payload as-is; caller is responsible for schema correctness.
  return { ...common, ...ev };
}

/**
 * Build a normalised battle log object.
 * @param {Object} opts
 * @param {Array} opts.events - raw events
 * @param {Object} opts.participants - slotId -> participant info
 * @param {Object} opts.outcome - { winners:[], losers:[], draw? }
 * @param {Object} opts.scoreboard - { slotId: { score, delta? } }
 * @param {Array<string>} opts.highlightIds - subset of event ids
 * @param {Object} opts.meta - hashes/etag/etc.
 */
export function buildBattleLog({
  events = [],
  participants = {},
  outcome = null,
  scoreboard = null,
  highlightIds = [],
  meta = {},
} = {}) {
  const normalizedEvents = events.map(normalizeEvent);
  return {
    participants,
    events: normalizedEvents,
    outcome,
    scoreboard,
    highlightIds: Array.isArray(highlightIds) ? highlightIds : [],
    meta,
  };
}

/**
 * Select highlight events by simple rules (type/tags/visibility).
 * @param {Array} events - normalised or raw events
 * @param {Object} opts
 * @param {Array<string>} opts.types - allowed types
 * @param {Array<string>} opts.tags - match any tag in ev.tags
 * @param {string} opts.visibility - required visibility (e.g. 'public')
 */
export function selectHighlights(events = [], { types, tags, visibility } = {}) {
  const typeSet = Array.isArray(types) && types.length ? new Set(types) : null;
  const tagSet = Array.isArray(tags) && tags.length ? new Set(tags) : null;
  const out = [];
  for (const evRaw of events) {
    const ev = normalizeEvent(evRaw);
    if (visibility && ev.visibility !== visibility) continue;
    if (typeSet && !typeSet.has(ev.type)) continue;
    if (tagSet) {
      const evTags = Array.isArray(ev.tags) ? ev.tags : [];
      if (!evTags.some((t) => tagSet.has(t))) continue;
    }
    out.push(ev);
  }
  return out;
}
