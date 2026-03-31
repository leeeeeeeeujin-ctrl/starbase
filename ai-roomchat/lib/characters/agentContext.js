import {
  HERO_ARCHIVE_MAX,
  HERO_MEMORY_ENTRY_MAX_LENGTH,
  HERO_MEMORY_SLOT_MAX,
  HERO_RECENT_CHAT_MAX,
} from './profileRules';

export function buildHeroAgentPrompt({
  heroSummary,
  profile,
  userInput,
}) {
  const recentChats = Array.isArray(profile?.recentChats) ? profile.recentChats : [];
  const memories = Array.isArray(profile?.memories) ? profile.memories : [];
  const archives = Array.isArray(profile?.archives) ? profile.archives : [];

  const memoryText = memories.map((entry, index) => `${index}. ${entry.text}`).join('\n');
  const recentText = recentChats
    .slice(-HERO_RECENT_CHAT_MAX)
    .map(entry => `${entry.role === 'assistant' ? 'AI' : 'USER'}: ${entry.text}`)
    .join('\n');
  const archiveText = archives
    .slice(-3)
    .map((entry, index) => `${index + 1}. ${entry.summary}`)
    .join('\n');

  return [
    '너는 유저가 육성하는 캐릭터 AI다.',
    '캐릭터의 기본 정보는 이미 사실로 알고 있으며, 그 성격과 말투를 대화로 함께 다듬는다.',
    `이름: ${heroSummary?.name || '이름 없는 캐릭터'}`,
    `설명: ${heroSummary?.description || '없음'}`,
    `능력: ${heroSummary?.abilities?.length ? heroSummary.abilities.join(' / ') : '없음'}`,
    `기본 프롬프트: ${profile?.systemPrompt || '없음'}`,
    `말투/어조: ${profile?.speakingStyle || '없음'}`,
    `행동 원칙: ${profile?.behaviorRules || '없음'}`,
    `메모리 슬롯 제한: ${HERO_MEMORY_SLOT_MAX}개`,
    `메모리 한 칸 길이 제한: ${HERO_MEMORY_ENTRY_MAX_LENGTH}자`,
    `장기 아카이브 보관 제한: ${HERO_ARCHIVE_MAX}개`,
    '중요한 사실은 메모리로 추가/수정/삭제할 수 있다.',
    '불필요하거나 오래된 메모리는 스스로 정리해도 된다.',
    '최근 대화에서 밀려난 내용은 장기 아카이브 요약으로 남아 있다.',
    '응답은 반드시 JSON 하나만 반환한다.',
    '형식:',
    '{"reply":"유저에게 보일 답변","memoryAction":{"type":"none|add|update|delete","index":0,"text":"메모리 내용"}}',
    `현재 메모리:\n${memoryText || '없음'}`,
    `최근 대화:\n${recentText || '없음'}`,
    `장기 아카이브 요약:\n${archiveText || '없음'}`,
    `유저 입력:\n${userInput}`,
  ].join('\n\n');
}
