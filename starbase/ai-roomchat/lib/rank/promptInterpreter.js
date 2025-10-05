// lib/rank/promptInterpreter.js
import {
  buildVariableRules,
  buildSystemPromptFromChecklist,
  safeStr,
} from '@/lib/promptEngine'
import { sanitizeVariableRules } from '@/lib/variableRules'
import { buildRuleOptionLines } from './rules'
import { compileTemplate as compileRankTemplate } from './prompt'

const DEFAULT_RULE_GUIDANCE = [
  '- 마지막 줄에는 이번 턴의 핵심 캐릭터 이름과 승패·탈락 등 결과를 함께 기재하라.',
  '- 마지막에서 두 번째 줄에는 활성화된 변수 이름을 공백으로 구분해 적고, 없다면 "none"이라고 적어라.',
  '- 마지막에서 세 번째 줄에는 비중이 높은 캐릭터 이름을 기재하되, 특별히 중요하지 않으면 공란으로 두라.',
  '- 마지막에서 세 번째 줄 위의 다섯 줄은 후속 기록을 위해 공란으로 남겨 둔다.',
]

function cleanLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const FALSE_STRINGS = new Set(['false', '0', 'off', 'no', 'n'])

function normalizeRuleFlag(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return false
    if (FALSE_STRINGS.has(trimmed)) return false
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true
  }
  return Boolean(value)
}

function extractRuleValue(entry) {
  if (entry == null) return null
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (!trimmed || FALSE_STRINGS.has(trimmed.toLowerCase())) return null
    return trimmed
  }
  if (typeof entry === 'number') {
    if (!Number.isFinite(entry)) return null
    return entry
  }
  if (typeof entry === 'boolean') {
    return entry ? true : null
  }
  if (Array.isArray(entry)) {
    return entry.length ? entry : null
  }
  if (typeof entry === 'object') {
    if ('enabled' in entry || 'checked' in entry || 'active' in entry) {
      const flag = normalizeRuleFlag(entry.enabled ?? entry.checked ?? entry.active)
      if (!flag) return null
      if ('value' in entry) return extractRuleValue(entry.value)
      if ('option' in entry) return extractRuleValue(entry.option)
      if ('text' in entry) return extractRuleValue(entry.text)
      return true
    }
    if ('value' in entry) {
      return extractRuleValue(entry.value)
    }
    if ('text' in entry) {
      return extractRuleValue(entry.text)
    }
  }
  return null
}

function normalizeRuleOptionsShape(rawRules) {
  const base = rawRules && typeof rawRules === 'object' ? rawRules : {}
  const checklist = Array.isArray(base.checklist) ? base.checklist : []

  const options = {}
  const seen = new Set()

  const register = (key, value) => {
    const normalizedKey = safeStr(key).trim()
    if (!normalizedKey) return
    if (normalizedKey === 'checklist' || normalizedKey === 'options') return
    const normalizedValue = extractRuleValue(value)
    if (normalizedValue == null) return
    const dedupeKey = `${normalizedKey}:${
      typeof normalizedValue === 'string' ? normalizedValue.trim() : normalizedValue
    }`
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    options[normalizedKey] = normalizedValue
  }

  const processEntries = (entries) => {
    if (!entries) return
    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        if (!entry) return
        if (typeof entry === 'string') {
          register(entry, true)
          return
        }
        if (typeof entry !== 'object') return
        const key =
          entry.key ?? entry.id ?? entry.name ?? entry.option ?? entry.label ?? null
        if (!key) return
        if ('value' in entry || 'enabled' in entry || 'checked' in entry || 'active' in entry) {
          register(key, entry)
        } else {
          register(key, entry)
        }
      })
      return
    }

    Object.entries(entries).forEach(([key, value]) => {
      if (key === 'checklist' || key === 'options') return
      register(key, value)
    })
  }

  processEntries(base)
  if (base.options && typeof base.options === 'object') {
    processEntries(base.options)
  }

  return { options, checklist }
}

export function parseGameRules(game) {
  if (!game) return { options: {}, checklist: [] }
  if (game.rules && typeof game.rules === 'object' && !Array.isArray(game.rules)) {
    return normalizeRuleOptionsShape(game.rules)
  }
  const source = game.rules_json ?? game.rules ?? null
  if (!source) return { options: {}, checklist: [] }
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeRuleOptionsShape(parsed)
      }
    } catch (error) {
      return { options: {}, checklist: [] }
    }
  }
  return { options: {}, checklist: [] }
}

function normalizeManualEntries(entries = []) {
  const out = []
  entries.forEach((entry) => {
    const name = safeStr(entry?.name ?? entry?.variable).trim()
    if (!name) return
    const instruction = safeStr(entry?.instruction ?? entry?.condition ?? '').trim()
    out.push({ name, instruction })
  })
  return out
}

