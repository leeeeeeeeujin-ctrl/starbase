const fs = require('fs');
const path = require('path');

describe('text battle settlement source', () => {
  test('uses zero-sum delta pairs for win/lose settlement', () => {
    const filePath = path.join(
      process.cwd(),
      'lib',
      'battle',
      'textBattleSettlement.js'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('function buildZeroSumDelta(outcome, reason)');
    expect(source).toContain('return { attacker: base, defender: -base };');
    expect(source).toContain('return { attacker: -base, defender: base };');
    expect(source).toContain('delta: settlement.delta.attacker');
    expect(source).toContain('delta: settlement.delta.defender');
  });

  test('matches team and participant outcomes through aliases', () => {
    const filePath = path.join(
      process.cwd(),
      'lib',
      'battle',
      'textBattleSettlement.js'
    );
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain('export function lookupTeamOutcome');
    expect(source).toContain("const prefixed = teamOutcomes[`팀 ${teamId}`];");
    expect(source).toContain('export function lookupParticipantOutcome');
    expect(source).toContain('participant.name');
    expect(source).toContain('normalizeOutcomeKey');
  });
});
