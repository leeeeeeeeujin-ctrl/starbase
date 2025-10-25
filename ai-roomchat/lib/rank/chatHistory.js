// lib/rank/chatHistory.js
// 공유 가능한 AI 히스토리 정규화 유틸리티입니다. 클라이언트 요청과 서버 공급자 매핑에서
// 동일한 규칙을 사용할 수 있도록 한곳에 모아둡니다.

function clampLimit(limit, fallback = 24) {
  const numeric = Number(limit);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.floor(numeric), 1), 64);
}

function normalizeRole(value) {
  if (typeof value !== 'string') return 'user';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return 'user';

  if (['assistant', 'ai', 'bot', 'model'].includes(trimmed)) {
    return 'assistant';
  }

  if (['user', 'player', 'human', 'participant', 'viewer'].includes(trimmed)) {
    return 'user';
  }

  // 랭크 히스토리는 시스템 프롬프트도 히스토리 행으로 저장하므로, 실제 대화 흐름에서는
  // 사용자 메시지로 취급해 대화형 모델이 맥락을 이해할 수 있도록 합니다.
  if (['system', 'narrator', 'prompt'].includes(trimmed)) {
    return 'user';
  }

  return 'user';
}

function normalizeContent(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return value;
}

function extractTurnIdx(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const sources = [
    entry.turnIdx,
    entry.turn_index,
    entry.turnIndex,
    entry.idx,
    entry.meta?.turnIdx,
  ];
  for (const candidate of sources) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
  }
  return null;
}

function baseNormalizeHistory(history, { limit = 24 } = {}) {
  const max = clampLimit(limit);
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const buffer = [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (buffer.length >= max) break;
    const entry = history[index];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.includeInAi === false) continue;
    const content = normalizeContent(entry.content);
    if (!content) continue;

    buffer.push({
      role: normalizeRole(entry.role),
      content,
      turnIdx: extractTurnIdx(entry),
    });
  }

  return buffer.reverse();
}

/**
 * 클라이언트 → API 요청 페이로드용 히스토리 정규화.
 */
export function prepareHistoryPayload(history, options = {}) {
  return baseNormalizeHistory(history, options);
}

/**
 * 서버에서 공급자 호출 전에 사용할 히스토리 정규화.
 */
export function sanitizeHistoryForProvider(history, options = {}) {
  return baseNormalizeHistory(history, options);
}
