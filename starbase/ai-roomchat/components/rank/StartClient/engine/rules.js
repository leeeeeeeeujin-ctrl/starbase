import { sanitizeVariableRules } from '../../../../lib/variableRules'

const COMPARATOR_LABEL = { gte: '이상', lte: '이하', eq: '정확히' }
const OUTCOME_LABEL = { win: '승리', lose: '패배', draw: '무승부' }
const STATUS_LABEL = { alive: '생존', dead: '탈락', won: '승리', lost: '패배' }

function formatAutoInstruction(rule) {
  const name = String(rule?.variable || '').trim()
  if (!name) return null

  const comparator = COMPARATOR_LABEL[rule?.comparator] || COMPARATOR_LABEL.gte
  const count = Number.isFinite(Number(rule?.count)) ? Number(rule.count) : 1
  const outcome = OUTCOME_LABEL[rule?.outcome] || OUTCOME_LABEL.win

  if (rule?.status === 'flag_on') {
    const flagName = String(rule?.flag || '').trim()
    if (!flagName) return null
    return `변수 ${flagName}가 활성화되면 응답 마지막 줄을 "${outcome}"로 선언하라.`
  }

  const subject = rule?.subject
  let subjectText = '지정한 역할'
  if (subject === 'same') subjectText = '같은 편 역할'
  else if (subject === 'other') subjectText = '상대편 역할'
  else if (subject === 'specific' && rule?.role) subjectText = `${rule.role} 역할`

  const statusText = STATUS_LABEL[rule?.status] || STATUS_LABEL.alive

  return `${subjectText} 중 ${statusText} 상태인 인원이 ${count}명${comparator}이면 응답 마지막 줄을 "${outcome}"로 선언하라.`
}

function convertScopeRules(rawRules) {
  const sanitized = sanitizeVariableRules(rawRules)
  const manual = []
  const active = []

  for (const rule of sanitized.manual) {
    const name = String(rule.variable || '').trim()
    if (!name) continue
    manual.push({ name, instruction: rule.condition || '' })
  }

  for (const rule of sanitized.auto) {
    const name = String(rule.variable || '').trim()
    if (!name) continue
    const instruction = formatAutoInstruction(rule)
    if (instruction) {
      manual.push({ name, instruction })
    }
  }

  for (const rule of sanitized.active) {
    const directive = String(rule.directive || '').trim()
    if (!directive) continue
    const entry = { directive }
    if (rule.condition) entry.condition = rule.condition
    if (rule.variable) entry.name = rule.variable
    active.push(entry)
  }

  return { manual, active }
}

export function createNodeFromSlot(slot) {
  const globalRules = convertScopeRules(slot?.var_rules_global)
  const localRules = convertScopeRules(slot?.var_rules_local)

  return {
    id: String(slot.id),
    slot_no: slot.slot_no ?? null,
    template: slot.template || '',
    slot_type: slot.slot_type || 'ai',
    is_start: !!slot.is_start,
    options: {
      invisible: !!slot.invisible,
      visible_slots: Array.isArray(slot.visible_slots)
        ? slot.visible_slots.map((value) => Number(value))
        : [],
      manual_vars_global: globalRules.manual,
      manual_vars_local: localRules.manual,
      active_vars_global: globalRules.active,
      active_vars_local: localRules.active,
    },
  }
}

export function extractVariableRules(slot) {
  return {
    global: convertScopeRules(slot?.var_rules_global),
    local: convertScopeRules(slot?.var_rules_local),
  }
}

//
