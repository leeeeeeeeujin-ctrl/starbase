// apiKeyRouting.js
//
// 호스트/서버 측에서 "어떤 참가자의 API 키를 쓸지"를 결정하기 위한
// 공통 헬퍼입니다.
//
// 주의:
// - 이 모듈은 브라우저/서버에서만 import 해서 사용합니다.
// - sandboxed 훅(`/game/hooks/automation.js`)에서는 직접 import 할 수 없고,
//   훅은 오직 "어떤 슬롯/프롬프트가 누구를 가리키는지" 힌트만 남겨야 합니다.

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTrimmed(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeDebugParticipants(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p, index) => {
      if (!p || typeof p !== 'object') return null;
      const apiKey = toTrimmed(p.apiKey || p.key || null);
      if (!apiKey) return null;
      return {
        origin: 'debug',
        index,
        apiKey,
        name: toTrimmed(p.name || p.label || null),
        slotNo: toInt(p.slotNo),
        heroId: toTrimmed(p.heroId || null),
        ownerId: toTrimmed(p.ownerId || null),
      };
    })
    .filter(Boolean);
}

function normalizeRankParticipants(rank) {
  if (!rank || typeof rank !== 'object') return [];

  // Rank 컨텍스트에 viewer 가 있으면, 그 유저(ownerId)에 해당하는 참가자만
  // API 키 후보로 허용한다. (랭크 1인용 텍스트 배틀에서 "매칭된 유저" 제한)
  let viewerOwnerId = null;
  try {
    if (rank.viewer && typeof rank.viewer === 'object') {
      viewerOwnerId =
        toTrimmed(rank.viewer.ownerId) || toTrimmed(rank.viewer.owner_id) || null;
    }
  } catch {
    viewerOwnerId = null;
  }

  const players = Array.isArray(rank.players) ? rank.players : [];
  return players
    .map((p, index) => {
      if (!p || typeof p !== 'object') return null;

      const ownerId = toTrimmed(p.ownerId || p.owner_id || null);
      // viewerOwnerId 가 있으면, 그 유저가 아닌 참가자는 키 후보에서 제외한다.
      if (viewerOwnerId && ownerId && ownerId !== viewerOwnerId) {
        return null;
      }

      // 실제 구현에서는 rank 쪽에서 별도 키 풀을 관리할 수도 있다.
      // 지금은 헬퍼 구조를 맞춰두기만 하고 apiKey 는 선택적이다.
      const apiKey = toTrimmed(p.apiKey || p.api_key || null);
      if (!apiKey) return null;

      return {
        origin: 'rank',
        index,
        apiKey,
        name:
          toTrimmed(
            p.heroName ||
              p.hero_name ||
              p.display_name ||
              p.displayName ||
              p.owner_name ||
              p.ownerName,
          ) || null,
        slotNo: toInt(p.slotNo || p.slot_index),
        heroId: toTrimmed(p.heroId || p.hero_id || null),
        ownerId,
      };
    })
    .filter(Boolean);
}

export function buildParticipantPool({ ctx = null, gameState = null } = {}) {
  let debugList = [];
  let rankVars = null;

  try {
    const vars =
      ctx && ctx.variables && typeof ctx.variables === 'object'
        ? ctx.variables
        : gameState && gameState.variables && typeof gameState.variables === 'object'
        ? gameState.variables
        : null;
    if (vars && vars.debug && typeof vars.debug === 'object') {
      const dbg = vars.debug;
      if (Array.isArray(dbg.participants)) {
        debugList = dbg.participants;
      }
    }
    if (vars && vars.rank && typeof vars.rank === 'object') {
      rankVars = vars.rank;
    } else if (gameState && gameState.rank && typeof gameState.rank === 'object') {
      rankVars = gameState.rank;
    }
  } catch {
    // ignore introspection failures
  }

  const fromRank = normalizeRankParticipants(rankVars);
  let fromDebug = [];

  // Rank 컨텍스트에서 유효한 참가자(apiKey 보유)가 하나라도 있으면,
  // 그 세션에서는 디버그 참가자 키는 사용하지 않는다.
  // (랭크 텍스트 배틀에서 매칭된 유저의 키만 사용하기 위함)
  if (!fromRank.length) {
    fromDebug = normalizeDebugParticipants(debugList);
  }

  // 랭크 컨텍스트가 없을 때만 디버그 참가자를 사용하고,
  // 랭크 컨텍스트가 있으면 항상 랭크 쪽(매칭된 유저)만 사용한다.
  return [...fromRank, ...fromDebug];
}

function extractTokensFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return [];
  const tokens = [];
  const words = prompt.split(/\s+/);
  for (const w of words) {
    if (!w) continue;
    if (w[0] === '@' && w.length > 1) {
      const t = w
        .replace(/^@+/, '')
        .replace(/[^\w가-힣]+$/u, '')
        .trim()
        .toLowerCase();
      if (t) tokens.push(t);
    }
  }
  return tokens;
}

function scoreCandidate(candidate, { slotNo, tokens }) {
  let score = 0;
  if (slotNo != null && candidate.slotNo != null && candidate.slotNo === slotNo) {
    score += 5;
  }
  if (tokens && tokens.length && candidate.name) {
    const name = candidate.name.toLowerCase();
    for (const t of tokens) {
      if (!t) continue;
      if (name === t || name.includes(t)) {
        score += 3;
        break;
      }
    }
  }
  return score;
}

/**
 * 슬롯/프롬프트/힌트를 기반으로 참가자 + API 키를 하나 선택한다.
 *
 * @param {Object} options
 * @param {Object|null} [options.ctx] - runtime ctx (선택)
 * @param {Object|null} [options.gameState] - 서버에서 받은 gameState (선택)
 * @param {Object|null} [options.node] - 현재 노드 (선택)
 * @param {string|null} [options.prompt] - 이 턴에 사용된 프롬프트
 * @param {{ slotNo?: number|null }} [options.routeHint] - 훅/노드에서 전달한 명시적 힌트
 * @returns {{ apiKey: string|null, participant: Object|null }|null}
 */
export function selectParticipantForPrompt({
  ctx = null,
  gameState = null,
  node = null,
  prompt = null,
  routeHint = null,
} = {}) {
  const pool = buildParticipantPool({ ctx, gameState });
  if (!pool.length) return null;

  let slotNo = null;
  try {
    if (routeHint && routeHint.slotNo != null) {
      slotNo = toInt(routeHint.slotNo);
    } else if (node && node.data) {
      slotNo =
        toInt(node.data.slotNo) ||
        toInt(node.data.slot_no) ||
        toInt(node.data.slotIndex) ||
        null;
    }
  } catch {
    slotNo = null;
  }

  const tokens = extractTokensFromPrompt(prompt || '');

  // 점수 기반으로 후보 정렬
  const scored = pool
    .map((c) => ({
      candidate: c,
      score: scoreCandidate(c, { slotNo, tokens }),
    }))
    .filter((x) => x.score > 0);

  let chosen = null;
  if (scored.length) {
    scored.sort((a, b) => b.score - a.score);
    chosen = scored[0].candidate;
  } else {
    // 힌트가 없으면 단순 랜덤 선택
    const idx = Math.floor(Math.random() * pool.length);
    chosen = pool[idx];
  }

  if (!chosen) return null;
  return {
    apiKey: chosen.apiKey || null,
    participant: chosen,
  };
}

