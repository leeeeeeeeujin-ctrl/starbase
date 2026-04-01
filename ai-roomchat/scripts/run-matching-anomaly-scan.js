#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { matchRankParticipants, matchAsyncParticipants } = require('../lib/rank/matching');

function randNormal(mean = 1000, sd = 200) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.round(mean + z * sd);
}

function sampleScores(n, dist) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    if (dist.type === 'normal') out.push(randNormal(dist.mean, dist.sd));
    else if (dist.type === 'uniform') {
      out.push(Math.round(dist.min + Math.random() * (dist.max - dist.min)));
    } else {
      out.push(1000);
    }
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
  return scores.map((score, index) => ({
    id: `q-${startId + index}`,
    owner_id: `owner-${startId + index}`,
    hero_id: `hero-${startId + index}`,
    role,
    score,
    joined_at: new Date(Date.now() - (index + 1) * 1000).toISOString(),
  }));
}

function buildStandins(roles, standinPool, dist, startId) {
  if (standinPool <= 0) return [];
  const scores = sampleScores(standinPool, dist);
  return scores.map((score, index) => ({
    id: `s-${startId + index}`,
    owner_id: `bot-${startId + index}`,
    hero_id: `b-${startId + index}`,
    role: roles[Math.floor(Math.random() * roles.length)].name,
    score,
    simulated: true,
    standin: true,
    match_source: 'participant_pool',
  }));
}

function computeRoleCapacityMap(roles = []) {
  const map = new Map();
  roles.forEach(role => {
    const name = String(role?.name || '').trim();
    if (!name) return;
    map.set(name, Number(role?.slot_count || role?.slotCount || 0));
  });
  return map;
}

function computeAdaptiveWindowFactor(queue = [], sensitivity = null, baseline = 1000) {
  const defaultSensitivity =
    sensitivity != null ? Number(sensitivity) : Number(process.env.RANK_ADAPTIVE_SENSITIVITY ?? 0.25);
  const sens = Number.isFinite(defaultSensitivity) && defaultSensitivity >= 0 ? defaultSensitivity : 0.25;
  const scores = (Array.isArray(queue) ? queue : [])
    .map(entry => Number(entry?.score))
    .filter(value => Number.isFinite(value));
  if (!scores.length) return 1;
  const meanAbsDev =
    scores.reduce((acc, value) => acc + Math.abs(value - baseline), 0) / scores.length;
  const factor = 1 + (meanAbsDev / Math.max(1, baseline)) * sens;
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

function analyzeSuccess(result, roles, maxWindowAllowed) {
  const anomalies = [];
  if (!result || result.ready !== true) {
    return anomalies;
  }

  const roleCapacity = computeRoleCapacityMap(roles);
  const roleCounts = new Map();
  const heroIds = new Set();
  let totalMembers = 0;

  const assignments = Array.isArray(result.assignments) ? result.assignments : [];
  assignments.forEach(assignment => {
    const members = Array.isArray(assignment?.members) ? assignment.members : [];
    members.forEach(member => {
      totalMembers += 1;
      const role = String(member?.role || assignment?.role || '').trim();
      if (role) {
        roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
      }
      const heroId = member?.hero_id != null ? String(member.hero_id).trim() : '';
      if (heroId) {
        if (heroIds.has(heroId)) {
          anomalies.push(`duplicate_hero:${heroId}`);
        } else {
          heroIds.add(heroId);
        }
      }
    });
  });

  roleCapacity.forEach((capacity, roleName) => {
    const occupied = roleCounts.get(roleName) || 0;
    if (occupied !== capacity) {
      anomalies.push(`role_mismatch:${roleName}:${occupied}/${capacity}`);
    }
  });

  const expectedTotal = Array.from(roleCapacity.values()).reduce((acc, value) => acc + value, 0);
  if (totalMembers !== expectedTotal) {
    anomalies.push(`member_total_mismatch:${totalMembers}/${expectedTotal}`);
  }

  const rooms = Array.isArray(result.rooms) ? result.rooms : [];
  rooms.forEach(room => {
    if (room?.ready !== true) {
      anomalies.push('ready_room_flag_mismatch');
    }
    const gap = Number(room?.maxScoreGap);
    if (Number.isFinite(gap) && gap > maxWindowAllowed) {
      anomalies.push(`score_gap_exceeded:${gap}/${maxWindowAllowed}`);
    }
  });

  return Array.from(new Set(anomalies));
}

function runAnomalyTrials({
  roles,
  dist,
  queueSize = 10,
  standinPool = 0,
  asyncMode = false,
  sensitivity = null,
  trials = 200,
}) {
  const anomalyCounts = {};
  const anomalySamples = [];
  const scoreWindows = [100, 200];
  let suspiciousSuccesses = 0;
  let successes = 0;

  for (let t = 0; t < trials; t += 1) {
    const queue = [];
    let id = t * 1000;
    roles.forEach(role => {
      const scores = sampleScores(Math.max(1, Math.round(queueSize * (role.slot_count || 1))), dist);
      queue.push(...buildQueueFromScores(role.name, scores, id));
      id += scores.length;
    });

    const standins = buildStandins(roles, standinPool, dist, id);
    const effectiveMaxWindow = Math.max(
      ...scoreWindows.map(window =>
        Math.round(
          Number(window) *
            computeAdaptiveWindowFactor(queue.concat(standins), sensitivity)
        )
      )
    );
    if (sensitivity != null) {
      process.env.RANK_ADAPTIVE_SENSITIVITY = String(sensitivity);
    }

    const result = asyncMode
      ? matchAsyncParticipants({ roles, queue, standins, scoreWindows })
      : matchRankParticipants({ roles, queue, scoreWindows });

    if (!result || result.ready !== true) continue;
    successes += 1;

    const anomalies = analyzeSuccess(result, roles, effectiveMaxWindow);
    if (!anomalies.length) continue;

    suspiciousSuccesses += 1;
    anomalies.forEach(key => {
      anomalyCounts[key] = (anomalyCounts[key] || 0) + 1;
    });

    if (anomalySamples.length < 10) {
      anomalySamples.push({
        trial: t,
        anomalies,
        assignments: result.assignments,
        rooms: result.rooms,
      });
    }
  }

  return {
    trials,
    successes,
    suspiciousSuccesses,
    suspiciousSuccessRate: successes ? (suspiciousSuccesses / successes) * 100 : 0,
    anomalies: anomalyCounts,
    samples: anomalySamples,
  };
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
        const realtime = runAnomalyTrials({
          roles,
          dist,
          queueSize: 6,
          asyncMode: false,
          sensitivity: sens,
          trials: 200,
        });
        const async = runAnomalyTrials({
          roles,
          dist,
          queueSize: 3,
          standinPool: 6,
          asyncMode: true,
          sensitivity: sens,
          trials: 200,
        });

        console.log(
          'ANOMALY',
          roles.map(role => `${role.name}(${role.slot_count})`).join(','),
          dist.name,
          'sens=',
          sens,
          '-> realtime suspicious',
          realtime.suspiciousSuccessRate.toFixed(2),
          '% async suspicious',
          async.suspiciousSuccessRate.toFixed(2),
          '%'
        );

        reports.push({
          timestamp: new Date().toISOString(),
          roles,
          dist,
          sensitivity: sens,
          realtime,
          async,
        });
      }
    }
  }

  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `matching-anomaly-scan-${Date.now()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
    'utf8'
  );
  console.log('WROTE', outPath);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
