// Rank / role score config helpers.
//
// This module defines how role/score ranges are represented in workspace
// files (e.g. `/game/roles.rank.json`) and how to map them into the payload
// expected by the `register_rank_game` RPC
// (see `ai-roomchat/docs/sql/register-rank-game.sql`).
//
// Workspace file shape (recommended):
// {
//   "roles": [
//     { "name": "공격수", "slotCount": 1, "scoreDeltaMin": -20, "scoreDeltaMax": 40, "active": true },
//     { "name": "지원가", "slotCount": 1, "scoreDeltaMin": -10, "scoreDeltaMax": 25, "active": true }
//   ]
// }

/**
 * Load role/score config from workspace VFS files.
 *
 * @param {Object<string,{content?:string}>} files
 * @param {string} [path]
 */
export function loadRolesConfig(files, path = '/game/roles.rank.json') {
  try {
    const text = files?.[path]?.content;
    if (!text) return { roles: [] };
    const json = JSON.parse(text || '{}');
    const roles = Array.isArray(json.roles) ? json.roles : [];
    return {
      roles: roles.map((r) => ({
        name: String(r.name || '').trim() || '역할',
        slotCount: Number.isFinite(Number(r.slotCount)) ? Number(r.slotCount) : 0,
        scoreDeltaMin: Number.isFinite(Number(r.scoreDeltaMin)) ? Number(r.scoreDeltaMin) : 0,
        scoreDeltaMax: Number.isFinite(Number(r.scoreDeltaMax)) ? Number(r.scoreDeltaMax) : 0,
        active: r.active !== false,
      })),
    };
  } catch {
    return { roles: [] };
  }
}

/**
 * Map roles config into the shape expected by the register_rank_game RPC.
 *
 * @param {{ roles?: Array<{ name?:string, slotCount?:number, scoreDeltaMin?:number, scoreDeltaMax?:number, active?:boolean }> }} cfg
 * @returns {Array<{ name:string, slot_count:number, score_delta_min:number, score_delta_max:number, active:boolean }>}
 */
export function toRegisterRankRolesPayload(cfg = {}) {
  const roles = Array.isArray(cfg.roles) ? cfg.roles : [];
  return roles.map((r) => {
    const name = String(r.name || '').trim() || '역할';
    const slotCount = Number.isFinite(Number(r.slotCount)) ? Number(r.slotCount) : 0;
    const min = Number.isFinite(Number(r.scoreDeltaMin)) ? Number(r.scoreDeltaMin) : 0;
    const rawMax = Number.isFinite(Number(r.scoreDeltaMax)) ? Number(r.scoreDeltaMax) : min;
    const max = rawMax < min ? min : rawMax;
    const active = r.active !== false;
    return {
      name,
      slot_count: slotCount,
      score_delta_min: min,
      score_delta_max: max,
      active,
    };
  });
}

