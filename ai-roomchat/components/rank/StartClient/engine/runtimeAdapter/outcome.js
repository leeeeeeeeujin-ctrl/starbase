import { parseOutcome } from '@/lib/promptEngine/outcome';

/**
 * Pure outcome processing for a single turn response.
 * Does not touch React state; returns derived values that
 * callers (e.g. useStartClientEngine) can use to update
 * state, logs, and timeline.
 */
function stripOutcomeFooter(text = '') {
  if (!text) return { body: '', footer: [] };
  const working = String(text).split(/\r?\n/);
  const footer = [];
  let captured = 0;
  let index = working.length - 1;

  while (index >= 0 && captured < 3) {
    const candidate = working[index];
    if (!candidate.trim()) {
      working.splice(index, 1);
      index -= 1;
      continue;
    }
    footer.unshift(candidate);
    working.splice(index, 1);
    captured += 1;

    while (index - 1 >= 0 && !working[index - 1].trim()) {
      working.splice(index - 1, 1);
      index -= 1;
    }

    index = working.length - 1;
  }

  while (working.length && !working[working.length - 1].trim()) {
    working.pop();
  }

  return { body: working.join('\n'), footer };
}

export function processTurnOutcome({
  responseText,
  node,
  slotIndex,
  endConditionVariable,
  activeGlobal,
  fallbackActorNames,
  promptText,
  historyRole,
  simulatedLocally,
  localSimResult,
}) {
  const outcome = parseOutcome(responseText);
  const outcomeVariables = Array.isArray(outcome.variables) ? outcome.variables : [];
  const { body: visibleResponse } = stripOutcomeFooter(responseText || '');

  const triggeredEnd = endConditionVariable
    ? outcomeVariables.includes(endConditionVariable)
    : false;

  const resolvedActorNames =
    Array.isArray(outcome.actors) && outcome.actors.length
      ? outcome.actors
      : Array.isArray(fallbackActorNames)
        ? fallbackActorNames
        : [];

  const nextActiveGlobal = Array.from(
    new Set([...(Array.isArray(activeGlobal) ? activeGlobal : []), ...outcomeVariables])
  );

  const fallbackSummary = {
    preview: visibleResponse.slice(0, 240),
    promptPreview: (promptText || '').slice(0, 240),
    outcome: {
      lastLine: outcome.lastLine || undefined,
      variables: outcomeVariables.length ? outcomeVariables : undefined,
      actors: resolvedActorNames.length ? resolvedActorNames : undefined,
    },
    extra: {
      slotIndex,
      nodeId: node?.id ?? null,
      source: 'fallback-log',
      localSim: simulatedLocally ? localSimResult || null : undefined,
    },
  };

  return {
    outcome,
    outcomeVariables,
    visibleResponse,
    triggeredEnd,
    resolvedActorNames,
    nextActiveGlobal,
    fallbackSummary,
  };
}
