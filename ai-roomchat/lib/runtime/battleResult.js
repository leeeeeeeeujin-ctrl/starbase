// Helper for text-battle style outcomes in core.text-runtime.
//
// This module centralises how AI 판정 결과를 ctx.variables에 반영하는지 정의한다.
// 훅(/game/hooks/automation.js)에서는 이 헬퍼를 통해:
// - variables.battleLast
// - variables.battleResult
// - variables.battleWinner
// - variables.battleScore
// 를 일관된 형태로 업데이트할 수 있다.

/**
 * @typedef {Object} BattleLast
 * @property {string} [narrative]
 * @property {string} [result]
 * @property {boolean} [battleEnd]
 * @property {string|null} [winner]
 * @property {any} [effects]
 * @property {string|null} [timestamp]
 */

/**
 * Update ctx.variables with the latest battle outcome in a consistent way.
 *
 * @param {any} ctx - coreRuntime 훅 컨텍스트 (ctx.variables를 포함)
 * @param {Object} params
 * @param {string} [params.narrative]
 * @param {string} [params.result] - 'success' | 'failure' | 'partial' | 'critical' | 'continue' 등
 * @param {boolean} [params.battleEnd]
 * @param {string|null} [params.winner]
 * @param {any} [params.effects]
 * @param {string|null} [params.timestamp]
 */
export function applyBattleOutcome(ctx, params = {}) {
  if (!ctx || typeof ctx !== 'object') return;
  const vars = ctx.variables && typeof ctx.variables === 'object' ? ctx.variables : {};

  const narrative = params.narrative || '';
  const rawResult = (params.result || '').toLowerCase();
  const result = rawResult || 'continue';
  const battleEnd = !!params.battleEnd;
  const winner = params.winner || null;
  const effects = params.effects || null;
  const timestamp = params.timestamp || null;

  vars.battleLast = {
    narrative,
    result,
    battleEnd,
    winner,
    effects,
    timestamp,
  };

  // Short, graph-facing outcome token
  let outcomeToken = 'continue';
  if (winner && result === 'success') {
    // 임시 규칙: success + winner === hero → hero_win, 그 외에는 rival_win
    if (winner === 'hero') outcomeToken = 'hero_win';
    else if (winner === 'rival') outcomeToken = 'rival_win';
    else outcomeToken = 'winner_' + winner;
  } else if (result === 'failure' && winner === 'rival') {
    outcomeToken = 'rival_win';
  } else if (result === 'partial' || result === 'continue') {
    outcomeToken = 'tie';
  }

  vars.battleResult = outcomeToken;

  if (battleEnd && winner) {
    vars.battleWinner = winner;
  }

  // Simple score model: +1 to winner side on end, others unchanged.
  const score = vars.battleScore && typeof vars.battleScore === 'object'
    ? { ...vars.battleScore }
    : { hero: 0, rival: 0 };
  if (battleEnd && winner) {
    if (winner === 'hero') score.hero = (score.hero || 0) + 1;
    else if (winner === 'rival') score.rival = (score.rival || 0) + 1;
  }
  vars.battleScore = score;

  ctx.variables = vars;
}