function normalizeActiveEntries(entries = []) {
  const out = []
  entries.forEach((entry) => {
    const name = safeStr(entry?.name ?? entry?.variable).trim()
    const directive = safeStr(entry?.directive ?? entry?.ruleText).trim()
    const condition = safeStr(entry?.condition).trim()
    if (!directive) return
    out.push({ name, directive, condition })
  })
  return out
}

function collectVariableScope(node, scope) {
  const key = scope === 'global' ? 'global' : 'local'
  const options = node?.options || {}

  const legacyManual = Array.isArray(options?.[`manual_vars_${key}`])
    ? options[`manual_vars_${key}`]
    : []
  const legacyActive = Array.isArray(options?.[`active_vars_${key}`])
    ? options[`active_vars_${key}`]
    : []
  const sanitized = sanitizeVariableRules(node?.[`var_rules_${key}`])

  const manual = normalizeManualEntries([
    ...legacyManual,
    ...(Array.isArray(sanitized.manual) ? sanitized.manual : []),
  ])
  const active = normalizeActiveEntries([
    ...legacyActive,
    ...(Array.isArray(sanitized.active) ? sanitized.active : []),
  ])

  const activeNames = Array.isArray(options?.[`active_${key}_names`])
    ? options[`active_${key}_names`]
    : []

  return { manual, active, activeNames }
}

function buildScopeVariableRules({ manual = [], active = [], activeNames = [], scope }) {
  const scopeRules = buildVariableRules({
    manual_vars_global: scope === 'global' ? manual : [],
    manual_vars_local: scope === 'local' ? manual : [],
    active_vars_global: scope === 'global' ? active : [],
    active_vars_local: scope === 'local' ? active : [],
    activeGlobalNames: scope === 'global' ? activeNames : [],
    activeLocalNames: scope === 'local' ? activeNames : [],
  })
  if (!scopeRules) return []
  const seen = new Set()
  return scopeRules
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (seen.has(line)) return false
      seen.add(line)
      return true
    })
}

function normalizeStatus(value) {
  const text = safeStr(value).trim().toLowerCase()
  return text || 'alive'
}

function normalizeRole(value) {
  return safeStr(value).trim()
}

function normalizeOwnerId(participant, hero) {
  const owner =
    participant?.owner_id ??
    participant?.ownerId ??
    hero?.owner_id ??
    hero?.ownerId ??
    null
  if (owner == null) return null
  const text = String(owner).trim()
  return text || null
}

export function buildParticipantSlotMap(participants = []) {
  const slotMap = {}
  const used = new Set()
  let fallbackCursor = 0

  const ensureSlotIndex = (candidate) => {
    let index = Number.isFinite(Number(candidate)) ? Number(candidate) : null
    if (index != null) {
      while (used.has(index)) {
        index += 1
      }
      used.add(index)
      if (index >= fallbackCursor) fallbackCursor = index + 1
      return index
    }

    index = fallbackCursor
    while (used.has(index)) {
      index += 1
    }
    used.add(index)
    fallbackCursor = index + 1
    return index
  }

  participants.forEach((participant) => {
    if (!participant) return
    const hero = participant.hero || {}
    const slotIndex = ensureSlotIndex(participant.slot_no)

    const normalized = {}
    const heroId = hero.id ?? hero.hero_id ?? participant.hero_id ?? null
    if (heroId != null) {
      const heroIdText = String(heroId).trim()
      normalized.hero_id = heroIdText
      normalized.heroId = heroIdText
    }

    normalized.name = safeStr(hero.name)
    normalized.description = safeStr(hero.description)

    for (let abilityIndex = 1; abilityIndex <= 12; abilityIndex += 1) {
      const key = `ability${abilityIndex}`
      normalized[key] = safeStr(hero[key])
    }

    const role = normalizeRole(participant.role || hero.role)
    normalized.role = role
    normalized.status = normalizeStatus(participant.status || hero.status)
    const ownerId = normalizeOwnerId(participant, hero)
    if (ownerId) {
      normalized.owner_id = ownerId
      normalized.ownerId = ownerId
      normalized.owner = ownerId
    }

    const side = normalizeRole(hero.side || participant.side)
    if (side) {
      normalized.side = side
      normalized.side_label = side
      normalized.sideLabel = side
    }

    normalized.slot_no = slotIndex
    normalized.slotNo = slotIndex
    normalized.slot_index = slotIndex
    normalized.slotIndex = slotIndex
    normalized.slot_number = slotIndex + 1
    normalized.slotNumber = slotIndex + 1
    normalized.name_or_role = normalized.name || role
    normalized.display_name = normalized.name_or_role

    slotMap[slotIndex] = normalized
  })

  return slotMap
}

