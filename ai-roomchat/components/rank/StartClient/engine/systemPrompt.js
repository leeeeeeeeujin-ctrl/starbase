import { buildSystemPromptFromChecklist } from '../../../../lib/promptEngine';

export function parseRules(game) {
  if (!game) return {};
  if (game.rules && typeof game.rules === 'object') {
    return game.rules;
  }
  const source = game.rules_json ?? game.rules ?? null;
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch (error) {
    return {};
  }
}

export function buildSystemMessage(game) {
  const rules = parseRules(game);
  const checklist = buildSystemPromptFromChecklist(rules);
  const prefix = game?.rules_prefix ? String(game.rules_prefix) : '';
  const defaultLines = [
    '응답의 마지막 여덟 줄 중 위 다섯 줄은 공란으로 비워 두고, 맨 아래 세 줄만 다음 형식으로 채워라.',
    '마지막에서 세 번째 줄: 이번 턴에서 독보적인 활약을 펼친 캐릭터 이름을 적되, 특별한 인물이 없다면 비워 둔다.',
    '마지막에서 두 번째 줄: 활성화된 변수명을 공백으로 구분해 적고, 없다면 "무"만 적는다.',
    '마지막 줄: 해당 턴의 판정을 캐릭터 이름과 함께 "승리", "패배", "탈락" 중 하나로 선언하고, 판정이 없다면 "무"만 적는다.',
  ].join('\n');

  return [prefix, checklist, defaultLines].filter(Boolean).join('\n');
}

//
