// Generic helpers for "standard data slots" used by the text runtime.
//
// These slots live under ctx.variables and are meant to be genre‑agnostic:
// - vars.stats   : numeric metrics (hp/mp/time/score/turn, etc.)
// - vars.scene   : current scene summary / presentation hints
// - vars.effects : active effects list (buff/debuff/status, etc.)
// - vars.speaker : current speaker / actor descriptor
//
// Hooks (/game/hooks/automation.js), server APIs, or other helpers can call
// these utilities to initialise / update the slots in a consistent way.

function getVariables(ctx) {
  if (!ctx || typeof ctx !== 'object') return {};
  const vars =
    ctx.variables && typeof ctx.variables === 'object'
      ? ctx.variables
      : {};
  // NOTE: we do not write back here; callers that mutate vars should
  // assign ctx.variables themselves (see updateStandardSlots).
  return vars;
}

function ensureObject(value, fallback) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return fallback || {};
}

/**
 * Ensure that ctx.variables has the standard slots allocated.
 *
 * This does NOT mutate ctx by itself; it simply returns mutable
 * references that callers can update and then re‑assign to ctx.variables
 * if they want.
 *
 * @param {any} ctx
 * @returns {{ vars: object, stats: object, scene: object, effects: object, speaker: object }}
 */
export function ensureStandardSlots(ctx) {
  const vars = getVariables(ctx);

  const stats = ensureObject(vars.stats, {});
  const scene = ensureObject(vars.scene, {});
  const effects = ensureObject(vars.effects, {});
  const speaker = ensureObject(vars.speaker, {});

  // Normalise effects.active to an array so widgets can rely on it.
  if (!Array.isArray(effects.active)) {
    effects.active = Array.isArray(effects.active) ? effects.active : [];
  }

  vars.stats = stats;
  vars.scene = scene;
  vars.effects = effects;
  vars.speaker = speaker;

  return { vars, stats, scene, effects, speaker };
}

/**
 * Convenience helper to apply a partial update to the standard slots.
 *
 * Example:
 *   updateStandardSlots(ctx, {
 *     stats: { turn: ctx.turn, heroHp: 30 },
 *     scene: { summary: lastNarrative },
 *     effects: { active: parsedEffects },
 *     speaker: { heroId, ownerId, role: 'attacker' },
 *   });
 *
 * @param {any} ctx - coreRuntime hook context (or a plain { variables } bag)
 * @param {object} patch
 * @param {object} [patch.stats]
 * @param {object} [patch.scene]
 * @param {object|Array} [patch.effects]
 *   - If Array, it is treated as the next effects.active list.
 *   - If Object, its fields are shallow‑merged into vars.effects.
 * @param {object} [patch.speaker]
 * @param {object} [patch.variables] - extra top‑level variables to merge.
 *
 * @returns {{ vars: object, stats: object, scene: object, effects: object, speaker: object }}
 */
export function updateStandardSlots(ctx, patch = {}) {
  const { vars, stats, scene, effects, speaker } = ensureStandardSlots(ctx);

  if (patch.stats && typeof patch.stats === 'object') {
    Object.assign(stats, patch.stats);
  }

  if (patch.scene && typeof patch.scene === 'object') {
    Object.assign(scene, patch.scene);
  }

  if (patch.effects !== undefined && patch.effects !== null) {
    const next = patch.effects;
    if (Array.isArray(next)) {
      // Treat as full replacement of active list.
      effects.active = next.slice();
    } else if (typeof next === 'object') {
      if (Array.isArray(next.active)) {
        effects.active = next.active.slice();
      }
      Object.assign(effects, next);
    }
  }

  if (patch.speaker && typeof patch.speaker === 'object') {
    Object.assign(speaker, patch.speaker);
  }

  if (patch.variables && typeof patch.variables === 'object') {
    Object.assign(vars, patch.variables);
  }

  if (ctx && typeof ctx === 'object') {
    ctx.variables = vars;
  }

  return { vars, stats, scene, effects, speaker };
}

