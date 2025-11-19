// Text battle persistence helpers (schema mapping only).
//
// These helpers map the in-memory runtime context
// (ctx.node, ctx.variables.battleLast, ctx.variables.battleScore, etc.)
// to rows compatible with docs/sql/text-battle-sessions.sql.
//
// 실제 INSERT/UPDATE는 서버/백엔드(예: Supabase RPC, rank actions)에서
// 이 객체를 사용해 수행해야 한다.

/**
 * Build a row for `text_battle_sessions`.
 *
 * @param {Object} params
 * @param {string} [params.externalId]
 * @param {string} [params.ownerId]
 * @param {string} [params.promptSetId]
 * @param {string} [params.gameName]
 * @param {Object} [params.variables]
 */
export function toTextBattleSessionRow(params = {}) {
  const {
    externalId = null,
    ownerId = null,
    promptSetId = null,
    gameName = null,
    variables = {},
  } = params || {};
  const winner = variables?.battleWinner || null;
  const finalScore = variables?.battleScore || null;

  return {
    external_id: externalId,
    owner_id: ownerId,
    prompt_set_id: promptSetId,
    game_name: gameName,
    status: winner ? 'completed' : 'active',
    winner,
    final_score: finalScore,
  };
}

/**
 * Build a row for `text_battle_turns`.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {number} params.turnIndex
 * @param {any} params.ctx - coreRuntime hook context (ctx.node, ctx.variables 포함)
 * @param {number} [params.durationMs]
 * @param {string} [params.heroId]
 * @param {string} [params.rivalId]
 */
export function toTextBattleTurnRow(params = {}) {
  const {
    sessionId,
    turnIndex,
    ctx,
    durationMs = null,
    heroId = null,
    rivalId = null,
  } = params || {};

  const node = ctx?.node || {};
  const vars = ctx?.variables || {};
  const last = vars?.battleLast || {};
  const score = vars?.battleScore || null;

  // prompt / ai_response는 호출 플로우에서 별도로 전달할 수 있지만,
  // 기본값으로는:
  // - prompt: 이 턴에 사용된 전체 프롬프트 텍스트 (lastPrompt)
  // - ai_response: LLM 원본 응답 전체 텍스트 (aiResponseRaw) 또는 요약 내러티브(narrative)
  const prompt = vars?.lastPrompt || null;
  const aiResponseRaw = vars?.aiResponseRaw || null;
  const aiResponse = aiResponseRaw || last.narrative || null;

  return {
    session_id: sessionId,
    turn_index: turnIndex,
    node_id: node?.id || null,
    node_label: node?.label || null,
    hero_id: heroId,
    rival_id: rivalId,
    prompt,
    ai_response: aiResponse,
    result: last.result || null,
    battle_end: !!last.battleEnd,
    winner: last.winner || null,
    effects: last.effects || null,
    score,
    duration_ms: durationMs,
  };
}
