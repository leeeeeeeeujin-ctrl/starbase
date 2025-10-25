export const ABILITY_KEYS = ['ability1', 'ability2', 'ability3', 'ability4'];

const MODE_LABELS = {
  casual: '캐주얼',
  ranked: '랭크',
  practice: '연습',
};

export function buildAbilityCards(edit) {
  return ABILITY_KEYS.map((key, index) => ({
    key,
    label: `능력 ${index + 1}`,
    value: edit?.[key] || '',
  }));
}

export function buildStatSlides(participations, scoreboards, heroId) {
  if (!Array.isArray(participations) || participations.length === 0) return [];

  return participations.map(row => {
    const board = scoreboards?.[row.game_id] || [];
    const heroIndex = heroId ? board.findIndex(item => item.hero_id === heroId) : -1;
    const slotText = row.slot_no != null ? `슬롯 ${row.slot_no}` : '미배정';
    const rankText = heroIndex >= 0 ? `#${heroIndex + 1}` : '—';
    const sessionValue = row.sessionCount ?? 0;
    const recentText = row.latestSessionAt || '기록 없음';
    const modeKey = typeof row.primaryMode === 'string' ? row.primaryMode.toLowerCase() : '';
    const modeText = MODE_LABELS[modeKey] || row.primaryMode || '기록 없음';

    return {
      key: row.game_id,
      name: row.game?.name || '이름 없는 게임',
      image: row.game?.cover_path || null,
      role: slotText,
      stats: [
        { key: 'rank', label: '현재 순번', value: rankText },
        {
          key: 'sessions',
          label: '플레이 세션',
          value: sessionValue ? sessionValue.toLocaleString('ko-KR') : '0',
        },
        { key: 'recent', label: '최근 플레이', value: recentText },
        { key: 'mode', label: '주요 모드', value: modeText },
      ],
    };
  });
}

export function buildBattleSummary(battleDetails) {
  const rows = Array.isArray(battleDetails) ? battleDetails : [];
  const wins = rows.filter(battle => (battle.result || '').toLowerCase() === 'win').length;
  const losses = rows.filter(battle => {
    const value = (battle.result || '').toLowerCase();
    return value === 'lose' || value === 'loss';
  }).length;
  const draws = rows.filter(battle => (battle.result || '').toLowerCase() === 'draw').length;
  const total = rows.length;
  const rate = total ? Math.round((wins / total) * 100) : null;
  return { wins, losses, draws, total, rate };
}

export function includesHeroId(value, heroId) {
  if (!value) return false;
  if (Array.isArray(value)) return value.includes(heroId);
  return false;
}

export function createOpponentCards(scoreboardRows, heroLookup, heroId) {
  if (!Array.isArray(scoreboardRows)) return [];

  return scoreboardRows
    .filter(row => row?.hero_id && row.hero_id !== heroId)
    .map((row, index) => {
      const heroEntry = heroLookup?.[row.hero_id] || null;
      const name = heroEntry?.name || row.role || `참가자 ${index + 1}`;
      const portrait = heroEntry?.image_url || null;
      const abilities = heroEntry
        ? ABILITY_KEYS.map(key => heroEntry[key])
            .filter(Boolean)
            .slice(0, 2)
        : [];
      return {
        id: row.id || `${row.hero_id}-${row.slot_no ?? index}`,
        heroId: row.hero_id,
        role: row.role || '',
        name,
        portrait,
        abilities,
      };
    });
}

//
