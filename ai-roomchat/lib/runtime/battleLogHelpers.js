import { buildBattleLog, normalizeEvent, selectHighlights } from './battleLogSchema';

// Simple onBattleEnd contract validator for hooks.
export function normalizeBattleOutcome(raw = {}) {
  const winners = Array.isArray(raw.winners) ? raw.winners : [];
  const losers = Array.isArray(raw.losers) ? raw.losers : [];
  const draw = !!raw.draw;
  const scores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
  const highlightIds = Array.isArray(raw.highlightIds) ? raw.highlightIds : [];
  const templateId = typeof raw.templateId === 'string' ? raw.templateId : null;
  const templateVars =
    raw.templateVars && typeof raw.templateVars === 'object' ? raw.templateVars : null;
  return { winners, losers, draw, scores, highlightIds, templateId, templateVars };
}

// Normalize turn log + participants into a battle log object.
export function buildLogFromRuntime({
  events = [],
  participants = {},
  outcome = null,
  scoreboard = null,
  highlightRule = { types: ['score_change', 'judge', 'summary'], visibility: 'public' },
  meta = {},
} = {}) {
  const normalizedEvents = events.map(normalizeEvent);
  const normalizedOutcome = outcome ? normalizeBattleOutcome(outcome) : normalizeBattleOutcome({});
  const hasHighlightFromOutcome =
    Array.isArray(normalizedOutcome.highlightIds) && normalizedOutcome.highlightIds.length > 0;
  const highlights = hasHighlightFromOutcome
    ? normalizedOutcome.highlightIds
    : selectHighlights(normalizedEvents, highlightRule).map((ev) => ev.id);

  // Prefer explicit scoreboard argument, then scores from outcome.
  const mergedScoreboard =
    scoreboard && typeof scoreboard === 'object' && Object.keys(scoreboard).length
      ? scoreboard
      : Object.keys(normalizedOutcome.scores || {}).length
        ? normalizedOutcome.scores
        : null;

  // Surface template info on meta so score scripts / viewers can consume it easily.
  const mergedMeta = { ...(meta || {}) };
  if (normalizedOutcome.templateId && mergedMeta.templateId == null) {
    mergedMeta.templateId = normalizedOutcome.templateId;
  }
  if (normalizedOutcome.templateVars && mergedMeta.templateVars == null) {
    mergedMeta.templateVars = normalizedOutcome.templateVars;
  }

  return buildBattleLog({
    events: normalizedEvents,
    participants,
    outcome: normalizedOutcome,
    scoreboard: mergedScoreboard,
    highlightIds: highlights,
    meta: mergedMeta,
  });
}
