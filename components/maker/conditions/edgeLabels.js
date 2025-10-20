export function buildEdgeLabel(data) {
  const parts = []
  const conds = data?.conditions || []

  conds.forEach((condition) => {
    if (condition?.type === 'turn_gte') parts.push(`턴 ≥ ${condition.value}`)
    if (condition?.type === 'turn_lte') parts.push(`턴 ≤ ${condition.value}`)
    if (condition?.type === 'prev_ai_contains') parts.push(`이전응답 "${condition.value}"`)
    if (condition?.type === 'prev_prompt_contains') parts.push(`이전프롬프트 "${condition.value}"`)
    if (condition?.type === 'prev_ai_regex')
      parts.push(`이전응답 /${condition.pattern}/${condition.flags || ''}`)
    if (condition?.type === 'visited_slot') parts.push(`경유 #${condition.slot_id ?? '?'}`)
    if (condition?.type === 'var_on')
      parts.push(`var_on(${condition.scope || 'both'}:${(condition.names || []).join('|')})`)
    if (condition?.type === 'count') parts.push(`count ${condition.cmp} ${condition.value}`)
    if (condition?.type === 'fallback') parts.push('Fallback')
  })

  const probability = data?.probability
  if (probability != null && probability !== 1) {
    parts.push(`확률 ${Math.round(Number(probability) * 100)}%`)
  }

  return parts.join(' | ')
}