const RULE_SOURCE_PRIORITY = {
  option: 3,
  checklist: 2,
  prefix: 1,
  default: 0,
}

function buildRuleSections({ game, node } = {}) {
  const sections = {
    baseRules: [],
    globalVariables: [],
    localVariables: [],
  }

  const baseRuleEntries = []
  const indexByLine = new Map()
  const pushBaseRule = (line, source = 'default') => {
    const text = safeStr(line)
    if (!text) return
    const key = text.trim()
    if (!key) return

    const priority = RULE_SOURCE_PRIORITY[source] ?? RULE_SOURCE_PRIORITY.default
    if (indexByLine.has(key)) {
      const existingIndex = indexByLine.get(key)
      const existing = baseRuleEntries[existingIndex]
      if (existing.priority >= priority) {
        return
      }
      baseRuleEntries[existingIndex] = { text, priority }
      return
    }

    indexByLine.set(key, baseRuleEntries.length)
    baseRuleEntries.push({ text, priority })
  }

  const prefixLines = cleanLines(game?.rules_prefix)
    .map((line) => line.replace(/^규칙:?$/i, '').trim())
    .filter(Boolean)
  prefixLines.forEach((line) => pushBaseRule(line, 'prefix'))

  const { options: ruleOptions, checklist } = parseGameRules(game)
  const ruleOptionLines = buildRuleOptionLines(ruleOptions)
  ruleOptionLines.forEach((line) => pushBaseRule(line, 'option'))

  const checklistLines = buildSystemPromptFromChecklist({ checklist })
  if (checklistLines) {
    cleanLines(checklistLines).forEach((line) => pushBaseRule(line, 'checklist'))
  }

  DEFAULT_RULE_GUIDANCE.forEach((line) => pushBaseRule(line, 'default'))

  const globalScope = collectVariableScope(node, 'global')
  const localScope = collectVariableScope(node, 'local')

  const globalRules = buildScopeVariableRules({
    manual: globalScope.manual,
    active: globalScope.active,
    activeNames: globalScope.activeNames,
    scope: 'global',
  })
  if (globalRules.length) {
    sections.globalVariables.push(...globalRules)
  }

  const localRules = buildScopeVariableRules({
    manual: localScope.manual,
    active: localScope.active,
    activeNames: localScope.activeNames,
    scope: 'local',
  })
  if (localRules.length) {
    sections.localVariables.push(...localRules)
  }

  sections.baseRules = baseRuleEntries.map((entry) => entry.text)

  return sections
}

function buildRulesBlock(sections) {
  const lines = ['[규칙]']

  if (sections.baseRules.length) {
    lines.push(...sections.baseRules)
  }

  if (sections.globalVariables.length) {
    if (lines[lines.length - 1] !== '') {
      lines.push('')
    }
    lines.push('[전역 변수 지침]')
    lines.push(...sections.globalVariables)
  }

  if (sections.localVariables.length) {
    if (lines[lines.length - 1] !== '') {
      lines.push('')
    }
    lines.push('[로컬 변수 지침]')
    lines.push(...sections.localVariables)
  }

  return lines.join('\n')
}

function applyPostReplacements(text = '', { historyText = '' } = {}) {
  let out = text
  out = out.replace(/\{\{pick:([^}]+)\}\}/g, (match, body) => {
    const options = String(body)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
    if (!options.length) return ''
    const index = Math.floor(Math.random() * options.length)
    return options[index]
  })
  out = out.replace(/\{\{history\}\}/g, historyText || '')
  return out
}

export function interpretPromptNode({
  game = null,
  node = null,
  participants = [],
  slotsMap = null,
  historyText = '',
} = {}) {
  if (!node) {
    return {
      text: '',
      promptBody: '',
      rulesBlock: '[규칙]\n',
      sections: { baseRules: [], globalVariables: [], localVariables: [] },
      meta: {},
    }
  }

  const effectiveSlotsMap = slotsMap || buildParticipantSlotMap(participants)
  const { text: compiledText, meta: compileMeta } = compileRankTemplate({
    template: node.template || '',
    slotsMap: effectiveSlotsMap,
    historyText: historyText || '',
  })

  const promptBody = applyPostReplacements(compiledText, { historyText })
  const sections = buildRuleSections({ game, node })
  const rulesBlock = buildRulesBlock(sections)
  const finalText = [rulesBlock, '-------------------------------------', promptBody]
    .filter((block) => block != null && block !== '')
    .join('\n')

  return {
    text: finalText,
    promptBody,
    rulesBlock,
    sections,
    meta: {
      slotId: node?.id ?? null,
      slotNo: node?.slot_no ?? null,
      slotType: node?.slot_type ?? null,
      compileMeta: compileMeta || {},
    },
  }
}

export { DEFAULT_RULE_GUIDANCE }

