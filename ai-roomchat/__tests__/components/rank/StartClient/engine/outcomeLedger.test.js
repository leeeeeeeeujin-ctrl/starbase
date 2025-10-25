import {
  createOutcomeLedger,
  recordOutcomeLedger,
  buildOutcomeSnapshot,
  parseResultAssignments,
} from '@/components/rank/StartClient/engine/outcomeLedger';

describe('outcomeLedger.parseResultAssignments', () => {
  it('extracts hero names and statuses from result line', () => {
    const result = parseResultAssignments('철수 승리 / 영희 탈락, 민수 패배');
    expect(result).toEqual([
      { heroName: '철수', status: 'won' },
      { heroName: '영희', status: 'eliminated' },
      { heroName: '민수', status: 'lost' },
    ]);
  });

  it('falls back to actors when no hero name present', () => {
    const result = parseResultAssignments('승리 선언', ['단독 주역']);
    expect(result).toEqual([{ heroName: '단독 주역', status: 'won' }]);
  });

  it('ignores draw outcomes', () => {
    const result = parseResultAssignments('무승부', ['참가자']);
    expect(result).toEqual([]);
  });
});

describe('outcomeLedger recordOutcomeLedger', () => {
  const participants = [
    {
      id: 'p1',
      hero: { id: 'h1', name: '철수' },
      role: '공격',
      score: 1200,
      slotIndex: 0,
    },
    {
      id: 'p2',
      hero: { id: 'h2', name: '영희' },
      role: '수비',
      score: 1100,
      slotIndex: 1,
    },
  ];

  it('updates ledger entries with wins and losses', () => {
    const ledger = createOutcomeLedger({ participants });
    const record = recordOutcomeLedger(ledger, {
      turn: 3,
      resultLine: '철수 승리 / 영희 탈락',
      variables: ['GAME_END'],
      actors: ['철수', '영희'],
      participantsSnapshot: participants,
      brawlEnabled: false,
    });

    expect(record.changed).toBe(true);
    const snapshot = buildOutcomeSnapshot(ledger);
    expect(snapshot.entries.find(entry => entry.heroName === '철수')).toMatchObject({
      wins: 1,
      result: 'won',
      scoreDelta: expect.any(Number),
    });
    expect(snapshot.entries.find(entry => entry.heroName === '영희')).toMatchObject({
      losses: 1,
      eliminated: true,
      result: 'eliminated',
      scoreDelta: expect.any(Number),
    });
    expect(snapshot.lastVariables).toEqual(['GAME_END']);
    expect(snapshot.completed).toBe(true);
  });
});
