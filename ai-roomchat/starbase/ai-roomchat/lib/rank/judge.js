// lib/rank/judge.js

export function judgeOutcome(aiText) {
  const t = (aiText || '').toLowerCase();
  if (!t) return { outcome: 'draw' };
  if (t.includes('win') || t.includes('승리')) return { outcome: 'win' };
  if (t.includes('lose') || t.includes('패배')) return { outcome: 'lose' };
  return { outcome: 'draw' };
}
