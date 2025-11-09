#!/usr/bin/env node

// Run a battery of matching simulations across many synthetic games and queues.
// Produces reports in ./reports/matching-simulations.json

const fs = require('fs');
const path = require('path');
const { matchRankParticipants, matchAsyncParticipants } = require('../lib/rank/matching');

function randNormal(mean = 1000, sd = 200) {
  // Box-Muller
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.round(mean + z * sd);
}

function sampleScores(n, dist) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (dist.type === 'normal') out.push(randNormal(dist.mean, dist.sd));
    else if (dist.type === 'uniform')
      out.push(Math.round(dist.min + Math.random() * (dist.max - dist.min)));
    else if (dist.type === 'low') out.push(randNormal(900, 80));
    else out.push(1000);
  }
  return out;
}

function buildRoleTemplates() {
  return [
    [
      { name: 'attack', slot_count: 1 },
      { name: 'support', slot_count: 1 },
    ],
    [
      { name: 'attack', slot_count: 2 },
      { name: 'support', slot_count: 2 },
    ],
    [{ name: 'solo', slot_count: 1 }],
    [
      { name: 'tank', slot_count: 1 },
      { name: 'dps', slot_count: 3 },
    ],
  ];
}

function buildQueueFromScores(role, scores, startId = 0) {
  const queue = [];
  for (let i = 0; i < scores.length; i += 1) {
    queue.push({
      id: `q-${startId + i}`,
      owner_id: `owner-${startId + i}`,
      hero_id: `hero-${startId + i}`,
      role,
      score: scores[i],
      joined_at: new Date(Date.now() - (i + 1) * 1000).toISOString(),
    });
  }
  return queue;
}

function runTrials({
  roles,
  dist,
  queueSize = 10,
  standinPool = 0,
  asyncMode = false,
  sensitivity = null,
  trials = 200,
}) {
  let failures = 0;
  for (let t = 0; t < trials; t += 1) {
    // generate per-role queues
    const queues = [];
    let id = t * 1000;
    roles.forEach(r => {
      const scores = sampleScores(Math.max(1, Math.round(queueSize * (r.slot_count || 1))), dist);
      const q = buildQueueFromScores(r.name, scores, id);
      queues.push(...q);
      id += scores.length;
    });

    const standins = [];
    if (standinPool > 0) {
      const scores = sampleScores(standinPool, dist);
      let sid = id;
      scores.forEach((s, idx) => {
        // attach to a random role
        const role = roles[Math.floor(Math.random() * roles.length)].name;
        standins.push({
          id: `s-${sid + idx}`,
          owner_id: `bot-${sid + idx}`,
          hero_id: `b-${sid + idx}`,
          role,
          score: s,
        });
      });
    }

    const options = { roles, queue: queues, scoreWindows: [100, 200] };
    if (sensitivity != null) process.env.RANK_ADAPTIVE_SENSITIVITY = String(sensitivity);

    const result = asyncMode
      ? matchAsyncParticipants({ roles, queue: queues, standins, scoreWindows: [100, 200] })
      : matchRankParticipants({ roles, queue: queues, scoreWindows: [100, 200] });

    if (!result || result.ready !== true) failures += 1;
  }
  return { trials, failures, failureRate: (failures / trials) * 100 };
}

async function main() {
  const reports = [];
  const roleTemplates = buildRoleTemplates();
  const dists = [
    { name: 'around_1000', type: 'normal', mean: 1000, sd: 50 },
    { name: 'wide', type: 'normal', mean: 1000, sd: 300 },
    { name: 'low_skew', type: 'normal', mean: 700, sd: 200 },
    { name: 'high_skew', type: 'normal', mean: 1400, sd: 200 },
    { name: 'uniform_wide', type: 'uniform', min: 200, max: 2200 },
  ];

  const sensitivities = [0.0, 0.25, 0.5, 1.0];

  for (const roles of roleTemplates) {
    for (const dist of dists) {
      for (const sens of sensitivities) {
        const r1 = runTrials({
          roles,
          dist,
          queueSize: 6,
          standinPool: 0,
          asyncMode: false,
          sensitivity: sens,
          trials: 300,
        });
        const r2 = runTrials({
          roles,
          dist,
          queueSize: 3,
          standinPool: 6,
          asyncMode: true,
          sensitivity: sens,
          trials: 300,
        });

        const entry = {
          timestamp: new Date().toISOString(),
          roles,
          dist,
          sensitivity: sens,
          realtime: r1,
          async: r2,
        };
        console.log(
          'SIM',
          roles.map(r => `${r.name}(${r.slot_count})`).join(','),
          dist.name,
          'sens=',
          sens,
          '-> realtime fail',
          r1.failureRate.toFixed(2),
          '% async fail',
          r2.failureRate.toFixed(2),
          '%'
        );
        reports.push(entry);
      }
    }
  }

  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `matching-simulations-${Date.now()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
    'utf8'
  );
  console.log('WROTE', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
