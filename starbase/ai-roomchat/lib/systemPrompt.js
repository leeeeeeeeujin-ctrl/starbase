// lib/systemPrompt.js
// 체크리스트 룰 → 시스템 프롬프트

import { buildRuleOptionLines, mergeRuleOptionLines } from './rank/rules'

const DEFAULT_SYSTEM_PROMPT_LINES = [
  '- 마지막 줄에는 이번 턴의 핵심 캐릭터 이름과 승패·탈락 등 결과를 함께 기재하라. 다만 승패나 탈락(전투 속행 불가)이 명백히 밝혀지지 않았다면 "무"만을 기재해라.',
  '- 마지막에서 두 번째 줄에는 활성화된 변수 이름을 공백으로 구분해 적고, 없다면 "none"이라고 적어라.',
  '- 마지막에서 세 번째 줄에는 비중이 높은 캐릭터 이름을 기재하되, 특별히 중요하지 않으면 공란으로 두라.',
  '- 마지막에서 세 번째 줄 위의 다섯 줄은 후속 기록을 위해 공란으로 남겨 둔다.',
]

export function buildSystemPrompt(rules = {}) {
  const optionLines = buildRuleOptionLines(rules)
  const merged = mergeRuleOptionLines([], optionLines)
  const finalLines = mergeRuleOptionLines(merged, DEFAULT_SYSTEM_PROMPT_LINES)
  return finalLines.join('\n')
}
