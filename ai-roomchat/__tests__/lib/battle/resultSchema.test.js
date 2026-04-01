const {
  parseStructuredBattleResult,
  applyBattleResultToValues,
} = require('../../../lib/battle/resultSchema');

describe('battle result schema', () => {
  test('parses structured JSON result', () => {
    const parsed = parseStructuredBattleResult(
      JSON.stringify({
        reply: '전투가 끝났다.',
        gameResult: 'ended',
        teamOutcomes: { '11': 'win', '22': 'lose' },
        participantOutcomes: {
          'hero-1': 'survived',
          'hero-2': 'eliminated',
        },
      })
    );

    expect(parsed.usedFallback).toBe(false);
    expect(parsed.reply).toBe('전투가 끝났다.');
    expect(parsed.gameResult).toBe('ended');
    expect(parsed.teamOutcomes['11']).toBe('win');
    expect(parsed.participantOutcomes['hero-2']).toBe('eliminated');
  });

  test('falls back to plain text when JSON is invalid', () => {
    const parsed = parseStructuredBattleResult('그는 침묵했다.');

    expect(parsed.usedFallback).toBe(true);
    expect(parsed.reply).toBe('그는 침묵했다.');
    expect(parsed.gameResult).toBe('');
  });

  test('applies team and participant outcomes into values', () => {
    const values = applyBattleResultToValues(
      {},
      {
        gameResult: 'ended',
        teamOutcomes: { '11': 'win', '22': 'lose' },
        participantOutcomes: {
          'hero-1': 'survived',
          'hero-2': 'eliminated',
        },
      }
    );

    expect(values.gameResult).toBe('ended');
    expect(values.battleEndReason).toBe('ended');
    expect(values.winningTeams).toEqual(['11']);
    expect(values.losingTeams).toEqual(['22']);
    expect(values.eliminatedParticipantIds).toEqual(['hero-2']);
    expect(values.battleWinner).toBe('11');
  });
});
