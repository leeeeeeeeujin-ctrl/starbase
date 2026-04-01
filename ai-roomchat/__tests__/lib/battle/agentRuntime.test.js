const {
  buildHeroSummaryFromParticipant,
  buildParticipantPrompt,
  buildRuntimePromptFromTurn,
  buildTurnAgentContexts,
} = require('../../../lib/battle/agentRuntime');
const { createBattleSession } = require('../../../lib/battle/session');

describe('battle agent runtime', () => {
  const participants = [
    {
      id: 'participant-1',
      ownerId: 'owner-1',
      heroId: 'hero-1',
      team: 'blue',
      role: 'leader',
      name: '아린',
      meta: {
        description: '냉정한 검사',
        abilities: ['베기', '반격'],
        agent_profile: {
          systemPrompt: '침착하게 판단한다.',
          runtimeCache: {
            gameSummary: '전투에서는 관찰 후 반격하는 경향이 있다.',
          },
        },
      },
    },
    {
      id: 'participant-2',
      ownerId: 'owner-2',
      heroId: 'hero-2',
      team: 'red',
      role: 'rival',
      name: '세린',
      meta: {
        description: '거침없는 도전자',
        abilities: ['돌진'],
        agent_profile: {
          runtimeCache: {
            gameSummary: '상대를 밀어붙이는 공격적 성향이다.',
          },
        },
      },
    },
  ];

  function createDefinition() {
    return {
      version: 1,
      id: 'battle-1',
      entryTurnId: 'turn-1',
      turns: [
        {
          id: 'turn-1',
          title: '첫 대치',
          kind: 'ai',
          display: '서로를 마주본다.',
          promptTemplate: '지금 상황에서 각자 어떻게 움직일지 판단하라.',
          input: { mode: 'none', resultKey: '' },
          participantScope: ['all'],
        },
      ],
      transitions: [],
    };
  }

  test('builds hero summary from participant meta', () => {
    const summary = buildHeroSummaryFromParticipant(participants[0]);
    expect(summary.name).toBe('아린');
    expect(summary.description).toBe('냉정한 검사');
    expect(summary.abilities).toEqual(['베기', '반격']);
  });

  test('builds participant prompt excluding current participant', () => {
    const prompt = buildParticipantPrompt(participants[0], participants);
    expect(prompt).toContain('세린');
    expect(prompt).toContain('도전자');
    expect(prompt).not.toContain('아린 |');
  });

  test('builds per-participant game contexts for current turn', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'participant-1',
      sessionId: 'session-1',
    });

    const turn = session.definition.turnMap.get('turn-1');
    const contexts = buildTurnAgentContexts(session, turn, session.actorId);

    expect(contexts).toHaveLength(2);
    expect(contexts[0].context).toContain('너는 캐릭터 "아린"이다.');
    expect(contexts[0].context).toContain('전투에서는 관찰 후 반격하는 경향이 있다.');
    expect(contexts[1].context).toContain('세린');
  });

  test('combines agent contexts into runtime prompt', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'participant-1',
    });
    const turn = session.definition.turnMap.get('turn-1');
    const runtime = buildRuntimePromptFromTurn(session, turn, session.actorId);

    expect(runtime.agentContexts).toHaveLength(2);
    expect(runtime.runtimePrompt).toContain('[아린]');
    expect(runtime.runtimePrompt).toContain('[세린]');
    expect(runtime.runtimePrompt).toContain('지금 상황에서 각자 어떻게 움직일지 판단하라.');
  });
});
