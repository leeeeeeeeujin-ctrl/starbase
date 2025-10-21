// Simple sample runner: exercise matchRankParticipants without Next/Jest
const { matchRankParticipants } = require('../lib/rank/matching')
const fs = require('node:fs')
const path = require('node:path')

const reports = []

function runSample(name, roles, queue) {
  const result = matchRankParticipants({ roles, queue })
  const summary = {
    name,
    ready: result.ready,
    totalSlots: result.totalSlots,
    maxWindow: result.maxWindow,
    error: result.error || null,
    assignments: result.assignments?.map(a => ({ role: a.role, count: (a.members||[]).length })) || [],
  }
  reports.push(summary)
  console.log('--- SAMPLE:', name, '---')
  console.log(JSON.stringify(summary, null, 2))
}

function iso(ms) { return new Date(Date.now() - (ms||0)).toISOString() }

// Case 1: 1공격 + 2수비 (완전 매칭)
runSample('offense1_defense2_full',
  [ { name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 } ],
  [
    { id: 'q1', owner_id: '1', hero_id: '101', role: '공격', score: 1200, joined_at: iso(5000) },
    { id: 'q2', owner_id: '2', hero_id: '201', role: '수비', score: 1190, joined_at: iso(4000) },
    { id: 'q3', owner_id: '3', hero_id: '301', role: '수비', score: 1210, joined_at: iso(3000) },
  ]
)

// Case 2: 스코어 갭으로 불성립
runSample('score_gap_not_ready',
  [ { name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 } ],
  [
    { id: 'q4', owner_id: '4', hero_id: '401', role: '공격', score: 1200, joined_at: iso(5000) },
    { id: 'q5', owner_id: '5', hero_id: '501', role: '수비', score: 800,  joined_at: iso(4000) },
    { id: 'q6', owner_id: '6', hero_id: '601', role: '수비', score: 2200, joined_at: iso(3000) },
  ]
)

// Case 3: 히어로 중복 충돌로 불성립
runSample('duplicate_hero_conflict',
  [ { name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 } ],
  [
    { id: 'q7', owner_id: '7', hero_id: '999', role: '공격', score: 1200, joined_at: iso(5000) },
    { id: 'q8', owner_id: '8', hero_id: '999', role: '수비', score: 1200, joined_at: iso(4000) },
    { id: 'q9', owner_id: '9', hero_id: '909', role: '수비', score: 1200, joined_at: iso(3000) },
  ]
)

// Write JSON report
try {
  const outDir = path.join(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'matching-samples.json')
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2), 'utf8')
  console.log('[samples] wrote', outPath)
} catch (e) {
  console.error('Failed to write samples report:', e)
}
