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
  const defaultLines = [
    '누가 봐도 이 게임의 주역이다 싶은 캐릭터가 있다면, 이름을 마지막에서 세 번째 줄에 적어라.',
    '응답 마지막 세 줄은 아래 형식을 반드시 지키세요.',
    '마지막에서 세 번째 줄: 이번 턴의 주역 캐릭터 이름을 쉼표로 구분해 적으세요. 주역이 없다면 "none"이라고 적으세요.',
    '마지막에서 두 번째 줄: 활성화된 변수 이름을 공백으로 구분해 적으세요. 없으면 "none"이라고 적으세요.',
    '마지막 줄: 승리, 패배, 무승부 등 이번 턴의 결과를 한 단어로 요약하세요.',
  ].join('\n')

  return [prefix, checklist, defaultLines].filter(Boolean).join('\n')
}

//
