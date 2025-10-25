import {
  shouldDeferRoomCleanup,
  normalizeRoomStatus,
  slotHasOccupancy,
  slotHasReadyFlag,
} from '@/lib/rank/roomCleanupGuards';

describe('roomCleanupGuards', () => {
  test('normalizeRoomStatus handles nullish values', () => {
    expect(normalizeRoomStatus(null)).toBe('');
    expect(normalizeRoomStatus(undefined)).toBe('');
    expect(normalizeRoomStatus('  In_Progress  ')).toBe('in_progress');
  });

  test('slotHasOccupancy detects occupant owner id variations', () => {
    expect(slotHasOccupancy({ occupantOwnerId: 'user-1' })).toBe(true);
    expect(slotHasOccupancy({ occupant_owner_id: 'user-2' })).toBe(true);
    expect(slotHasOccupancy({ standin: true })).toBe(true);
    expect(slotHasOccupancy({ standinPlaceholder: true })).toBe(true);
    expect(slotHasOccupancy({ matchSource: 'async_standin' })).toBe(true);
    expect(slotHasOccupancy({})).toBe(false);
  });

  test('slotHasReadyFlag recognises ready markers', () => {
    expect(slotHasReadyFlag({ occupantReady: true })).toBe(true);
    expect(slotHasReadyFlag({ occupant_ready: true })).toBe(true);
    expect(slotHasReadyFlag({ occupantReady: false })).toBe(false);
  });

  test('shouldDeferRoomCleanup returns false when not host', () => {
    expect(
      shouldDeferRoomCleanup({
        room: { id: 'room-1', status: 'open' },
        slots: [],
        isHost: false,
      })
    ).toBe(false);
  });

  test('shouldDeferRoomCleanup defers when status is active', () => {
    expect(
      shouldDeferRoomCleanup({
        room: { id: 'room-1', status: 'IN_PROGRESS' },
        slots: [],
        isHost: true,
      })
    ).toBe(true);
  });

  test('shouldDeferRoomCleanup defers when any slot occupied', () => {
    expect(
      shouldDeferRoomCleanup({
        room: { id: 'room-1', status: 'open' },
        slots: [{ occupantOwnerId: 'user-1' }],
        isHost: true,
      })
    ).toBe(true);
  });

  test('shouldDeferRoomCleanup defers when any slot ready', () => {
    expect(
      shouldDeferRoomCleanup({
        room: { id: 'room-1', status: 'open' },
        slots: [{ occupantReady: true }],
        isHost: true,
      })
    ).toBe(true);
  });

  test('shouldDeferRoomCleanup allows cleanup for empty open room', () => {
    expect(
      shouldDeferRoomCleanup({
        room: { id: 'room-1', status: 'open' },
        slots: [],
        isHost: true,
      })
    ).toBe(false);
  });
});
