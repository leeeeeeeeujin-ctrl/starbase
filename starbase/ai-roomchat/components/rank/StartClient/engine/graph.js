import { evaluateBridge } from '../../../../lib/promptEngine'

const CONDITION_PRIORITY = {
  VARIABLE: 0,
  RESPONSE: 1,
  PROMPT_OR_TURN: 2,
  DEFAULT: 3,
}

function getConditionPriority(cond) {
  switch (cond?.type) {
    case 'var_on':
      return CONDITION_PRIORITY.VARIABLE
    case 'prev_ai_contains':
    case 'prev_ai_regex':
    case 'prev_ai_any_of':
    case 'prev_ai_all_of':
    case 'prev_ai_count_gte':
    case 'visited_slot':
      return CONDITION_PRIORITY.RESPONSE
    case 'prev_prompt_contains':
    case 'turn_gte':
    case 'turn_lte':
      return CONDITION_PRIORITY.PROMPT_OR_TURN
    default:
      return CONDITION_PRIORITY.DEFAULT
  }
}

function getEdgePriority(edge) {
  if (!edge?.data) return CONDITION_PRIORITY.DEFAULT
  const conditions = Array.isArray(edge.data.conditions)
    ? edge.data.conditions
    : []
  if (conditions.length === 0) {
    return CONDITION_PRIORITY.DEFAULT
  }
  let rank = CONDITION_PRIORITY.DEFAULT
  for (const cond of conditions) {
    const condRank = getConditionPriority(cond)
    if (condRank < rank) {
      rank = condRank
    }
    if (rank === CONDITION_PRIORITY.VARIABLE) {
      break
    }
  }
  return rank
}

function compareCandidate(a, b) {
  if (a.rank !== b.rank) {
    return a.rank - b.rank
  }
  if (b.priority !== a.priority) {
    return b.priority - a.priority
  }
  return a.index - b.index
}

export function pickNextEdge(edges, context) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return null
  }

  const candidates = []
  let fallback = null

  edges.forEach((edge, index) => {
    if (!edge?.to) return

    const data = edge.data || {}
    if (data.fallback) {
      if (
        !fallback ||
        (data.priority ?? 0) > (fallback.data?.priority ?? 0)
      ) {
        fallback = edge
      }
      return
    }

    if (!evaluateBridge(data, context)) {
      return
    }

    candidates.push({
      edge,
      rank: getEdgePriority(edge),
      priority: Number(data.priority ?? 0),
      index,
    })
  })

  if (candidates.length > 0) {
    candidates.sort(compareCandidate)
    return candidates[0].edge
  }

  return fallback
}

//
