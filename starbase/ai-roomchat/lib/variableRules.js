const RULE_MODES = ['auto', 'manual', 'active']
const SUBJECT_OPTIONS = ['same', 'other', 'specific']
const STATUS_OPTIONS = ['alive', 'dead', 'won', 'lost', 'flag_on']
const OUTCOME_OPTIONS = ['win', 'lose', 'draw']
const CMP_OPTIONS = ['gte', 'lte', 'eq']

export const VARIABLE_RULES_VERSION = 2

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `vr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function createAutoRule() {
  return {
    id: makeId(),
    variable: '',
    outcome: 'win',
    subject: 'same',
    role: '',
    comparator: 'gte',
    count: 1,
    status: 'alive',
    flag: '',
  }
}

export function createManualRule() {
  return {
    id: makeId(),
    variable: '',
    condition: '',
  }
}

export function createActiveRule() {
  return {
    id: makeId(),
    condition: '',
    directive: '',
  }
}

export function makeEmptyVariableRules(mode = 'auto') {
  return {
    version: VARIABLE_RULES_VERSION,
    mode: RULE_MODES.includes(mode) ? mode : 'auto',
    auto: [],
    manual: [],
    active: [],
  }
}

function normalizeMode(rawMode) {
  return RULE_MODES.includes(rawMode) ? rawMode : 'auto'
}

function normalizeSubject(subject) {
  return SUBJECT_OPTIONS.includes(subject) ? subject : 'same'
}

function normalizeStatus(status) {
  return STATUS_OPTIONS.includes(status) ? status : 'alive'
}

function normalizeOutcome(outcome) {
  return OUTCOME_OPTIONS.includes(outcome) ? outcome : 'win'
}

function normalizeComparator(cmp) {
  return CMP_OPTIONS.includes(cmp) ? cmp : 'gte'
}

export function ensureVariableRules(raw) {
  if (!raw) {
    return makeEmptyVariableRules()
  }

  if (Array.isArray(raw)) {
    return {
      ...makeEmptyVariableRules('manual'),
      manual: raw.map((entry) => ({
        id: entry?.id || makeId(),
        variable: String(entry?.variable ?? entry?.name ?? ''),
        condition: String(entry?.condition ?? ''),
      })),
    }
  }

  if (typeof raw !== 'object') {
    return makeEmptyVariableRules()
  }

  const mode = normalizeMode(raw.mode)
  const auto = Array.isArray(raw.auto)
    ? raw.auto.map((entry) => ({
        ...createAutoRule(),
        ...entry,
        id: entry?.id || makeId(),
        variable: String(entry?.variable ?? ''),
        outcome: normalizeOutcome(entry?.outcome),
        subject: normalizeSubject(entry?.subject),
        role: String(entry?.role ?? ''),
        comparator: normalizeComparator(entry?.comparator),
        count: Number.isFinite(Number(entry?.count)) ? Number(entry?.count) : 1,
        status: normalizeStatus(entry?.status),
        flag: String(entry?.flag ?? ''),
      }))
    : []

  const manual = Array.isArray(raw.manual)
    ? raw.manual.map((entry) => ({
        ...createManualRule(),
        ...entry,
        id: entry?.id || makeId(),
        variable: String(entry?.variable ?? ''),
        condition: String(entry?.condition ?? ''),
      }))
    : []

  const active = Array.isArray(raw.active)
    ? raw.active.map((entry) => ({
        ...createActiveRule(),
        ...entry,
        id: entry?.id || makeId(),
        condition: String(entry?.condition ?? ''),
        directive: String(entry?.directive ?? ''),
      }))
    : []

  return {
    version: VARIABLE_RULES_VERSION,
    mode,
    auto,
    manual,
    active,
  }
}

export function sanitizeVariableRules(raw) {
  const ensured = ensureVariableRules(raw)

  const auto = ensured.auto.map((rule) => ({
    ...createAutoRule(),
    ...rule,
    id: rule.id || makeId(),
    variable: rule.variable.trim(),
    outcome: normalizeOutcome(rule.outcome),
    subject: normalizeSubject(rule.subject),
    role: rule.subject === 'specific' ? rule.role.trim() : '',
    comparator: normalizeComparator(rule.comparator),
    count: Number.isFinite(Number(rule.count)) ? Number(rule.count) : 1,
    status: normalizeStatus(rule.status),
    flag: rule.status === 'flag_on' ? rule.flag.trim() : '',
  }))

  const manual = ensured.manual.map((rule) => ({
    ...createManualRule(),
    ...rule,
    id: rule.id || makeId(),
    variable: rule.variable.trim(),
    condition: rule.condition.trim(),
  }))

  const active = ensured.active.map((rule) => ({
    ...createActiveRule(),
    ...rule,
    id: rule.id || makeId(),
    condition: rule.condition.trim(),
    directive: rule.directive.trim(),
  }))

  return {
    version: VARIABLE_RULES_VERSION,
    mode: normalizeMode(ensured.mode),
    auto,
    manual,
    active,
  }
}

export function variableRulesEqual(a, b) {
  const left = JSON.stringify(sanitizeVariableRules(a))
  const right = JSON.stringify(sanitizeVariableRules(b))
  return left === right
}

export function collectVariableNames(rules) {
  const sanitized = sanitizeVariableRules(rules)
  const names = new Set()
  sanitized.auto.forEach((rule) => {
    if (rule.variable) names.add(rule.variable)
    if (rule.status === 'flag_on' && rule.flag) names.add(rule.flag)
  })
  sanitized.manual.forEach((rule) => {
    if (rule.variable) names.add(rule.variable)
  })
  return Array.from(names)
}

export const VARIABLE_RULE_MODES = RULE_MODES
export const VARIABLE_RULE_SUBJECTS = SUBJECT_OPTIONS
export const VARIABLE_RULE_STATUS = STATUS_OPTIONS
export const VARIABLE_RULE_OUTCOMES = OUTCOME_OPTIONS
export const VARIABLE_RULE_COMPARATORS = CMP_OPTIONS
