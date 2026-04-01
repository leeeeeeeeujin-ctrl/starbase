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
});
