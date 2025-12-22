import { makeNodePrompt } from '@/lib/promptEngine';
import { prepareHistoryPayload } from '@/lib/rank/chatHistory';
import { presummarizeHistory } from '@/lib/client/offload/presummarize';
import { buildUserActionPersona } from '@/lib/rank/userActionPersona';

/**
 * Build effective system prompt, final prompt, and history payload
 * for a single turn, given the current node/slots/history context.
 *
 * This module is intentionally free of React state; callers are
 * responsible for mutating refs (e.g. visitedSlotIds) or dispatching
 * side effects.
 */
export function buildTurnPrompt({
  node,
  slots,
  history,
  aiMemory,
  activeGlobal,
  activeLocal,
  slotBinding,
  systemPrompt,
  actorContext,
  realtimeEnabled,
}) {
  const compiled = makeNodePrompt({
    node,
    slots,
    historyText: history.joinedText({ onlyPublic: false, last: 12 }),
    activeGlobalNames: activeGlobal,
    activeLocalNames: activeLocal,
    currentSlot: slotBinding?.templateSlotRef || null,
  });

  const promptText = compiled.text || '';

  // Pre-summarization to reduce token usage: build compact summary and trim history
  const historyPayloadRaw = prepareHistoryPayload(aiMemory, { limit: 28 });
  const { summaryText: historySummary } = presummarizeHistory(historyPayloadRaw, {
    maxChars: 600,
    maxItems: 20,
  });
  const historyPayload = historySummary
    ? [
        { role: 'system', content: `[CONTEXT SUMMARY]\n${historySummary}` },
        ...historyPayloadRaw.slice(-18),
      ]
    : historyPayloadRaw;

  let effectiveSystemPrompt = systemPrompt;
  let effectivePrompt = promptText;

  const slotTypeValue = node?.slot_type || 'ai';
  const isUserAction = slotTypeValue === 'user_action' || slotTypeValue === 'manual';

  if (!realtimeEnabled && isUserAction) {
    const persona = buildUserActionPersona(actorContext);
    effectiveSystemPrompt = [systemPrompt, persona.system].filter(Boolean).join('\n\n');
    effectivePrompt = persona.prompt ? `${persona.prompt}\n\n${promptText}` : promptText;
  }

  const pickedSlotId = compiled.pickedSlot != null ? String(compiled.pickedSlot) : null;

  return {
    promptText,
    historyPayload,
    effectiveSystemPrompt,
    effectivePrompt,
    pickedSlotId,
  };
}
