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
  const resultContract = [
    '응답은 가능하면 JSON 하나로 반환한다.',
    '형식:',
    '{"reply":"서술","gameResult":"ongoing|ended|abandoned|timed_out","teamOutcomes":{"팀명":"win|lose"},"participantOutcomes":{"참가자ID":"survived|eliminated|retired"}}',
    '아직 전투가 끝나지 않았다면 gameResult는 "ongoing"로 둔다.',
    '전투가 끝났다면 반드시 누가 승리했고 누가 패배했는지 teamOutcomes 또는 participantOutcomes 중 하나 이상으로 명확히 적는다.',
    '개인 결과는 보통 survived, eliminated, retired 중 하나를 쓴다.',
    '게임이 유야무야 끝났다면 gameResult를 "abandoned" 또는 "timed_out"으로 두고 승패를 억지로 만들지 않는다.',
    '승패는 현재 게임 규칙, 장면, 누적된 상태값을 기준으로 판단하고, 확정되지 않았다면 ongoing을 유지한다.',
    '중요: 승패와 종료 상태는 reply 문장 속에만 쓰지 말고 반드시 JSON 필드(gameResult, teamOutcomes, participantOutcomes)에 따로 적는다.',
    '이름, 설명, 능력 문구에 있는 단어를 근거로 승패를 판정하지 말고 현재 전투 결과만 기준으로 적는다.',
  ].join('\n');
  const runtimePrompt = [
    agentContexts.length ? '아래는 현재 턴에 참여하는 캐릭터 AI들의 실행 문맥이다.' : '',
    ...agentContexts.map(entry => `[${entry.name}]\n${entry.context}`),
    turn?.promptTemplate || '',
    resultContract,
  ]
    .filter(Boolean)
    .join('\n\n----------------\n\n');

  return {
    agentContexts,
    runtimePrompt,
  };
}
