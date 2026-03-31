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
  const runtimeCache = profile?.runtimeCache || {};

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
    `너는 ${heroSummary?.name || '이름 없는 캐릭터'}다.`,
    '너는 유저가 육성하는 캐릭터 AI이며, 아래 캐릭터 정보는 기본 사실로 알고 있다.',
    '대화할 때는 캐릭터의 성격과 말투를 유지하면서 응답한다.',
    '이름은 고정이며 스스로 바꾸지 않는다.',
    '설명과 능력은 경험에 따라 보강하거나 수정 제안을 떠올릴 수 있지만, 이번 응답에서는 직접 바꾸지 말고 대화와 메모리 정리에 집중한다.',
    `이름: ${heroSummary?.name || '이름 없는 캐릭터'}`,
    `설명: ${heroSummary?.description || '없음'}`,
    `능력: ${heroSummary?.abilities?.length ? heroSummary.abilities.join(' / ') : '없음'}`,
    `실행용 성격 요약: ${runtimeCache?.personaSummary || '없음'}`,
    `메모리 슬롯 제한: ${HERO_MEMORY_SLOT_MAX}개`,
    `메모리 한 칸 길이 제한: ${HERO_MEMORY_ENTRY_MAX_LENGTH}자`,
    `장기 아카이브 보관 제한: ${HERO_ARCHIVE_MAX}개`,
    '중요한 사실은 메모리로 추가/수정/삭제할 수 있다.',
    '메모리는 대화 전체 복붙이 아니라 짧은 판단 덩어리나 관계, 성향, 중요한 사실만 남긴다.',
    '비슷한 메모리는 합치고, 오래됐거나 덜 중요한 메모리는 정리해도 된다.',
    '최근 대화에서 밀려난 내용은 장기 아카이브 요약으로 남아 있다.',
    '응답은 반드시 JSON 하나만 반환한다.',
    '형식:',
    '{"reply":"유저에게 보일 답변","memoryAction":{"type":"none|add|update|delete","index":0,"text":"메모리 내용"}}',
    `현재 메모리 요약:\n${runtimeCache?.memorySummary || memoryText || '없음'}`,
    `최근 대화 요약:\n${runtimeCache?.recentSummary || recentText || '없음'}`,
    `장기 아카이브 요약:\n${runtimeCache?.archiveSummary || archiveText || '없음'}`,
    `유저 입력:\n${userInput}`,
  ].join('\n\n');
}
