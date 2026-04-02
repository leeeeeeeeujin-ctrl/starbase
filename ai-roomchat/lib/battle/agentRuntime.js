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
  const resultContract = [
    '[출력 계약: 이 아래 규칙이 최우선이다]',
    '턴 프롬프트 안에 서술 요청이나 문체 요청이 있더라도, 출력 형식은 반드시 이 계약을 따른다.',
    '게임 프롬프트는 장면 내용과 분위기를 지시하는 것이고, 출력 형식은 이 계약이 결정한다.',
    '응답은 JSON 하나로 반환한다.',
    '형식:',
    '{"reply":"서술","segments":[{"type":"dialogue|narration|effect|sceneCue","speaker":"참가자ID 또는 이름","placement":"left|right|center","text":"표시 문장","title":"장면 카드 제목","subtitle":"장면 카드 부제","delivery":"calm|urgent|hesitant|angry"}],"gameResult":"ongoing|ended|abandoned|timed_out","teamOutcomes":{"팀명":"win|lose"},"participantOutcomes":{"참가자ID":"survived|eliminated|retired"}}',
    '이 응답은 JRPG/비주얼 노벨식 대화 연출에 바로 쓰인다.',
    '플레이어는 화면을 탭해서 한 호흡씩 넘기므로, 반드시 segments를 함께 제공하고 장면의 호흡에 맞게 자연스럽게 나눈다.',
    '중요: 한 턴 전체를 한 문장으로 끝내지 말고, 한 턴 안에 여러 segments를 연속으로 넣어 하나의 짧은 장면이 진행되게 한다.',
    '글자 수로 기계적으로 자르지 말고, 플레이어가 한 번에 읽고 넘기기 좋은 단위로 서술과 대사를 분리한다.',
    'dialogue는 캐릭터의 한 번의 발화, narration은 장면을 보조하는 서술, effect는 짧은 감정/행동 효과, sceneCue는 장소/인물/BGM 전환 카드에 쓴다.',
    'sceneCue는 title, subtitle을 채우고 text는 비워도 된다.',
    '긴 문단 하나로 끝내지 말고, 서술 -> 반응 -> 대사 -> 효과 같은 식으로 장면이 진행되는 순서대로 여러 세그먼트로 나눈다.',
    '보통 한 턴에는 3개 이상, 필요하면 그보다 더 많은 segments를 사용해도 된다.',
    'dialogue에는 대사만 담고, narration에는 대사가 아닌 장면 묘사만 담는다. 둘을 한 세그먼트에 섞지 않는다.',
    '놀람, 침묵, 시선 이동, 등장 같은 짧은 변화는 effect나 짧은 narration으로 따로 둔다.',
    '장소가 바뀌거나 특정 인물의 존재감, 별칭, BGM 전환을 강조하고 싶다면 sceneCue를 쓴다.',
    '각 세그먼트는 한 번의 탭으로 자연스럽게 소비되는 장면 단위라고 생각하고 작성한다.',
    '즉, "한 턴 = 한 세그먼트"가 아니라 "한 턴 = 여러 세그먼트로 이루어진 짧은 장면"으로 작성한다.',
    '아직 전투가 끝나지 않았다면 gameResult는 "ongoing"로 둔다.',
    '전투가 끝났다면 반드시 누가 승리했고 누가 패배했는지 teamOutcomes 또는 participantOutcomes 중 하나 이상으로 명확히 적는다.',
    '개인 결과는 보통 survived, eliminated, retired 중 하나를 쓴다.',
    teamGuide,
    participantGuide,
    'teamOutcomes의 키에 "팀 1"처럼 접두사를 붙이지 말고 실제 값 그대로 쓴다.',
    'participantOutcomes의 키에 표시 이름만 쓰지 말고 반드시 참가자 id를 쓴다.',
    '게임이 유야무야 끝났다면 gameResult를 "abandoned" 또는 "timed_out"으로 두고 승패를 억지로 만들지 않는다.',
    '승패는 현재 게임 규칙, 장면, 누적된 상태값을 기준으로 판단하고, 확정되지 않았다면 ongoing을 유지한다.',
    '중요: 승패와 종료 상태는 reply 문장 속에만 쓰지 말고 반드시 JSON 필드(gameResult, teamOutcomes, participantOutcomes)에 따로 적는다.',
    '이름, 설명, 능력 문구에 있는 단어를 근거로 승패를 판정하지 말고 현재 전투 결과만 기준으로 적는다.',
    'segments가 없으면 이 응답은 실패로 간주된다.',
  ].join('\n');
  const actorGuide = agentContexts.length
    ? `이번 턴에 실제로 장면에 등장시킬 수 있는 인물: ${agentContexts
        .map(entry => `${entry.id} (${entry.name})`)
        .join(', ')}`
    : '';
  const contentDirectives = [
    '[장면 작성 규칙]',
    '아래 게임 프롬프트를 그대로 되풀이하지 말고, 그것을 바탕으로 실제 장면을 구성한다.',
    '장면은 JRPG 컷신처럼 진행한다. 배경 소개, 인물 등장, 반응, 대사, 분위기 변화를 순서 있게 배치한다.',
    '한 턴은 "짧은 장면 하나"이며, 여러 segments로 나뉘어 자연스럽게 이어져야 한다.',
    '특정 인물의 존재감이나 장소 분위기가 바뀌면 sceneCue를 적극적으로 사용한다.',
    'dialogue는 실제 발화만 넣고, narration은 화면에 보이는 상황과 감정선을 보조한다.',
    'effect는 놀람, 침묵, 시선 이동, 자세 변화처럼 짧은 연출에만 사용한다.',
    '플레이어가 탭하며 읽는 화면을 상상하고, 한 번에 한 호흡씩 보이도록 장면을 끊는다.',
    '메이커 프롬프트가 짧거나 거칠어도, 실제 출력은 완성된 장면처럼 보이게 보강한다.',
    '단, 승패/종료 여부는 현재 장면에서 확정된 내용만 JSON 필드에 적는다.',
    actorGuide,
  ]
    .filter(Boolean)
    .join('\n');
  const gamePromptGuide = [
    '[게임 프롬프트: 아래는 장면 내용 지시다]',
    '아래 내용을 따라 장면을 쓰되, 출력은 위의 JSON 계약과 segments 규칙을 반드시 유지한다.',
    contentDirectives,
    turn?.promptTemplate || '',
  ]
    .filter(Boolean)
    .join('\n');
  const runtimePrompt = [
    resultContract,
    agentContexts.length ? '아래는 현재 턴에 참여하는 캐릭터 AI들의 실행 문맥이다.' : '',
    ...agentContexts.map(entry => `[${entry.name}]\n${entry.context}`),
    gamePromptGuide,
  ]
    .filter(Boolean)
    .join('\n\n----------------\n\n');

  return {
    agentContexts,
    runtimePrompt,
  };
}
