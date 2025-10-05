// lib/rank/promptInterpreter.js
import {
  buildVariableRules,
  buildSystemPromptFromChecklist,
  safeStr,
} from '@/lib/promptEngine'
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

export function parseGameRules(game) {
  if (!game) return {}
  if (game.rules && typeof game.rules === 'object' && !Array.isArray(game.rules)) {
    return game.rules
  }
  const source = game.rules_json ?? game.rules ?? null
  if (!source) return {}
  if (typeof source === 'string') {
    try {
      const parsed = JSON.parse(source)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      return {}
    }
  }
  return {}
}

function buildScopeVariableRules({ manual = [], active = [], scope }) {
  const scopeRules = buildVariableRules({
    manual_vars_global: scope === 'global' ? manual : [],
    manual_vars_local: scope === 'local' ? manual : [],
    active_vars_global: scope === 'global' ? active : [],
    active_vars_local: scope === 'local' ? active : [],
    activeGlobalNames: [],
    activeLocalNames: [],
  })
  return scopeRules
    ? scopeRules
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : []
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

function buildRuleSections({ game, node } = {}) {
  const sections = {
    baseRules: [],
    globalVariables: [],
    localVariables: [],
  }

  const prefix = safeStr(game?.rules_prefix).trim()
  if (prefix) {
    sections.baseRules.push(prefix)
  }

  const parsedRules = parseGameRules(game)
  const checklist = buildSystemPromptFromChecklist(parsedRules)
  if (checklist) {
    sections.baseRules.push(...cleanLines(checklist))
  }

  sections.baseRules.push(...DEFAULT_RULE_GUIDANCE)

  const manualGlobal = node?.options?.manual_vars_global || []
  const activeGlobal = node?.options?.active_vars_global || []
  const manualLocal = node?.options?.manual_vars_local || []
  const activeLocal = node?.options?.active_vars_local || []

  const globalRules = buildScopeVariableRules({
    manual: manualGlobal,
    active: activeGlobal,
    scope: 'global',
  })
  if (globalRules.length) {
    sections.globalVariables.push(...globalRules)
  }

  const localRules = buildScopeVariableRules({
    manual: manualLocal,
    active: activeLocal,
    scope: 'local',
  })
  if (localRules.length) {
    sections.localVariables.push(...localRules)
  }

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

