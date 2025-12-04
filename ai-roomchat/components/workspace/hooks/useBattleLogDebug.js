import { useMemo } from 'react';
import { buildLogFromRuntime, normalizeBattleOutcome } from '../../../lib/runtime/battleLogHelpers';

/**
 * Hook to derive a normalized battle log + highlights for debug UI.
 * Expects runtime turn log + participants + optional battle end result.
 */
export function useBattleLogDebug({ events, participants, outcome, scoreboard, meta } = {}) {
  const log = useMemo(() => {
    return buildLogFromRuntime({
      events: Array.isArray(events) ? events : [],
      participants: participants || {},
      outcome: normalizeBattleOutcome(outcome || {}),
      scoreboard: scoreboard || null,
      meta: meta || {},
    });
  }, [events, participants, outcome, scoreboard, meta]);

  const highlightEvents = useMemo(() => {
    const ids = new Set(log.highlightIds || []);
    return (log.events || []).filter((ev) => ids.has(ev.id));
  }, [log]);

  return { log, highlightEvents };
}
