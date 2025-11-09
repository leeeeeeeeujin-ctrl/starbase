import { buildBattleLogDraft } from '@/components/rank/StartClient/engine/battleLogBuilder';
import { createDropInQueueService } from '@/components/rank/StartClient/services/dropInQueueService';

describe('buildBattleLogDraft', () => {
  it('normalizes logs, history, participants, and timeline metadata', () => {
    const participants = [
      {
        id: 'p1',
        owner_id: 'owner-1',
        role: 'leader',
        status: 'active',
        score: 1200,
        hero: { id: 'h1', name: '주역', description: '용사' },
      },
      {
        id: 'p2',
        owner_id: 'owner-2',
        role: 'support',
        status: 'spectating',
        score: 900,
        hero: { id: 'h2', name: '조력자' },
      },
    ];

    const draft = buildBattleLogDraft({
      gameId: 'game-1',
      sessionId: 'session-1',
      gameName: '테스트 게임',
      result: 'win',
      reason: 'victory',
      winCount: 2,
      endTurn: 3,
      logs: [
        {
          turn: 1,
          nodeId: 'node-1',
          slotIndex: 0,
          promptAudience: { audience: 'slots', slots: [0, 1] },
          responseAudience: { audience: 'all' },
          prompt: '첫 턴 프롬프트',
          response: '주역의 응답\n...\n승리 선언',
          outcome: '승리 선언',
          variables: ['게임종료'],
          next: 'node-2',
          action: 'win',
          actors: ['주역'],
          summary: { preview: '주역의 응답' },
        },
      ],
      historyEntries: [
        {
          role: 'system',
          content: '[PROMPT]\n첫 턴 프롬프트',
          public: false,
          includeInAi: true,
          audience: 'slots',
          slots: [0, 1],
          meta: { slotIndex: 0 },
        },
        {
          role: 'assistant',
          content: '주역의 응답',
          public: true,
          includeInAi: true,
          audience: 'all',
          slots: [],
          meta: { slotIndex: 0, actors: ['주역'] },
        },
      ],
      timelineEvents: [
        {
          type: 'drop_in_joined',
          ownerId: 'owner-2',
          turn: 1,
          timestamp: Date.now(),
          context: { role: 'support', heroName: '조력자' },
        },
      ],
      participants,
      realtimePresence: {
        entries: [
          { ownerId: 'owner-1', status: 'active', inactivityStrikes: 0, managed: true },
          { ownerId: 'owner-2', status: 'proxy', proxiedAtTurn: 2, managed: false },
        ],
      },
      dropInSnapshot: {
        turn: 1,
        roles: [
          {
            role: 'leader',
            totalArrivals: 1,
            replacements: 0,
            lastArrivalTurn: 1,
            activeOwnerId: 'owner-1',
          },
          {
            role: 'support',
            totalArrivals: 1,
            replacements: 0,
            lastArrivalTurn: 1,
            activeOwnerId: 'owner-2',
          },
        ],
      },
    });

    expect(draft.meta.gameId).toBe('game-1');
    expect(draft.meta.result).toBe('win');
    expect(draft.turns).toHaveLength(1);
    expect(draft.turns[0].prompt.audience).toEqual({ type: 'slots', slots: [0, 1] });
    expect(draft.turns[0].actor).toMatchObject({ heroName: '주역', role: 'leader' });
    expect(draft.history).toHaveLength(2);
    expect(draft.timeline[0].type).toBe('drop_in_joined');
    expect(draft.participants[1].presence?.proxiedAtTurn).toBe(2);
    expect(draft.participants[1].status).toBe('proxy');
  });

  it('annotates drop-in replacements from queue snapshot', () => {
    const queue = createDropInQueueService();
    const initial = [
      {
        id: 'p-initial',
        owner_id: 'owner-alpha',
        role: 'vanguard',
        status: 'active',
        hero: { id: 'hero-alpha', name: '선봉대' },
      },
    ];
    queue.syncParticipants(initial, { turnNumber: 1, mode: 'realtime' });

    const replaced = [
      {
        id: 'p-replacement',
        owner_id: 'owner-beta',
        role: 'vanguard',
        status: 'active',
        hero: { id: 'hero-beta', name: '난입자' },
      },
    ];
    const queueResult = queue.syncParticipants(replaced, { turnNumber: 2, mode: 'realtime' });

    const draft = buildBattleLogDraft({
      participants: replaced,
      logs: [],
      historyEntries: [],
      timelineEvents: [],
      dropInSnapshot: queueResult.snapshot,
    });

    expect(draft.meta.dropIn?.roles?.[0]?.replacements).toBe(1);
    expect(draft.participants[0].dropIn).toMatchObject({ replacements: 1, role: 'vanguard' });
  });
});
