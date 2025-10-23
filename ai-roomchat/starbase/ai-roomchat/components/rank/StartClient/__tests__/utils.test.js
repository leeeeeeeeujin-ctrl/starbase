import {
  toInt,
  toTrimmed,
  toTrimmedString,
  sanitizeDropInArrivals,
  stripOutcomeFooter,
  parseSlotIndex,
  normalizeSlotLayoutEntries,
  mergeSlotLayoutSeed,
  buildParticipantsFromRoster,
} from '../utils';

describe('StartClient utils', () => {
  test('toInt parses numbers and respects min', () => {
    expect(toInt('10')).toBe(10);
    expect(toInt(5.9)).toBe(5);
    expect(toInt('x')).toBeNull();
    expect(toInt(-1, { min: 0 })).toBeNull();
  });

  test('toTrimmed / toTrimmedString behave as expected', () => {
    expect(toTrimmed('  foo ')).toBe('foo');
    expect(toTrimmed('   ')).toBeNull();
    expect(toTrimmed(null)).toBeNull();

    expect(toTrimmedString('  bar ')).toBe('bar');
    expect(toTrimmedString('')).toBeNull();
    expect(toTrimmedString(undefined)).toBeNull();
  });

  test('sanitizeDropInArrivals normalizes simple arrivals', () => {
    const input = [
      {
        ownerId: ' owner1 ',
        role: 'leader',
        heroName: 'Hero A',
        slotIndex: '2',
        timestamp: '160',
        stats: { queueDepth: '3', replacements: 1, arrivalOrder: '1' },
      },
    ];
    const out = sanitizeDropInArrivals(input);
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].ownerId).toBe('owner1');
    expect(out[0].slotIndex).toBe(2);
    expect(out[0].queueDepth).toBe(3);
  });

  test('stripOutcomeFooter separates body and footer', () => {
    const text = 'line1\nline2\n\nfooter1\nfooter2\n';
    const { body, footer } = stripOutcomeFooter(text);
    expect(body).toContain('line1');
    expect(footer.length).toBeGreaterThan(0);
  });

  test('parseSlotIndex and normalizeSlotLayoutEntries', () => {
    expect(parseSlotIndex('3')).toBe(3);
    expect(parseSlotIndex(-1, 0)).toBe(0);

    const list = [
      { slotIndex: '1', heroId: 'h1', ownerId: 'o1' },
      { slot_index: 2, heroId: 'h2', ownerId: 'o2' },
    ];
    const normalized = normalizeSlotLayoutEntries(list);
    expect(normalized.length).toBe(2);
    expect(normalized[0].slot_index).toBe(1);
  });

  test('mergeSlotLayoutSeed merges primary with fallback', () => {
    const primary = [{ slot_index: 1, id: 'p1' }];
    const fallback = [
      { slot_index: 1, id: 'f1', hero_id: 'hf' },
      { slot_index: 2, id: 'f2' },
    ];
    const merged = mergeSlotLayoutSeed(primary, fallback);
    // mergeSlotLayoutSeed prefers fallbackEntry fields for id when present
    expect(merged.find(e => e.slot_index === 1).id).toBe('f1');
    expect(merged.find(e => e.slot_index === 2).id).toBe('f2');
  });

  test('buildParticipantsFromRoster builds participant objects', () => {
    const roster = [
      { ownerId: 'o1', heroId: 'h1', slotIndex: 0, joinedAt: 123, ready: true },
      null,
    ];
    const parts = buildParticipantsFromRoster(roster);
    expect(parts.length).toBe(1);
    expect(parts[0].owner_id).toBe('o1');
    expect(parts[0].hero_id).toBe('h1');
  });
});
