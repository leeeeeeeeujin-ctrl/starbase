import { presummarizeHistory } from '../lib/client/offload/presummarize.js';

function makeHistory(n) {
  const arr = [];
  for (let i=0;i<n;i++) {
    arr.push({ role: i%2===0?'user':'assistant', content: 'Message number ' + i + ' with some extra descriptive text here.' });
  }
  return arr;
}

describe('presummarizeHistory', () => {
  test('produces summary under char cap', () => {
    const hist = makeHistory(40);
    const { summaryText } = presummarizeHistory(hist, { maxChars: 300, maxItems: 24 });
    expect(summaryText.length).toBeLessThanOrEqual(300);
    expect(summaryText).toMatch(/user:/);
    expect(summaryText).toMatch(/assistant:/);
  });

  test('empty history returns empty summary', () => {
    const { summaryText } = presummarizeHistory([], {});
    expect(summaryText).toBe('');
  });
});
