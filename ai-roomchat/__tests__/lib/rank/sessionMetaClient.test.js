import { buildSessionMetaRequest } from '@/lib/rank/sessionMetaClient';

describe('buildSessionMetaRequest', () => {
  it('includes sanitized drop-in metadata in turn state events', () => {
    const now = Date.now();
    const { turnStateEvent, turnStateSignature } = buildSessionMetaRequest({
      state: {
        sessionMeta: {
          turnState: {
            turnNumber: 3,
            deadline: now + 60000,
            remainingSeconds: 45,
            dropInBonusSeconds: 30,
            dropInBonusAppliedAt: now,
            updatedAt: now,
            status: 'active',
          },
          dropIn: {
            status: 'BONUS_APPLIED ',
            bonusSeconds: 30,
            appliedAt: now,
            turnNumber: 3,
            arrivals: [
              {
                ownerId: ' owner-1 ',
                role: ' 딜러 ',
                heroName: ' 기사 ',
                slotIndex: '2',
                stats: { queueDepth: 1, replacements: 2, arrivalOrder: 5 },
                timestamp: now,
                replaced: { ownerId: ' prev-1 ', heroName: ' 지원 ' },
              },
            ],
          },
        },
        room: { realtimeMode: 'standard' },
      },
    });

    expect(turnStateEvent?.extras?.dropInBonusSeconds).toBe(30);
    expect(turnStateEvent?.extras?.dropIn).toMatchObject({
      status: 'BONUS_APPLIED',
      bonusSeconds: 30,
      arrivals: [
        expect.objectContaining({
          ownerId: 'owner-1',
          role: '딜러',
          replacedOwnerId: 'prev-1',
        }),
      ],
    });
    expect(turnStateSignature).toContain('"dropIn"');
  });

  it('passes extras from session meta into the meta payload', () => {
    const { metaPayload } = buildSessionMetaRequest({
      state: {
        sessionMeta: {
          extras: {
            betaFeature: true,
            nested: { difficulty: 'hard' },
          },
        },
      },
    });

    expect(metaPayload?.extras).toEqual({ betaFeature: true, nested: { difficulty: 'hard' } });
  });
});
