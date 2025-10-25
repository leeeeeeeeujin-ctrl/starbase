/**
 * @jest-environment jsdom
 */

import { describe, it, expect } from '@jest/globals';

const utils = require('../../../../../components/rank/StartClient/hooks/useAdvanceTurnUtils');

describe('useAdvanceTurnUtils', () => {
  it('processCompiledPrompt returns text and marks visited slot', () => {
    const visited = { current: new Set() };
    const compiled = { text: 'hello', pickedSlot: 'slot-1' };
    const res = utils.processCompiledPrompt({ compiled, visitedSlotIds: visited });
    expect(res.promptText).toBe('hello');
    expect(visited.current.has('slot-1')).toBe(true);
  });

  it('buildEffectivePrompts respects persona for user action', () => {
    const persona = () => ({ system: 'SYS', prompt: 'PROMPT' });
    const r = utils.buildEffectivePrompts({ realtimeEnabled: false, isUserAction: true, systemPrompt: 'BASE', buildUserActionPersona: persona, actorContext: {}, promptText: 'X' });
    expect(r.effectiveSystemPrompt).toContain('SYS');
    expect(r.effectivePrompt).toContain('PROMPT');
  });

  it('computeAudiencePayloads returns expected fields', () => {
    const slotBinding = { slotIndex: 2, promptAudience: { audience: 'slots' }, responseAudience: { audience: 'all' }, visibleSlots: [0,1], hasLimitedAudience: false };
    const out = utils.computeAudiencePayloads(slotBinding);
    expect(out.slotIndex).toBe(2);
    expect(out.promptAudiencePayload.audience).toBe('slots');
  });

  it('computeFallbackActorNames returns name when available', () => {
    const actorContext = { participant: { hero: { name: 'HeroName' } } };
    const out = utils.computeFallbackActorNames(actorContext);
    expect(out[0]).toBe('HeroName');
  });
});
