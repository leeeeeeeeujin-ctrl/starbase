// lib/conditions.js
// 모든 조건 타입별 평가 로직 모듈화

import { lastLines } from './promptEngine';
import { buildStatusIndex } from './promptEngine';

export function evaluateCondition(c, ctx) {
  const type = String(c?.type || '');
  switch (type) {
    case 'turn_gte': {
      const v = Number(c.value ?? 0);
      return ctx.turn >= v;
    }
    case 'turn_lte': {
      const v = Number(c.value ?? 0);
      return ctx.turn <= v;
    }
    case 'prev_ai_contains': {
      const scope = c.scope || 'last2';
      const hay =
        scope === 'all'
          ? ctx.historyAiText
          : lastLines(ctx.historyAiText, scope === 'last1' ? 1 : scope === 'last5' ? 5 : 2);
      return hay.toLowerCase().includes(String(c.value || '').toLowerCase());
    }
    case 'prev_prompt_contains': {
      const scope = c.scope || 'last1';
      const hay =
        scope === 'all'
          ? ctx.historyUserText
          : lastLines(ctx.historyUserText, scope === 'last2' ? 2 : 1);
      return hay.toLowerCase().includes(String(c.value || '').toLowerCase());
    }
    case 'prev_ai_regex': {
      try {
        const re = new RegExp(c.pattern || '', c.flags || '');
        const hay = c.scope === 'all' ? ctx.historyAiText : lastLines(ctx.historyAiText, 1);
        return re.test(hay);
      } catch {
        return false;
      }
    }
    case 'visited_slot': {
      return ctx.visitedSlotIds.has(String(c.slot_id));
    }
    case 'var_on': {
      const names = c.names || [];
      const pool = new Set([
        ...(c.scope === 'global' || c.scope === 'both' ? ctx.activeGlobalNames : []),
        ...(c.scope === 'local' || c.scope === 'both' ? ctx.activeLocalNames : []),
      ]);
      return c.mode === 'all' ? names.every(n => pool.has(n)) : names.some(n => pool.has(n));
    }
    case 'count': {
      const idx = buildStatusIndex(ctx.participantsStatus, ctx.myRole);
      const who = c.who || 'all';
      const status = c.status || 'alive';
      const v = idx.count({ who, role: c.role, status });
      if (c.cmp === 'eq') return v === c.value;
      if (c.cmp === 'lte') return v <= c.value;
      return v >= c.value;
    }
    default:
      return true;
  }
}
