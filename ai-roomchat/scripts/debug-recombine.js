process.env.DEBUG_MATCHING = '1';
const m = require('../lib/rank/matching');

const roles = [{ name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 }];
const queue = [
  { role: '공격', score: 841, joinedAt: 1761355533667, id: 'a1', owner_id: 'o1', hero_id: 'h1' },
  { role: '수비', score: 1072, joinedAt: 1761355534667, id: 'd1', owner_id: 'o2', hero_id: 'h2' },
  { role: '수비', score: 1059, joinedAt: 1761355535667, id: 'd2', owner_id: 'o3', hero_id: 'h3' },
];

const result = m.matchRankParticipants({ roles, queue, scoreWindows: [200] });
console.log('RESULT', JSON.stringify(result, null, 2));
