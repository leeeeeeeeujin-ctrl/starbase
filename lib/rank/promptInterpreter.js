// lib/rank/promptInterpreter.js
import {
  buildVariableRules,
  buildSystemPromptFromChecklist,
  safeStr,
} from '@/lib/promptEngine'
import { sanitizeVariableRules } from '@/lib/variableRules'
import { buildRuleOptionLines } from './rules'
import { compileTemplate as compileRankTemplate } from './prompt'

const DEFAULT_RULE_GUIDANCE_ENTRIES = [
  {
    text:
      '- 응답의 마지막 여덟 줄 중 위 다섯 줄은 공란으로 남겨 두고, 맨 아래 세 줄만 다음 형식으로 채워라.',
    matchers: [/마지막/, /(다섯|5)[^\s]*\s*줄/, /(공란|공백)/],
  },
  {
    text:
      '- 마지막에서 세 번째 줄에는 이번 턴에서 독보적인 활약을 펼친 캐릭터 이름을 적되, 적합한 인물이 없으면 비워 둔다.',
    matchers: [/(마지막)(에서)?[^\n]*(셋|세)[^\s]*\s*줄/, /(활약|주역|독보)/],
  },
  {
    text:
      '- 마지막에서 두 번째 줄에는 활성화된 변수명을 공백으로 구분해 적고, 없다면 "무"만 적어라.',
    matchers: [/(마지막)(에서)?[^\n]*(둘|두)[^\s]*\s*줄/, /(변수|변수명)/],
  },
  {
    text:
      '- 마지막 줄에는 해당 턴의 판정을 캐릭터 이름과 함께 "승리", "패배", "탈락" 중 하나로 선언하고, 판정이 없다면 "무"만 적어라.',
    matchers: [/(마지막\s*줄)/, /(승리|패배|탈락|판정|결과)/],
  },
]

const DEFAULT_RULE_GUIDANCE = DEFAULT_RULE_GUIDANCE_ENTRIES.map((entry) => entry.text)

const SIMILAR_RULE_SIMILARITY_THRESHOLD = 0.68

function cleanLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeForSimilarity(text) {
  return safeStr(text)
    .replace(/^[•\-\u2022\s]+/, '')
    .replace(/["'`“”‘’\[\]\(\)\{\}<>]/g, ' ')
    .replace(/[.,!?·~_:;\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildBigramSet(text) {
  const collapsed = text.replace(/\s+/g, '')
  const bigrams = new Set()
  for (let index = 0; index < collapsed.length - 1; index += 1) {
    bigrams.add(collapsed.slice(index, index + 2))
  }
  return bigrams
}

function areLinesSimilar(lineA, lineB) {
  const normalizedA = normalizeForSimilarity(lineA)
  const normalizedB = normalizeForSimilarity(lineB)

  if (!normalizedA || !normalizedB) return false
  if (normalizedA === normalizedB) return true

  const bigramsA = buildBigramSet(normalizedA)
  const bigramsB = buildBigramSet(normalizedB)

  if (!bigramsA.size || !bigramsB.size) {
    return normalizedA === normalizedB
  }

  let intersection = 0
  bigramsA.forEach((token) => {
    if (bigramsB.has(token)) {
      intersection += 1
    }
  })

  const union = bigramsA.size + bigramsB.size - intersection
  if (!union) return true

  return intersection / union >= SIMILAR_RULE_SIMILARITY_THRESHOLD
}

function lineMatches(text, matchers = []) {
  if (!matchers || !matchers.length) return false
  const normalized = safeStr(text)
  if (!normalized) return false
  return matchers.every((matcher) => {
    if (!matcher) return false
    if (matcher instanceof RegExp) {
      return matcher.test(normalized)
    }
    return normalized.includes(String(matcher))
  })
}

const CANONICAL_RULE_PATTERNS = [
  {
    key: 'ultimate_injection_detection',
    matchers: [/인젝션/, /(응답하|응답만)/],
  },
  {
    key: 'ultimate_injection_win_override',
    matchers: [/승패\s*조건/, /궁극적\s*승리/, /(응답하|응답만)/],
  },
  {
    key: 'ability_usage_constraint',
    matchers: [/능력은\s*여건/, /(상시발동|존재성)/],
  },
  {
    key: 'advantage_description_rule',
    matchers: [/전투\s*가능/, /(우위|격차)/],
  },
  {
    key: 'no_underdog_trope',
    matchers: [/전술/, /(역량|개연)/],
  },
  {
    key: 'no_villain_loss_cliche',
    matchers: [/악인/, /(클리셰|강약)/],
  },
  {
    key: 'no_protagonist_narrative',
    matchers: [/주인공/, /(적과\s*적|강약)/],
  },
]

function resolveCanonicalRuleKey(text) {
  const trimmed = safeStr(text).trim()
  if (!trimmed) return ''
  for (const { key, matchers } of CANONICAL_RULE_PATTERNS) {
    if (lineMatches(trimmed, matchers)) {
      return key
    }
  }
  return trimmed
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

function normalizeActiveNameList(names = []) {
  const list = Array.isArray(names) ? names : []
  const seen = new Set()
  const normalized = []
  list.forEach((value) => {
    const text = safeStr(value).trim()
    if (!text) return
    if (seen.has(text)) return
    seen.add(text)
    normalized.push(text)
  })
  return normalized
}

function buildVariableStateLines(names = [], scopeLabel = '전역') {
  const normalized = normalizeActiveNameList(names)
  const summary = normalized.length ? normalized.join(', ') : '무'
  return [`- 활성화된 ${scopeLabel} 변수: ${summary}`]
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

function buildRuleSections({
  game,
  node,
  activeGlobalNames = [],
  activeLocalNames = [],
} = {}) {
  const sections = {
    baseRules: [],
    globalVariables: [],
    localVariables: [],
    globalVariableStates: [],
    localVariableStates: [],
  }

  const baseRuleEntries = []
  const indexByLine = new Map()
  const findSimilarCanonicalKey = (candidate) => {
    for (const [existingKey, existingIndex] of indexByLine.entries()) {
      const existingEntry = baseRuleEntries[existingIndex]
      if (!existingEntry) continue
      if (areLinesSimilar(existingEntry.text, candidate)) {
        return existingKey
      }
    }
    return ''
  }
  const pushBaseRule = (line, source = 'default') => {
    const text = safeStr(line)
    if (!text) return
    const trimmed = text.trim()
    if (!trimmed) return
    let canonicalKey = resolveCanonicalRuleKey(text)
    if (!canonicalKey) return

    if (canonicalKey === trimmed) {
      const similarKey = findSimilarCanonicalKey(text)
      if (similarKey) {
        canonicalKey = similarKey
      }
    }

    const priority = RULE_SOURCE_PRIORITY[source] ?? RULE_SOURCE_PRIORITY.default
    if (indexByLine.has(canonicalKey)) {
      const existingIndex = indexByLine.get(canonicalKey)
      const existing = baseRuleEntries[existingIndex]
      if (existing.priority >= priority) {
        return
      }
      baseRuleEntries[existingIndex] = { text, priority }
      return
    }

    indexByLine.set(canonicalKey, baseRuleEntries.length)
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

  const baseRuleSnapshot = baseRuleEntries.map((entry) => safeStr(entry.text))

  DEFAULT_RULE_GUIDANCE_ENTRIES.forEach(({ text, matchers = [] }) => {
    const trimmed = safeStr(text)
    if (!trimmed) return

    const hasSimilarLine = Array.isArray(matchers) && matchers.length
      ? baseRuleSnapshot.some((existing) => lineMatches(existing, matchers))
      : false

    if (!hasSimilarLine) {
      pushBaseRule(trimmed, 'default')
    }
  })

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

  const mergedGlobalStateNames = normalizeActiveNameList([
    ...(globalScope.activeNames || []),
    ...(Array.isArray(activeGlobalNames) ? activeGlobalNames : []),
  ])
  const mergedLocalStateNames = normalizeActiveNameList([
    ...(localScope.activeNames || []),
    ...(Array.isArray(activeLocalNames) ? activeLocalNames : []),
  ])

  if (sections.globalVariables.length || mergedGlobalStateNames.length) {
    sections.globalVariableStates.push(...buildVariableStateLines(mergedGlobalStateNames, '전역'))
  }

  if (sections.localVariables.length || mergedLocalStateNames.length) {
    sections.localVariableStates.push(...buildVariableStateLines(mergedLocalStateNames, '로컬'))
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

  if (sections.globalVariableStates.length) {
    if (lines[lines.length - 1] !== '') {
      lines.push('')
    }
    lines.push('[전역 변수 상태]')
    lines.push(...sections.globalVariableStates)
  }

  if (sections.localVariableStates.length) {
    if (lines[lines.length - 1] !== '') {
      lines.push('')
    }
    lines.push('[로컬 변수 상태]')
    lines.push(...sections.localVariableStates)
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
  activeGlobalNames = [],
  activeLocalNames = [],
} = {}) {
  if (!node) {
    return {
      text: '',
      promptBody: '',
      rulesBlock: '[규칙]\n',
      sections: {
        baseRules: [],
        globalVariables: [],
        localVariables: [],
        globalVariableStates: [],
        localVariableStates: [],
      },
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
  const sections = buildRuleSections({
    game,
    node,
    activeGlobalNames,
    activeLocalNames,
  })
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

