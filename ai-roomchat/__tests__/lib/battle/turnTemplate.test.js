const {
  normalizeTurnMeta,
  serializeTurnTemplate,
  parseTurnTemplate,
} = require('../../../lib/battle/turnTemplate');

describe('turn template state writes', () => {
  test('keeps state write key during normalization', () => {
    const meta = normalizeTurnMeta({
      stateWrites: [
        {
          sourceType: 'teamOutcome',
          sourceKey: '1',
          equals: 'win',
          key: 'result.winnerTeam',
          value: '1',
        },
      ],
    });

    expect(meta.stateWrites).toHaveLength(1);
    expect(meta.stateWrites[0].key).toBe('result.winnerTeam');
  });

  test('preserves state write key across serialize and parse', () => {
    const template = serializeTurnTemplate(
      {
        title: '테스트',
        stateWrites: [
          {
            id: 'write-1',
            sourceType: 'participantOutcome',
            sourceKey: 'participant-1',
            equals: 'eliminated',
            key: 'state.enemyDown',
            value: 'true',
          },
        ],
      },
      '본문',
      'ai'
    );

    const parsed = parseTurnTemplate(template, 'ai');

    expect(parsed.meta.stateWrites).toHaveLength(1);
    expect(parsed.meta.stateWrites[0].key).toBe('state.enemyDown');
    expect(parsed.meta.stateWrites[0].value).toBe('true');
  });
});
