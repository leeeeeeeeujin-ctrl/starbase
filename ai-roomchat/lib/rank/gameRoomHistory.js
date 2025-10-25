export function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [];
}

export function formatDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  } catch (error) {
    return '';
  }
}

export function buildBattleLine(battle, heroNameMap) {
  const attackers = ensureArray(battle.attacker_hero_ids).map(
    id => heroNameMap.get(id) || '알 수 없음'
  );
  const defenders = ensureArray(battle.defender_hero_ids).map(
    id => heroNameMap.get(id) || '알 수 없음'
  );
  const createdAt = formatDate(battle.created_at);
  const score =
    Number.isFinite(Number(battle.score_delta)) && Number(battle.score_delta) !== 0
      ? `${Number(battle.score_delta) > 0 ? '+' : ''}${Number(battle.score_delta)}`
      : null;
  const parts = [];
  if (createdAt) parts.push(createdAt);
  if (attackers.length || defenders.length) {
    const matchUp = `${attackers.length ? attackers.join(', ') : '공격'} vs ${
      defenders.length ? defenders.join(', ') : '방어'
    }`;
    parts.push(matchUp);
  }
  if (battle.result) parts.push(battle.result);
  if (score) parts.push(`${score}점`);
  return {
    id: battle.id,
    text: parts.join(' · '),
    result: battle.result || '',
  };
}

export function buildReplayEntries(sessions = [], { type = 'personal' } = {}) {
  const entries = [];
  sessions.forEach((session, index) => {
    const battleLog = session?.battleLog || session?.battle_log || null;
    if (!battleLog || typeof battleLog !== 'object') return;
    const payload =
      battleLog.payload && typeof battleLog.payload === 'object' ? battleLog.payload : null;
    if (!payload) return;

    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    const turns = Array.isArray(payload.turns) ? payload.turns : [];
    const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
    const dropIn = meta.dropIn && typeof meta.dropIn === 'object' ? meta.dropIn : null;
    const baseId = session?.sessionId || session?.session_id || session?.id || `session-${index}`;

    entries.push({
      id: `${type}-${baseId}`,
      label: type === 'shared' ? `세션 ${index + 1}` : `내 세션 ${index + 1}`,
      result: battleLog.result || meta.result || 'unknown',
      reason: battleLog.reason || meta.reason || null,
      generatedAt:
        meta.generatedAt ||
        battleLog.created_at ||
        battleLog.updated_at ||
        session?.sessionCreatedAt ||
        session?.created_at ||
        null,
      turnCount: Number.isFinite(meta.turnCount) ? meta.turnCount : turns.length,
      timelineCount: Number.isFinite(meta.timelineEventCount)
        ? meta.timelineEventCount
        : timeline.length,
      dropIn,
      payload,
    });
  });
  return entries;
}

export function describeDropInSummary(dropIn) {
  if (!dropIn || typeof dropIn !== 'object') return null;
  const roles = Array.isArray(dropIn.roles) ? dropIn.roles : [];
  if (!roles.length) return null;
  const summaries = roles
    .map(role => {
      if (!role || typeof role !== 'object') return null;
      const name = typeof role.role === 'string' ? role.role : '역할';
      const arrivals = Number(role.totalArrivals) || 0;
      const replacements = Number(role.replacements) || 0;
      if (!arrivals && !replacements) return null;
      return `${name}: 합류 ${arrivals}회, 교체 ${replacements}회`;
    })
    .filter(Boolean);
  if (!summaries.length) return null;
  return summaries.join(' · ');
}
