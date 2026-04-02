import { buildHeroGameContext } from '../characters/agentContext.js';
import { getTurnScopeParticipants } from './session.js';

export function buildHeroSummaryFromParticipant(participant = {}) {
  const meta = participant?.meta && typeof participant.meta === 'object' ? participant.meta : {};
  const abilities = Array.isArray(meta.abilities)
    ? meta.abilities
    : Array.from({ length: 12 }, (_, index) => meta[`ability${index + 1}`]).filter(Boolean);

  return {
    name: participant?.name || participant?.id || '이름 없는 캐릭터',
    description: meta.description || '',
    abilities,
  };
}

export function buildProfileFromParticipant(participant = {}) {
  const meta = participant?.meta && typeof participant.meta === 'object' ? participant.meta : {};
  const profile =
    meta.agent_profile && typeof meta.agent_profile === 'object'
      ? meta.agent_profile
      : meta.agentProfile && typeof meta.agentProfile === 'object'
        ? meta.agentProfile
        : meta;

  return {
    systemPrompt: profile.systemPrompt || '',
    speakingStyle: profile.speakingStyle || '',
    behaviorRules: profile.behaviorRules || '',
    memories: Array.isArray(profile.memories) ? profile.memories : [],
    recentChats: Array.isArray(profile.recentChats) ? profile.recentChats : [],
    archives: Array.isArray(profile.archives) ? profile.archives : [],
    runtimeCache:
      profile.runtimeCache && typeof profile.runtimeCache === 'object' ? profile.runtimeCache : {},
  };
}

