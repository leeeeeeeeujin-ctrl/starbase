// components/rank/StartClient/utils.js
// Small helper to build participants from a roster snapshot. Extracted from
// engine/loadGameBundle.js to satisfy imports when the roster is provided
// directly to the StartClient hooks.

function toTrimmedString(value) {
  if (value === undefined || value === null) return '';
  const trimmed = String(value).trim();
  return trimmed;
}

function parseSlotIndex(value, fallbackIndex = null) {
  if (value === undefined || value === null) {
    return fallbackIndex;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return fallbackIndex;
}

export function buildParticipantsFromRoster(roster = []) {
  if (!Array.isArray(roster) || roster.length === 0) return [];

  return roster
    .map((entry, index) => {
      if (!entry) return null;

      const ownerId = toTrimmedString(entry.ownerId);
      const heroId = toTrimmedString(entry.heroId);

      if (!ownerId || !heroId) return null;

      const slotIndex = parseSlotIndex(entry.slotIndex, index);
      const heroName =
        typeof entry.heroName === 'string' && entry.heroName.trim() ? entry.heroName.trim() : '';

      return {
        id: `roster-${slotIndex != null ? slotIndex : index}-${ownerId}`,
        owner_id: ownerId,
        ownerId,
        role: typeof entry.role === 'string' && entry.role.trim() ? entry.role.trim() : '',
        status: entry.ready ? 'ready' : 'alive',
        slot_no: slotIndex,
        slotIndex,
        slot_index: slotIndex,
        score: 0,
        rating: 0,
        battles: 0,
        win_rate: null,
        hero_id: heroId,
        match_source: 'room_roster',
        standin: false,
        heroes: {
          id: heroId,
          name: heroName || (heroId ? `캐릭터 #${heroId}` : '알 수 없는 영웅'),
          description: '',
          image_url: '',
          background_url: '',
          bgm_url: '',
          bgm_duration_seconds: null,
          ability1: '',
          ability2: '',
          ability3: '',
          ability4: '',
        },
        joined_at: entry.joinedAt || null,
        ready: !!entry.ready,
      };
    })
    .filter(Boolean);
}
