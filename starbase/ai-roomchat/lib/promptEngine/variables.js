import { safeStr } from './utils'

function normalizeManualEntry(entry) {
  const name = safeStr(entry?.name ?? entry?.variable).trim()
  const instruction = safeStr(entry?.instruction ?? entry?.condition ?? '').trim()
  if (!name) return null
  return { name, instruction }
}

function buildManualVarLines(entries = [], scopeLabel) {
  const out = []
  for (const entry of entries) {
    const normalized = normalizeManualEntry(entry)
    if (!normalized) continue
    const instruction =
      normalized.instruction || '해당 조건을 만족하면 변수명을 출력한다.'
    const line = [
      `- ${scopeLabel} 변수 ${normalized.name}: ${instruction}`,
      ' → 만족하면 응답의 둘째 줄(끝에서 두 번째)에 ',
      `"${normalized.name}"를 적어라.`,
    ].join('')
    out.push(line)
  }
  return out
}

function normalizeActiveEntry(entry) {
  return {
    name: safeStr(entry?.name ?? entry?.variable).trim(),
    directive: safeStr(entry?.ruleText ?? entry?.directive ?? '').trim(),
    condition: safeStr(entry?.condition ?? '').trim(),
  }
}

function buildActiveVarLines(entries = [], activeNames = [], scopeLabel) {
  const out = []
  const activeSet = new Set((activeNames || []).map((name) => String(name)))

  for (const entry of entries) {
    const normalized = normalizeActiveEntry(entry)
    if (!normalized.directive) continue

    if (normalized.name) {
      if (activeSet.size > 0 && !activeSet.has(normalized.name)) continue
      let line = `- [${scopeLabel}:${normalized.name}] 지시: ${normalized.directive}`
      if (normalized.condition) line += ` (조건: ${normalized.condition})`
      out.push(line)
    } else {
      let line = `- [${scopeLabel}] 지시: ${normalized.directive}`
      if (normalized.condition) line += ` (조건: ${normalized.condition})`
      out.push(line)
    }
  }

  return out
}

export function buildVariableRules({
  manual_vars_global = [],
  manual_vars_local = [],
  active_vars_global = [],
  active_vars_local = [],
  activeGlobalNames = [],
  activeLocalNames = [],
} = {}) {
  const lines = []
  lines.push(...buildManualVarLines(manual_vars_global, '전역'))
  lines.push(...buildManualVarLines(manual_vars_local, '로컬'))
  lines.push(...buildActiveVarLines(active_vars_global, activeGlobalNames, '전역'))
  lines.push(...buildActiveVarLines(active_vars_local, activeLocalNames, '로컬'))
  return lines.join('\n')
}
