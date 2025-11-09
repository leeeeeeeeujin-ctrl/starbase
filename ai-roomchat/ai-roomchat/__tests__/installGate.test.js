const { isRestrictedPath, shouldGate } = require('../lib/pwa/installGate');

describe('InstallGate helpers', () => {
  test('isRestrictedPath matches configured prefixes', () => {
    expect(isRestrictedPath('/rank')).toBe(true);
    expect(isRestrictedPath('/rank/duo')).toBe(true);
    expect(isRestrictedPath('/game/play/abc')).toBe(true);
    expect(isRestrictedPath('/maker')).toBe(true);
    expect(isRestrictedPath('/arena/queue')).toBe(true);
    expect(isRestrictedPath('/chat')).toBe(false);
    expect(isRestrictedPath('/debug/offload')).toBe(false);
  });

  test('shouldGate logic', () => {
    // Restricted + not standalone + no bypass => gate
    expect(shouldGate('/rank', false, 0)).toBe(true);

    // Restricted + standalone => no gate
    expect(shouldGate('/rank', true, 0)).toBe(false);

    // Restricted + bypass minutes > 0 => no gate
    expect(shouldGate('/rank', false, 10)).toBe(false);

    // Unrestricted => no gate regardless
    expect(shouldGate('/chat', false, 0)).toBe(false);
  });
});
