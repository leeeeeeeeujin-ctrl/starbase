import { computeSessionScore, applyScoreDelta } from '@/lib/rank/scoring';

describe('scoring utils', () => {
  test('computeSessionScore basic', () => {
    expect(computeSessionScore({ wins: 3, winPoint: 10, lossPenalty: 5 })).toBe(25);
  });

  test('win cap applied', () => {
    expect(computeSessionScore({ wins: 10, winPoint: 5, winCap: 3, lossPenalty: 0 })).toBe(15);
  });

  test('floor/ceiling applied', () => {
    expect(computeSessionScore({ wins: 1, winPoint: 3, lossPenalty: 10, floor: -4 })).toBe(-4);
    expect(
      computeSessionScore({ wins: 10, winPoint: 5, lossPenalty: 0, winCap: 10, ceiling: 40 })
    ).toBe(40);
  });

  test('applyScoreDelta with bounds', () => {
    expect(applyScoreDelta(1000, 50)).toBe(1050);
    expect(applyScoreDelta(1000, -200, { floor: 900 })).toBe(900);
    expect(applyScoreDelta(1000, 200, { ceiling: 1100 })).toBe(1100);
  });
});
