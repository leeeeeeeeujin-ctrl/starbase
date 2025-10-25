// Small pure helpers used by useAdvanceTurn to keep the main hook focused.
/**
 * Build effective prompts for user-action slots when not realtime.
 */
function buildEffectivePrompts({ realtimeEnabled, isUserAction, systemPrompt, buildUserActionPersona, actorContext, promptText }) {
  let effectiveSystemPrompt = systemPrompt;
  let effectivePrompt = promptText;

  if (!realtimeEnabled && isUserAction) {
    const persona = typeof buildUserActionPersona === 'function' ? buildUserActionPersona(actorContext) : { system: '', prompt: '' };
    effectiveSystemPrompt = [systemPrompt, persona.system].filter(Boolean).join('\n\n');
    effectivePrompt = persona.prompt ? `${persona.prompt}\n\n${promptText}` : promptText;
  }

  return { effectiveSystemPrompt, effectivePrompt };
}

/**
 * Compute audience payloads used when creating prompt/response history entries.
 */
function computeAudiencePayloads(slotBinding) {
  const slotIndex = slotBinding?.slotIndex;
  const promptAudiencePayload = slotBinding?.promptAudience?.audience === 'slots' ? { audience: 'slots', slots: slotBinding.visibleSlots } : { audience: 'all' };
  const responseAudiencePayload = slotBinding?.responseAudience?.audience === 'slots' ? { audience: 'slots', slots: slotBinding.visibleSlots } : { audience: 'all' };
  const responseIsPublic = !slotBinding?.hasLimitedAudience;
  const promptVisibility = slotBinding?.hasLimitedAudience ? 'private' : 'hidden';
  const responseVisibility = responseIsPublic ? 'public' : 'private';

  return {
    slotIndex,
    promptAudiencePayload,
    responseAudiencePayload,
    responseIsPublic,
    promptVisibility,
    responseVisibility,
  };
}

/**
 * Create history entries for a prompt and its response.
 */
function createHistoryEntries({ history, effectivePrompt, promptAudiencePayload, responseAudiencePayload, historyRole, responseText, slotIndex }) {
  const promptEntry = history.push({
    role: 'system',
    content: `[PROMPT]\n${effectivePrompt}`,
    public: false,
    includeInAi: true,
    ...promptAudiencePayload,
    meta: { slotIndex },
  });

  // response visibility: default to public unless audience is explicitly 'slots'
  const responseIsPublic = !responseAudiencePayload || responseAudiencePayload.audience !== 'slots';
  const responseEntry = history.push({
    role: historyRole,
    content: responseText,
    public: responseIsPublic,
    includeInAi: true,
    ...responseAudiencePayload,
    meta: { slotIndex },
  });

  return { promptEntry, responseEntry };
}

/**
 * Extract promptText and mark visited slots when available.
 */
function processCompiledPrompt({ compiled, visitedSlotIds }) {
  const promptText = compiled && typeof compiled.text === 'string' ? compiled.text : '';

  try {
    if (compiled && compiled.pickedSlot != null && visitedSlotIds && visitedSlotIds.current && typeof visitedSlotIds.current.add === 'function') {
      visitedSlotIds.current.add(String(compiled.pickedSlot));
    }
  } catch (e) {
    // swallow any errors to keep this helper safe in tests
  }

  return { promptText };
}

function computeFallbackActorNames(actorContext) {
  const fallbackActorNames = [];
  try {
    if (actorContext?.participant?.hero?.name) {
      fallbackActorNames.push(actorContext.participant.hero.name);
    } else if (actorContext?.heroSlot?.name) {
      fallbackActorNames.push(actorContext.heroSlot.name);
    }
  } catch (e) {
    // safe no-op
  }
  return fallbackActorNames;
}

module.exports = { buildEffectivePrompts, computeAudiencePayloads, createHistoryEntries, processCompiledPrompt, computeFallbackActorNames };
