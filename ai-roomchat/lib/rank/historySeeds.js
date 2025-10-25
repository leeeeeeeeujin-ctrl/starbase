// lib/rank/historySeeds.js
// Supabase 세션 히스토리를 StartClient 버퍼에 심기 위한 정규화 유틸리티입니다.

function coerceRole(value) {
  if (typeof value !== 'string') return 'assistant';
  const trimmed = value.trim();
  return trimmed || 'assistant';
}

function coerceContent(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed ? String(value) : '';
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.floor(numeric);
}

function shouldIncludeInAi(turn) {
  const meta = turn?.metadata && typeof turn.metadata === 'object' ? turn.metadata : null;
  const summaryExtra =
    turn?.summaryPayload && typeof turn.summaryPayload === 'object'
      ? turn.summaryPayload.extra
      : null;

  const flags = [
    meta?.includeInAi,
    meta?.include_in_ai,
    summaryExtra?.includeInAi,
    summaryExtra?.include_in_ai,
  ];

  if (flags.some(flag => flag === false)) {
    return false;
  }

  const suppressTokens = [
    meta?.suppressAi,
    meta?.suppress_ai,
    summaryExtra?.suppressAi,
    summaryExtra?.suppress_ai,
  ];

  if (suppressTokens.some(flag => flag === true)) {
    return false;
  }

  return true;
}

export function buildHistorySeedEntries(sessionHistory) {
  if (!sessionHistory || typeof sessionHistory !== 'object') {
    return [];
  }

  const turns = Array.isArray(sessionHistory.turns) ? sessionHistory.turns : [];

  return turns
    .filter(turn => coerceContent(turn?.content))
    .map((turn, index) => {
      const role = coerceRole(turn?.role);
      const idxValue = toFiniteNumber(turn?.idx ?? index);
      const includeInAi = shouldIncludeInAi(turn);
      const isVisible = turn?.isVisible !== false;
      const isPublic = turn?.public !== false && isVisible;

      const meta = { seeded: true };
      if (idxValue !== null) {
        meta.turnIdx = idxValue;
      }
      if (turn?.createdAt) {
        meta.createdAt = turn.createdAt;
      }
      if (includeInAi === false) {
        meta.includeInAi = false;
      }

      return {
        role,
        content: coerceContent(turn?.content),
        public: isPublic,
        includeInAi,
        meta,
      };
    });
}

export default buildHistorySeedEntries;
