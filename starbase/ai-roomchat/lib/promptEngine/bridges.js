import { buildStatusIndex } from './statusIndex'

export function evaluateBridge(edge, ctx = {}) {
  const turn = ctx.turn || 0
  const activeGlobalNames = ctx.activeGlobalNames || []
  const activeLocalNames = ctx.activeLocalNames || []
  const participantsStatus = ctx.participantsStatus || []

  if (!edge) return false

  for (const cond of edge.conditions || []) {
    switch (cond.type) {
      case 'turn_gte':
        if (!(turn >= cond.value)) return false
        break
      case 'turn_lte':
        if (!(turn <= cond.value)) return false
        break
      case 'prev_ai_contains':
        break
      case 'prev_prompt_contains':
        break
      case 'prev_ai_regex':
        break
      case 'visited_slot':
        if (!ctx.visitedSlotIds?.has(String(cond.slot_id))) return false
        break
      case 'fallback':
        return true
      case 'var_on': {
        const names = cond.names || []
        const mode = cond.mode || 'any'
        const scope = cond.scope || 'both'
        let pool = []
        if (scope === 'global') pool = activeGlobalNames
        else if (scope === 'local') pool = activeLocalNames
        else pool = [...activeGlobalNames, ...activeLocalNames]
        const hits = names.filter((n) => pool.includes(n))
        if (mode === 'any' && hits.length === 0) return false
        if (mode === 'all' && hits.length !== names.length) return false
        break
      }
      case 'count': {
        const { who, role, status, cmp, value } = cond
        const idx = buildStatusIndex(participantsStatus, ctx.myRole)
        const current = idx.count({ who, role, status })
        if (cmp === 'gte' && !(current >= value)) return false
        if (cmp === 'lte' && !(current <= value)) return false
        if (cmp === 'eq' && !(current === value)) return false
        break
      }
      default:
        break
    }
  }

  if (edge.probability != null) {
    if (Math.random() > edge.probability) return false
  }

  return true
}