export function buildParticipantPrompt(participant, allParticipants = []) {
  return (Array.isArray(allParticipants) ? allParticipants : [])
    .filter(entry => entry?.id !== participant?.id)
    .map(entry => {
      const summary = buildHeroSummaryFromParticipant(entry);
      return [
        summary.name,
        entry?.team ? `팀 ${entry.team}` : '',
        entry?.role ? `역할 ${entry.role}` : '',
        summary.description ? `설명: ${summary.description}` : '',
        summary.abilities?.length ? `능력: ${summary.abilities.join(' / ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

export function buildTurnAgentContexts(session, turn, actorId = session?.actorId) {
  const participants = Array.isArray(session?.participants?.list)
    ? session.participants.list
    : Array.isArray(session?.participants)
      ? session.participants
      : [];
  const scopedParticipants = getTurnScopeParticipants(session, turn, actorId);
  const targets = scopedParticipants.length ? scopedParticipants : participants;
  const gamePrompt = [turn?.display || '', turn?.promptTemplate || ''].filter(Boolean).join('\n\n');

  return targets.map(participant => ({
    id: participant.id,
    name: participant.name,
    heroId: participant.heroId || participant.meta?.hero_id || null,
    context: buildHeroGameContext({
      heroSummary: buildHeroSummaryFromParticipant(participant),
      profile: buildProfileFromParticipant(participant),
      gamePrompt,
      participantPrompt: buildParticipantPrompt(participant, participants),
    }),
  }));
}

export function buildRuntimePromptFromTurn(session, turn, actorId = session?.actorId) {
  const agentContexts = buildTurnAgentContexts(session, turn, actorId);
  const participants = Array.isArray(session?.participants?.list)
    ? session.participants.list
    : Array.isArray(session?.participants)
      ? session.participants
      : [];
  const teamKeys = Array.from(
    new Set(
      participants
        .map(participant => String(participant?.team || '').trim())
        .filter(Boolean)
    )
  );
  const participantKeys = participants
    .map(participant => {
      const id = String(participant?.id || '').trim();
      if (!id) return null;
      const name = String(participant?.name || participant?.heroName || id).trim();
      return `${id}${name && name !== id ? ` (${name})` : ''}`;
    })
    .filter(Boolean);
  const teamGuide = teamKeys.length
    ? `teamOutcomes의 키는 반드시 다음 팀값만 사용한다: ${teamKeys.join(', ')}`
    : 'teamOutcomes는 실제 세션 팀값만 키로 사용한다.';
  const participantGuide = participantKeys.length
    ? `participantOutcomes의 키는 반드시 다음 참가자 id만 사용한다: ${participantKeys.join(', ')}`
    : 'participantOutcomes의 키는 반드시 실제 참가자 id를 사용한다.';
  const actorGuide = agentContexts.length
    ? `이번 턴에 실제로 장면에 등장시킬 수 있는 인물: ${agentContexts
        .map(entry => `${entry.id} (${entry.name})`)
        .join(', ')}`
    : '';
  const outputContract = [
    '[출력 계약]',
    '응답은 JSON 하나만 반환한다.',
    '형식:',
    '{"reply":"장면 본문","gameResult":"ongoing|ended|abandoned|timed_out","teamOutcomes":{"팀값":"win|lose"},"participantOutcomes":{"참가자ID":"survived|eliminated|retired"}}',
    'reply에는 이번 턴의 장면 전체를 자연스럽게 쓴다.',
    '승패가 아직 확정되지 않았다면 gameResult는 "ongoing"로 두고 결과 객체를 비워도 된다.',
    '이번 턴에서 승패가 확정됐다면 teamOutcomes 또는 participantOutcomes 중 하나 이상을 반드시 채운다.',
    '팀 키에 접두사(예: "팀 1")를 붙이지 않는다.',
    'participantOutcomes의 키는 반드시 실제 참가자 id를 사용한다.',
    teamGuide,
    participantGuide,
  ]
    .filter(Boolean)
    .join('\n');
  const contentDirectives = [
    '[장면 작성 규칙]',
    '아래 게임 프롬프트를 되풀이하지 말고 실제 장면으로 풀어 쓴다.',
    '장면은 JRPG 컷신처럼 진행한다. 배경 소개, 인물 등장, 반응, 대사, 분위기 변화를 순서 있게 배치한다.',
    '플레이어가 탭하며 읽는 화면을 상상하고, 한 번에 한 호흡씩 보이도록 장면을 끊는다.',
    '메이커 프롬프트가 짧거나 거칠어도 실제 출력은 완성된 장면처럼 보이게 보강한다.',
    '이번 단계에서는 segments를 만들지 말고 장면 원문(reply)과 필요할 경우 승패 JSON만 함께 정한다.',
    actorGuide,
  ]
    .filter(Boolean)
    .join('\n');
  const gamePromptGuide = [
    '[게임 프롬프트: 아래는 장면 내용 지시다]',
    contentDirectives,
    turn?.promptTemplate || '',
  ]
    .filter(Boolean)
    .join('\n');
  const runtimePrompt = [
    outputContract,
    agentContexts.length ? '아래는 현재 턴에 참여하는 캐릭터 AI들의 실행 문맥이다.' : '',
    ...agentContexts.map(entry => `[${entry.name}]\n${entry.context}`),
    gamePromptGuide,
  ]
    .filter(Boolean)
    .join('\n\n----------------\n\n');

  return {
    agentContexts,
    runtimePrompt,
    teamGuide,
    participantGuide,
    actorGuide,
  };
}

export function buildSegmentPromptFromScene(sceneText, runtime = {}) {
  const text = typeof sceneText === 'string' ? sceneText.trim() : '';
  const participantGuide = runtime?.participantGuide || 'participantOutcomes의 키는 실제 참가자 id를 사용한다.';
  const actorGuide = runtime?.actorGuide || '';
  return [
    '[세그먼트 변환 계약]',
    '아래 장면 본문을 JRPG/비주얼 노벨식 화면에 맞는 JSON 하나로 재구성한다.',
    '응답은 JSON 하나만 반환한다.',
    '형식:',
    '{"reply":"장면 전체 요약","segments":[{"type":"dialogue|narration|effect|sceneCue","speaker":"참가자ID","placement":"left|right|center","text":"표시 문장","title":"장면 카드 제목","subtitle":"장면 카드 부제","delivery":"calm|urgent|hesitant|angry"}]}',
    'segments는 반드시 필요하다.',
    '한 턴은 여러 segments로 이루어진 짧은 장면이다. 한 문장만 넣지 말고 장면 호흡에 따라 자연스럽게 나눈다.',
    'dialogue는 캐릭터의 발화만, narration은 장면 보조 서술만, effect는 짧은 반응/행동 효과만, sceneCue는 장소·인물·BGM 전환 카드에 사용한다.',
    'sceneCue는 title, subtitle을 채우고 text는 비워도 된다.',
    'reply는 장면 전체를 짧게 요약하고, 실제 화면용 본문은 segments에 모두 반영한다.',
    'speaker가 필요한 경우 참가자 id를 사용한다.',
    participantGuide,
    actorGuide,
    '',
    '[장면 본문]',
    text,
  ]
    .filter(Boolean)
    .join('\n');
}
