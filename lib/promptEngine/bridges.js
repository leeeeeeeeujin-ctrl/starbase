import { buildStatusIndex } from './statusIndex'

function normalizeText(value) {
  if (!value) return ''
  return String(value).toLowerCase()
}

function compareNumeric(cmp, current, expected) {
  if (!Number.isFinite(current)) return false
  if (!Number.isFinite(expected)) {
    return false
  }
  switch (cmp) {
    case 'lte':
      return current <= expected
    case 'eq':
      return current === expected
    case 'gt':
      return current > expected
    case 'gte':
    default:
      return current >= expected
  }
}

export function evaluateBridge(edge, ctx = {}) {
  const turn = Number.isFinite(Number(ctx.turn)) ? Number(ctx.turn) : 0
  const activeGlobalNames = ctx.activeGlobalNames || []
  const activeLocalNames = ctx.activeLocalNames || []
  const participantsStatus = ctx.participantsStatus || []
  const historyAiText = ctx.historyAiText || ''
  const historyUserText = ctx.historyUserText || ''
  const visitedSlotIds = ctx.visitedSlotIds instanceof Set ? ctx.visitedSlotIds : null
  const sessionFlags = ctx.sessionFlags || {}
  const flagMap = sessionFlags.flags || {}
  const metrics = sessionFlags.metrics || {}
  const turnsSinceDropIn =
    sessionFlags.turnsSinceDropIn != null
      ? Number(sessionFlags.turnsSinceDropIn)
      : metrics.turns_since_drop_in

  const statusIndex = ctx.statusIndex || buildStatusIndex(participantsStatus, ctx.myRole)
  const roleHealth = ctx.roleHealth || new Map()

  if (!edge) return false

  for (const cond of edge.conditions || []) {
    switch (cond.type) {
      case 'turn_gte':
        if (!(turn >= cond.value)) return false
        break
      case 'turn_lte':
        if (!(turn <= cond.value)) return false
        break
      case 'prev_ai_contains': {
        const value = normalizeText(cond.value)
        if (!value) return false
        if (!normalizeText(historyAiText).includes(value)) return false
        break
      }
      case 'prev_prompt_contains': {
        const value = normalizeText(cond.value)
        if (!value) return false
        if (!normalizeText(historyUserText).includes(value)) return false
        break
      }
      case 'prev_ai_regex': {
        const pattern = cond.pattern || cond.value
        if (!pattern) return false
        try {
          const re = new RegExp(pattern, cond.flags || cond.options || '')
          if (!re.test(historyAiText || '')) return false
        } catch (error) {
          console.warn('[Bridge] prev_ai_regex 구문을 해석하지 못했습니다:', error)
          return false
        }
        break
      }
      case 'visited_slot':
        if (!visitedSlotIds?.has(String(cond.slot_id))) return false
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
      case 'session_flag': {
        const name = cond.name || cond.flag
        if (!name) return false
        const expected = cond.value === undefined ? true : Boolean(cond.value)
        const actual = Boolean(flagMap[String(name)])
        if (actual !== expected) return false
        break
      }
      case 'drop_in_recent': {
        if (turnsSinceDropIn == null) return false
        const within = Number(cond.within_turns ?? cond.within ?? 0)
        if (within <= 0) {
          if (!(turnsSinceDropIn === 0)) return false
        } else if (turnsSinceDropIn > within) {
          return false
        }
        break
      }
      case 'drop_in_absent': {
        if (turnsSinceDropIn == null) break
        const afterTurns = Number(cond.after_turns ?? cond.turns ?? 0)
        if (afterTurns <= 0) {
          if (turnsSinceDropIn <= 0) return false
        } else if (turnsSinceDropIn <= afterTurns) {
          return false
        }
        break
      }
      case 'brawl_enabled': {
        const expect = cond.value === undefined ? true : Boolean(cond.value)
        if (Boolean(flagMap.brawl_enabled) !== expect) return false
        break
      }
      case 'win_count_gte': {
        const expected = Number(cond.value || cond.count || 0)
        const current = Number(metrics.win_count || 0)
        if (!compareNumeric('gte', current, expected)) return false
        break
      }
      case 'win_count_lte': {
        const expected = Number(cond.value || cond.count || 0)
        const current = Number(metrics.win_count || 0)
        if (!compareNumeric('lte', current, expected)) return false
        break
      }
      case 'win_count_eq': {
        const expected = Number(cond.value || cond.count || 0)
        const current = Number(metrics.win_count || 0)
        if (!compareNumeric('eq', current, expected)) return false
        break
      }
      case 'role_status': {
        const role = cond.role
        if (!role) return false
        const summary = roleHealth.get(String(role)) || {
          alive: 0,
          defeated: 0,
          spectator: 0,
        }
        const status = String(cond.status || 'alive').toLowerCase()
        const cmp = cond.cmp || 'gte'
        const expected = Number(cond.value || 0)
        const current = Number(
          status === 'spectator'
            ? summary.spectator
            : status === 'defeated' || status === 'lost'
            ? summary.defeated
            : summary.alive,
        )
        if (!compareNumeric(cmp, current, expected)) return false
        break
      }
      case 'count': {
        const { who, role, status, cmp, value } = cond
        const idx = statusIndex || buildStatusIndex(participantsStatus, ctx.myRole)
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
