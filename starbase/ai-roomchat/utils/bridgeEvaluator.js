// utils/bridgeEvaluator.js
export function getLastLines(text, n) {
  const lines = (text || '').split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

function scopeText(aiText, scope) {
  if (!scope || scope === 'last1') return getLastLines(aiText, 1);
  if (scope === 'last2') return getLastLines(aiText, 2);
  if (scope === 'last5') return getLastLines(aiText, 5);
  if (scope === 'all') return aiText || '';
  const m = String(scope).match(/^last(\d+)$/);
  return m ? getLastLines(aiText, Number(m[1])) : getLastLines(aiText, 1);
}

function normalize(s) { return (s || '').toLowerCase(); }

function evalOne(cond, ctx, external) {
  const last = ctx.turns[ctx.turns.length - 1] || { prompt: '', ai: '' };
  switch (cond?.type) {
    case 'prev_ai_contains': {
      const hay = normalize(scopeText(last.ai, cond.scope));
      return hay.includes(normalize(cond.value || ''));
    }
    case 'prev_prompt_contains': {
      const hay = normalize(scopeText(last.prompt, cond.scope));
      return hay.includes(normalize(cond.value || ''));
    }
    case 'prev_ai_regex': {
      try {
        const re = new RegExp(cond.pattern, cond.flags || '');
        return re.test(scopeText(last.ai, cond.scope));
      } catch { return false; }
    }
    case 'prev_ai_any_of': {
      const hay = normalize(scopeText(last.ai, cond.scope));
      const words = cond.words || [];
      return words.some(w => hay.includes(normalize(w)));
    }
    case 'prev_ai_all_of': {
      const hay = normalize(scopeText(last.ai, cond.scope));
      const words = cond.words || [];
      return words.every(w => hay.includes(normalize(w)));
    }
    case 'prev_ai_count_gte': {
      const hay = normalize(scopeText(last.ai, cond.scope || 'all'));
      const word = normalize(cond.word || '');
      const countNeed = Number(cond.count || 1);
      if (!word) return false;
      const matches = hay.match(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
      return matches.length >= countNeed;
    }
    case 'turn_gte': return (ctx.turn >= Number(cond.value || 0));
    case 'turn_lte': return (ctx.turn <= Number(cond.value || 0));
    case 'random': return Math.random() < Number(cond.p || 0);
    case 'once':
      return !external.triggered?.has(ctx.bridgeId);
    case 'cooldown':
      return (external.cooldownMap?.get(ctx.bridgeId) || 0) <= 0;
    default:
      return true;
  }
}

export function evaluateBridgeCandidates(bridges, ctx, external = {}) {
  let candidates = bridges.filter(b => {
    const conds = b.conditions || [];
    for (const c of conds) {
      if (!evalOne(c, { ...ctx, bridgeId: b.id }, external)) return false;
    }
    return true;
  });

  candidates.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  for (const b of candidates) {
    const p = (b.probability == null) ? 1.0 : Number(b.probability);
    if (Math.random() <= p) return b;
  }

  return bridges.find(b => b.fallback) || null;
}
