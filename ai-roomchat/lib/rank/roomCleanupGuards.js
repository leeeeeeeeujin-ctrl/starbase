export const ACTIVE_ROOM_STATUSES = Object.freeze([
  'in_progress',
  'battle',
  'brawl',
  'countdown',
  'preparing',
  'ready',
  'match',
  'running',
  'active',
  'scoring',
  'postgame',
]);

export function normalizeRoomStatus(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim().toLowerCase();
  return text;
}

export function slotHasOccupancy(slot) {
  if (!slot || typeof slot !== 'object') return false;
  if (slot.occupantOwnerId || slot.occupant_owner_id) return true;
  if (slot.placeholderOwnerId || slot.placeholder_owner_id) return true;
  if (
    slot.standin === true ||
    slot.standinPlaceholder === true ||
    slot.standin_placeholder === true
  ) {
    return true;
  }
  const source = typeof slot.matchSource === 'string' ? slot.matchSource : slot.match_source;
  if (source && source.trim().toLowerCase() === 'async_standin') {
    return true;
  }
  return false;
}

export function slotHasReadyFlag(slot) {
  if (!slot || typeof slot !== 'object') return false;
  if (slot.occupantReady === true || slot.occupant_ready === true) return true;
  return false;
}

export function shouldDeferRoomCleanup({ room, slots, isHost }) {
  if (!isHost) return false;
  if (!room || typeof room !== 'object' || !room.id) return false;

  const status = normalizeRoomStatus(room.status);
  if (status && ACTIVE_ROOM_STATUSES.includes(status)) {
    return true;
  }

  if (Array.isArray(slots)) {
    if (slots.some(slot => slotHasOccupancy(slot))) {
      return true;
    }
    if (slots.some(slot => slotHasReadyFlag(slot))) {
      return true;
    }
  }

  return false;
}
