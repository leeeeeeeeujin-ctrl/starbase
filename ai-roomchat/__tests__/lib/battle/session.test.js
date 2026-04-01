const {
  buildTurnPromptContext,
  createBattleSession,
  getCurrentTurn,
  getTurnScopeParticipants,
  resolveTurnActorId,
  submitBattleTurn,
} = require('../../../lib/battle/session');

describe('battle session runtime', () => {
  const participants = [
    {
      id: 'hero-1',
      ownerId: 'hero-1',
      team: 'blue',
      role: 'captain',
      name: '주인공',
      meta: { description: '주요 캐릭터', abilities: ['slash', 'guard'] },
    },
    {
      id: 'hero-2',
      ownerId: 'hero-2',
      team: 'red',
      role: 'challenger',
      name: '라이벌',
      meta: { description: '상대 캐릭터', abilities: ['counter'] },
    },
    {
      id: 'hero-3',
      ownerId: 'hero-3',
      team: 'blue',
      role: 'support',
      name: '조력자',
      meta: { description: '같은 팀', abilities: ['heal'] },
    },
  ];

  function createDefinition() {
    return {
      version: 1,
      id: 'battle-1',
      entryTurnId: 'turn-start',
      turns: [
        {
          id: 'turn-start',
          title: '첫 행동',
          kind: 'user',
          display: '어떻게 행동할지 정합니다.',
          promptTemplate: '행동을 선택한다.',
          input: {
            mode: 'text',
            label: '행동',
            placeholder: '',
            resultKey: 'action_choice',
          },
          participantScope: ['self', 'enemies'],
        },
        {
          id: 'turn-counter',
          title: '상대 반응',
          kind: 'ai',
          display: '상대가 반응합니다.',
          execution: {
            actorScope: 'enemies',
          },
          promptTemplate: '상대는 {{values.action_choice}} 에 반응한다.',
          input: {
            mode: 'none',
            label: '',
            placeholder: '',
            resultKey: '',
          },
          participantScope: ['self', 'allies'],
        },
        {
          id: 'turn-support',
          title: '지원 행동',
          kind: 'system',
          display: '아군이 개입합니다.',
          execution: {
            actorScope: 'role:support',
          },
          promptTemplate: '지원',
          input: {
            mode: 'none',
            label: '',
            placeholder: '',
            resultKey: '',
          },
          participantScope: ['allies'],
        },
      ],
      transitions: [
        {
          id: 'edge-1',
          from: 'turn-start',
          to: 'turn-counter',
          conditions: [{ key: 'action_choice', equals: 'attack' }],
          priority: 10,
          fallback: false,
          triggerWords: [],
        },
        {
          id: 'edge-2',
          from: 'turn-start',
          to: 'turn-support',
          conditions: [],
          priority: 0,
          fallback: true,
          triggerWords: [],
        },
        {
          id: 'edge-3',
          from: 'turn-counter',
          to: 'turn-support',
          conditions: [],
          priority: 0,
          fallback: true,
          triggerWords: [],
        },
      ],
    };
  }

  test('stores input under resultKey and follows matching branch', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'hero-1',
      sessionId: 'session-1',
    });

    expect(getCurrentTurn(session).id).toBe('turn-start');

    const next = submitBattleTurn(session, {
      actorId: 'hero-1',
      input: 'attack',
    });

    expect(next.values.action_choice).toBe('attack');
    expect(next.currentTurnId).toBe('turn-counter');
    expect(next.turnIndex).toBe(1);
    expect(next.logs).toHaveLength(1);
    expect(next.logs[0].input).toBe('attack');
  });

  test('falls back when no condition matches', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'hero-1',
    });

    const next = submitBattleTurn(session, {
      actorId: 'hero-1',
      input: 'wait',
    });

    expect(next.values.action_choice).toBe('wait');
    expect(next.currentTurnId).toBe('turn-support');
    expect(next.status).toBe('running');
  });

  test('returns scoped participants for current actor and turn', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'hero-1',
    });

    const scoped = getTurnScopeParticipants(session);

    expect(scoped.map(entry => entry.id)).toEqual(['hero-1', 'hero-2']);
  });

  test('builds prompt context with current values and scoped participants', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'hero-1',
      values: { phase: 'opening' },
    });

    const context = buildTurnPromptContext(session);

    expect(context.sessionId).toBe(session.id);
    expect(context.actorId).toBe('hero-1');
    expect(context.values.phase).toBe('opening');
    expect(context.scopedParticipants.map(entry => entry.id)).toEqual(['hero-1', 'hero-2']);
  });

  test('resolves actor by turn execution scope', () => {
    const session = createBattleSession({
      definition: createDefinition(),
      participants,
      actorId: 'hero-1',
      sessionId: 'session-1',
    });

    const next = submitBattleTurn(session, {
      actorId: 'hero-1',
      input: 'attack',
    });

    expect(next.currentTurnId).toBe('turn-counter');
    expect(next.actorId).toBe('hero-2');

    const supportTurn = next.definition.turnMap.get('turn-support');
    expect(resolveTurnActorId(next, supportTurn, next.actorId)).toBe('hero-3');
  });

  test('marks session completed when there is no next transition', () => {
    const definition = createDefinition();
    definition.transitions = [];

    const session = createBattleSession({
      definition,
      participants,
      actorId: 'hero-1',
    });

    const next = submitBattleTurn(session, {
      actorId: 'hero-1',
      input: 'attack',
    });

    expect(next.currentTurnId).toBe('');
    expect(next.status).toBe('completed');
    expect(next.logs).toHaveLength(1);
  });
});
