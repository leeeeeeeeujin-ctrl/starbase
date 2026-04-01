import { buildHeroGameContext } from '../characters/agentContext';
import { getTurnScopeParticipants } from './session';

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
  const runtimePrompt = [
    agentContexts.length ? '아래는 현재 턴에 참여하는 캐릭터 AI들의 실행 문맥이다.' : '',
    ...agentContexts.map(entry => `[${entry.name}]\n${entry.context}`),
    turn?.promptTemplate || '',
  ]
    .filter(Boolean)
    .join('\n\n----------------\n\n');

  return {
    agentContexts,
    runtimePrompt,
  };
}
