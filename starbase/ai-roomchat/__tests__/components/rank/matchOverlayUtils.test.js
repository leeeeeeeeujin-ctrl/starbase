import { buildMatchOverlaySummary } from '../../../components/rank/matchOverlayUtils';

describe('buildMatchOverlaySummary', () => {
  it('groups members by individual slot roles', () => {
    const assignments = [
      {
        role: '공격 · 수비',
        roleSlots: [
          {
            role: '공격',
            members: [{ id: 'queue-1', hero_id: 'hero-a', owner_id: 'owner-a' }],
          },
          {
            role: '수비',
            members: [{ id: 'queue-2', hero_id: 'hero-b', owner_id: 'owner-b' }],
          },
        ],
      },
    ];

    const heroMap = new Map([
      ['hero-a', { name: '전사' }],
      ['hero-b', { name: '수호자' }],
    ]);

    const roleSummaries = [
      { role: '공격', filled: 1, missing: 0, total: 1 },
      { role: '수비', filled: 1, missing: 0, total: 1 },
    ];

    const summary = buildMatchOverlaySummary({
      assignments,
      heroMap,
      roleSummaries,
    });

    expect(summary).toHaveLength(2);
    expect(summary[0].role).toBe('공격');
    expect(summary[0].members).toHaveLength(1);
    expect(summary[0].members[0].label).toContain('전사');
    expect(summary[1].role).toBe('수비');
    expect(summary[1].members[0].label).toContain('수호자');
  });

  it('preserves missing slot counts from role summaries', () => {
    const assignments = [
      {
        role: '지원',
        roleSlots: [
          {
            role: '지원',
            members: [{ id: 'queue-3', hero_id: 'hero-c', owner_id: 'owner-c' }],
          },
        ],
      },
    ];

    const heroMap = new Map([['hero-c', { name: '힐러' }]]);

    const roleSummaries = [{ role: '지원', filled: 1, missing: 2, total: 3 }];

    const summary = buildMatchOverlaySummary({
      assignments,
      heroMap,
      roleSummaries,
    });

    expect(summary).toHaveLength(1);
    expect(summary[0].role).toBe('지원');
    expect(summary[0].members).toHaveLength(1);
    expect(summary[0].missing).toBe(2);
    expect(summary[0].total).toBe(3);
  });

  it('falls back to room slots when assignments are empty', () => {
    const rooms = [
      {
        slots: [
          {
            role: '공격',
            member: { id: 'queue-4', hero_id: 'hero-d', owner_id: 'owner-d' },
          },
        ],
      },
    ];

    const heroMap = new Map([['hero-d', { name: '검객' }]]);

    const summary = buildMatchOverlaySummary({
      assignments: [],
      heroMap,
      roleSummaries: [],
      rooms,
    });

    expect(summary).toHaveLength(1);
    expect(summary[0].role).toBe('공격');
    expect(summary[0].members[0].label).toContain('검객');
  });
});
