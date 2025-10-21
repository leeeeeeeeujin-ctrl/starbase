/*
  Lightweight matching fuzzer: generates random role layouts and queues,
  runs matchRankParticipants, and checks invariants. Produces a brief report.
*/

// Dynamic import to handle ES module properly
let matchRankParticipants

async function init() {
  const matching = await import('../lib/rank/matching.mjs')
  matchRankParticipants = matching.matchRankParticipants
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function mkRoles() {
  const base = ['공격', '수비', '정찰']
  const size = randInt(1, 3)
  const picked = []
  for (let i = 0; i < size; i += 1) {
    const name = pick(base)
    const count = randInt(1, 3)
    picked.push({ name, slotCount: count })
  }
  // normalize by collapsing duplicates
  const map = new Map()
  picked.forEach(r => {
    const prev = map.get(r.name) || 0
    map.set(r.name, prev + r.slotCount)
  })
  return Array.from(map.entries()).map(([name, slotCount]) => ({ name, slotCount }))
}

function mkQueue(roles, n = randInt(3, 10)) {
  const entries = []
  let id = 1
  for (let i = 0; i < n; i += 1) {
    const role = pick(roles).name
    const owner = randInt(1, 10000)
    const hero = randInt(1, 10000)
    const score = randInt(800, 1800)
    const joined = new Date(Date.now() - randInt(0, 60000)).toISOString()
    entries.push({ id: `q${id++}`, owner_id: String(owner), hero_id: String(hero), role, score, joined_at: joined })
  }
  return entries
}

function checkInvariants(result) {
  // No duplicate heroes in assignments
  const seen = new Set()
  for (const asn of result.assignments || []) {
    for (const m of asn.members || []) {
      const hero = String(m.hero_id ?? m.heroId ?? '')
      if (!hero) continue
      if (seen.has(hero)) return { ok: false, reason: 'duplicate_hero' }
      seen.add(hero)
    }
  }
  // Each assignment (room) must not exceed its own slot capacity
  for (const asn of result.assignments || []) {
    const filled = (asn.members || []).length
    const cap = asn.slots || 0
    if (filled > cap) return { ok: false, reason: 'overfill', filled, cap }
  }
  return { ok: true }
}

async function run(iterations = 200) {
  await init()
  let pass = 0, fail = 0
  for (let i = 0; i < iterations; i += 1) {
    const roles = mkRoles()
    const queue = mkQueue(roles)
    const result = matchRankParticipants({ roles, queue })
    const inv = checkInvariants(result)
    if (inv.ok) pass += 1
    else fail += 1
  }
  console.log(JSON.stringify({ iterations, pass, fail }))
}

const iters = Number(process.argv[2]) || 200
await run(iters)
