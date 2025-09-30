import { buildVariableRules } from './variables'

export function compileTemplate({
  template = '',
  slots = [],
  historyText = '',
  options = {},
  activeGlobalNames = [],
  activeLocalNames = [],
  currentSlot = null,
} = {}) {
  let out = template

  out = out.replace(/\{\{slot(\d+)\.(\w+)\}\}/g, (match, rawIndex, field) => {
    const index = Number(rawIndex) - 1
    if (index < 0 || index >= slots.length) return ''
    const row = slots[index]
    return row && row[field] != null ? String(row[field]) : ''
  })

  out = out.replace(/\{\{history\}\}/g, historyText)

  out = out.replace(/\{\{pick:([^}]+)\}\}/g, (match, body) => {
    const optionsList = body.split('|').map((s) => s.trim()).filter(Boolean)
    if (optionsList.length === 0) return ''
    const index = Math.floor(Math.random() * optionsList.length)
    return optionsList[index]
  })

  const variableRules = buildVariableRules({
    manual_vars_global: options?.manual_vars_global || [],
    manual_vars_local: options?.manual_vars_local || [],
    active_vars_global: options?.active_vars_global || [],
    active_vars_local: options?.active_vars_local || [],
    activeGlobalNames,
    activeLocalNames,
  })

  if (variableRules) {
    out = `${out}\n\n[변수/규칙]\n${variableRules}`
  }

  return {
    text: out,
    meta: {
      pickedSlot: currentSlot,
      variableRules,
    },
  }
}

export function makeNodePrompt({
  node = null,
  slots = [],
  historyText = '',
  activeGlobalNames = [],
  activeLocalNames = [],
  currentSlot = null,
} = {}) {
  if (!node) {
    return { text: '', pickedSlot: null }
  }

  const slotHint =
    currentSlot != null
      ? String(currentSlot)
      : node.id != null
        ? String(node.id)
        : null

  const { text, meta } = compileTemplate({
    template: node.template || '',
    slots,
    historyText,
    options: node.options || {},
    activeGlobalNames,
    activeLocalNames,
    currentSlot: slotHint,
  })

  return {
    text,
    pickedSlot: meta?.pickedSlot ?? slotHint,
    variableRules: meta?.variableRules || '',
  }
}
