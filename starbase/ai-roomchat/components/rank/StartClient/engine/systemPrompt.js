import { buildSystemPromptFromChecklist } from '../../../../lib/promptEngine'

export function parseRules(game) {
  if (!game) return {}
  if (game.rules && typeof game.rules === 'object') {
    return game.rules
  }
  const source = game.rules_json ?? game.rules ?? null
  if (!source) return {}
  try {
    return JSON.parse(source)
  } catch (error) {
    return {}
  }
}

export function buildSystemMessage(game) {
  const rules = parseRules(game)
  const checklist = buildSystemPromptFromChecklist(rules)
  const prefix = game?.rules_prefix ? String(game.rules_prefix) : ''
  return [prefix, checklist].filter(Boolean).join('\n')
}

//
