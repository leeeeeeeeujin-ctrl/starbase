import { buildBattleLog, normalizeEvent, selectHighlights } from './battleLogSchema';

// Normalize turn log + participants into a battle log object.
export function buildLogFromRuntime({
  events = [],
  participants = {},
  outcome = null,
  scoreboard = null,
  highlightRule = { types: ['score_change', 'judge', 'summary'], visibility: 'public' },
  meta = {},
} = {}) {
  const normalized = events.map(normalizeEvent);
  const highlights = selectHighlights(normalized, highlightRule).map((ev) => ev.id);
  return buildBattleLog({
    events: normalized,
    participants,
    outcome,
    scoreboard,
    highlightIds: highlights,
    meta,
  });
}

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
