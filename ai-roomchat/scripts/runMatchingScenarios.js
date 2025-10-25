#!/usr/bin/env node
/*
 * Generate ~40 deterministic matching scenarios (role templates + queues)
 * and run matchRankParticipants against each. Collect results in logs/
 * for offline analysis.
 */

const fs = require('fs');
const path = require('path');

const matching = require('../lib/rank/matching.js');

function seededRng(seed) {
  let x = seed || 123456789;
  return () => {
    // simple xorshift-like deterministic RNG
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967295;
  };
}

function makeRolesTemplate(kind) {
  // variety of templates
  switch (kind) {
    case 0: return [{ name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 }];
    case 1: return [{ name: '공격', slotCount: 2 }, { name: '수비', slotCount: 2 }];
    case 2: return [{ name: 'A', slotCount: 3 }];
    case 3: return [{ name: '탱커', slotCount: 1 }, { name: '딜러', slotCount: 1 }, { name: '서포트', slotCount: 1 }];
    case 4: return [{ name: 'role1', slotCount: 2 }, { name: 'role2', slotCount: 1 }, { name: 'role3', slotCount: 1 }];
    default:
      return [{ name: '공격', slotCount: 1 }, { name: '수비', slotCount: 2 }];
  }
}

function genQueueForTemplate(rng, roles, scenarioIndex, variation) {
  const queue = [];
  let heroCounter = 0;
  // variation controls clustering, owners, parties
  for (const role of roles) {
    const slots = Number(role.slotCount) || 1;
    const groups = Math.max(1, slots + (variation % 2 === 0 ? 1 : 2));
    for (let g = 0; g < groups; g++) {
      // create a solo candidate or small party occasionally
      const isParty = (rng() < 0.2);
      const partySize = isParty ? (1 + Math.floor(rng() * Math.min(3, slots))) : 1;
      const baseScore = 900 + Math.floor(rng() * 400) - 50 * variation; // shift by variation
      const partyId = isParty ? `party-${scenarioIndex}-${role.name}-${g}` : null;
      for (let p = 0; p < partySize; p++) {
        const scoreJitter = Math.round((rng() - 0.5) * 2 * (20 + variation * 10));
        const score = Math.max(0, baseScore + scoreJitter);
        const ownerId = rng() < 0.1 ? `owner-${Math.floor(rng() * 3)}` : null; // create occasional owner conflicts
        const heroId = `hero-${scenarioIndex}-${heroCounter++}`;
        queue.push({
          id: `q-${scenarioIndex}-${role.name}-${g}-${p}`,
          owner_id: ownerId,
          hero_id: heroId,
          role: role.name,
          score,
          joined_at: new Date(Date.now() - Math.floor(rng() * 100000)).toISOString(),
          partyKey: partyId,
          entry: { id: `q-${scenarioIndex}-${role.name}-${g}-${p}`, owner_id: ownerId, hero_id: heroId },
        });
      }
    }
  }
  // shuffle deterministically
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
  }
  return queue;
}

function generateScenarios(count) {
  const scenarios = [];
  for (let i = 0; i < count; i++) {
    const rng = seededRng(1000 + i);
    const kind = i % 5; // different role templates
    const roles = makeRolesTemplate(kind);
    const variation = Math.floor(i / 5);
    const queue = genQueueForTemplate(rng, roles, i, variation);
    // vary scoreWindows for some scenarios (tight vs wide)
    const scoreWindows = variation % 3 === 0 ? [50, 100] : variation % 3 === 1 ? [100, 200] : [200, 400];
    scenarios.push({ id: i + 1, roles, queue, scoreWindows });
  }
  return scenarios;
}

function run() {
  const COUNT = 40;
  const scenarios = generateScenarios(COUNT);
  const results = [];
  scenarios.forEach((sc) => {
    try {
      const res = matching.matchRankParticipants({ roles: sc.roles, queue: sc.queue, scoreWindows: sc.scoreWindows });
      results.push({ scenario: { id: sc.id, roles: sc.roles, scoreWindows: sc.scoreWindows }, outcome: res, queue: sc.queue });
    } catch (e) {
      results.push({ scenario: { id: sc.id, roles: sc.roles, scoreWindows: sc.scoreWindows }, error: String(e), stack: e && e.stack });
    }
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const outPath = path.join(logsDir, `matching-scenarios-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8');
  console.log(`Wrote results to ${outPath}`);

  // summary
  const total = results.length;
  const readyCount = results.filter(r => r.outcome && r.outcome.ready).length;
  console.log(`Ran ${total} scenarios — ready: ${readyCount}, failed to form ready room: ${total - readyCount}`);
  const byWindow = results.reduce((acc, r) => {
    const w = Array.isArray(r.scenario && r.scenario.scoreWindows) ? r.scenario.scoreWindows.join(',') : 'none';
    acc[w] = acc[w] || { total: 0, ready: 0 };
    acc[w].total += 1;
    if (r.outcome && r.outcome.ready) acc[w].ready += 1;
    return acc;
  }, {});
  console.log('By scoreWindows:');
  Object.keys(byWindow).forEach(k => console.log(`  ${k}: ${byWindow[k].ready}/${byWindow[k].total}`));
}

run();
