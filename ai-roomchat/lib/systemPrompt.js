// lib/systemPrompt.js
// 체크리스트 룰 → 시스템 프롬프트

import { buildRuleOptionLines, mergeRuleOptionLines } from './rank/rules';

const DEFAULT_SYSTEM_PROMPT_LINES = [
  '- 응답의 마지막 여덟 줄 중 위 다섯 줄은 공란으로 남겨 두고, 맨 아래 세 줄만 다음 형식으로 채워라.',
  '- 마지막에서 세 번째 줄에는 이번 턴에서 독보적인 활약을 펼친 캐릭터 이름을 적되, 적합한 인물이 없으면 비워 둔다.',
  '- 마지막에서 두 번째 줄에는 활성화된 변수명을 공백으로 구분해 적고, 없다면 "무"만 적어라.',
  '- 마지막 줄에는 해당 턴의 판정을 캐릭터 이름과 함께 "승리", "패배", "탈락" 중 하나로 선언하고, 판정이 없다면 "무"만 적어라.',
];

export function buildSystemPrompt(rules = {}) {
  const optionLines = buildRuleOptionLines(rules);
  const merged = mergeRuleOptionLines([], optionLines);
  const finalLines = mergeRuleOptionLines(merged, DEFAULT_SYSTEM_PROMPT_LINES);
  return finalLines.join('\n');
}
