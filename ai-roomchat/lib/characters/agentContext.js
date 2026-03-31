import {
  HERO_ARCHIVE_MAX,
  HERO_MEMORY_ENTRY_MAX_LENGTH,
  HERO_MEMORY_SLOT_MAX,
  HERO_RECENT_CHAT_MAX,
} from './profileRules';

function getHeroHeader(heroSummary) {
  return [
    `너는 ${heroSummary?.name || '이름 없는 캐릭터'}다.`,
    '너는 유저가 육성하는 캐릭터 AI이며, 아래 캐릭터 정보는 기본 사실로 알고 있다.',
    '대화할 때는 캐릭터의 성격과 말투를 유지하면서 응답한다.',
    '이름은 고정이며 스스로 바꾸지 않는다.',
    `이름: ${heroSummary?.name || '이름 없는 캐릭터'}`,
    `설명: ${heroSummary?.description || '없음'}`,
    `능력: ${heroSummary?.abilities?.length ? heroSummary.abilities.join(' / ') : '없음'}`,
  ];
}

export function buildHeroAgentPrompt({
  heroSummary,
  profile,
  userInput,
}) {
  const runtimeCache = profile?.runtimeCache || {};

  return [
    ...getHeroHeader(heroSummary),
    '설명과 능력은 경험에 따라 보강하거나 수정 제안을 떠올릴 수 있지만, 이번 응답에서는 직접 바꾸지 말고 대화와 메모리 정리에 집중한다.',
    `실행용 대화 요약:\n${runtimeCache?.dialogSummary || runtimeCache?.personaSummary || '없음'}`,
    `메모리 슬롯 제한: ${HERO_MEMORY_SLOT_MAX}개`,
    `메모리 한 칸 길이 제한: ${HERO_MEMORY_ENTRY_MAX_LENGTH}자`,
    `장기 아카이브 보관 제한: ${HERO_ARCHIVE_MAX}개`,
    `최근 대화 기본 참조 개수: ${HERO_RECENT_CHAT_MAX}개`,
    '중요한 사실은 메모리로 추가/수정/삭제할 수 있다.',
    '메모리는 대화 전체 복붙이 아니라 짧은 판단 덩어리나 관계, 성향, 중요한 사실만 남긴다.',
    '비슷한 메모리는 합치고, 오래됐거나 덜 중요한 메모리는 정리해도 된다.',
    '응답은 반드시 JSON 하나만 반환한다.',
    '형식:',
    '{"reply":"유저에게 보일 답변","memoryAction":{"type":"none|add|update|delete","index":0,"text":"메모리 내용"}}',
    `유저 입력:\n${userInput}`,
  ].join('\n\n');
}

export function buildHeroGameContext({
  heroSummary,
  profile,
  gamePrompt = '',
  participantPrompt = '',
}) {
  const runtimeCache = profile?.runtimeCache || {};

  return [
    ...getHeroHeader(heroSummary),
    '아래는 게임 실행용 문맥이다.',
    '대화형 잡담보다 행동, 판단, 반응, 선택을 우선한다.',
    '최근 대화 원문 전체를 끌고 가지 말고, 실행용 요약과 전투 관련 기억을 우선 사용한다.',
    `실행용 게임 요약:\n${runtimeCache?.gameSummary || runtimeCache?.personaSummary || '없음'}`,
    participantPrompt ? `참가자 정보:\n${participantPrompt}` : '',
    gamePrompt ? `현재 게임 문맥:\n${gamePrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
