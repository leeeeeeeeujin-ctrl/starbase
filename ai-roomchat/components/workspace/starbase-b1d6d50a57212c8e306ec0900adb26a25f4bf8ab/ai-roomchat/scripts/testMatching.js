// 매칭 함수 단독 테스트 - 실제 테스트 코드를 기반으로
import { matchRankParticipants } from '../lib/rank/matching.js';

// 테스트 코드와 똑같이
function buildQueueEntry({ id, ownerId, heroId, role, score }) {
  return {
    id,
    owner_id: ownerId,
    hero_id: heroId,
    role,
    score,
    entry: {
      id,
      owner_id: ownerId,
      hero_id: heroId,
    },
  };
}

const roles = [
  { name: '공격', slot_count: 1 },
  { name: '수비', slot_count: 2 },
];

const queue = [
  buildQueueEntry({ id: 'q1', ownerId: 'owner-a', heroId: 'hero-a', role: '공격', score: 1000 }),
  buildQueueEntry({ id: 'q2', ownerId: 'owner-b', heroId: 'hero-b', role: '수비', score: 1000 }),
  buildQueueEntry({ id: 'q3', ownerId: 'owner-c', heroId: 'hero-c', role: '수비', score: 1000 }),
];

console.log('Testing matchRankParticipants with:');
console.log('Roles:', JSON.stringify(roles, null, 2));
console.log(`Queue: ${queue.length} players`);
console.log(JSON.stringify(queue, null, 2));

const result = matchRankParticipants({
  roles,
  queue,
  scoreWindows: [100, 200],
});

console.log('\nResult:', JSON.stringify(result, null, 2));
