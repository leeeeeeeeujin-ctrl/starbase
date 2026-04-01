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

function sampleScore(dist) {
  if (!dist || dist.type === 'flat') return 1000;
  if (dist.type === 'uniform') {
    return Math.round(dist.min + Math.random() * (dist.max - dist.min));
  }
  return randNormal(dist.mean, dist.sd);
}

function buildQueue({ roles, poolCounts, dist, startId = 0 }) {
  const queue = [];
  let cursor = startId;
  roles.forEach(role => {
    const poolCount = Number(poolCounts[role.name] || 0);
    for (let index = 0; index < poolCount; index += 1) {
      queue.push({
        id: `q-${cursor}`,
        owner_id: `owner-${cursor}`,
        hero_id: `hero-${cursor}`,
        role: role.name,
        score: sampleScore(dist),
        joined_at: new Date(Date.now() - (cursor + 1) * 1000).toISOString(),
      });
      cursor += 1;
    }
  });
  return queue;
}

function computeIdealRoomCount({ roles, poolCounts }) {
  if (!Array.isArray(roles) || !roles.length) return 0;
  const counts = roles.map(role => {
    const need = Number(role.slot_count || 0);
    const have = Number(poolCounts[role.name] || 0);
    if (!need || need <= 0) return 0;
    return Math.floor(have / need);
  });
  return counts.length ? Math.min(...counts) : 0;
}

function validateRoom({ room, roles }) {
  const roleCap = new Map();
  roles.forEach(role => roleCap.set(role.name, Number(role.slot_count || 0)));
  const anomalies = [];
  const slots = Array.isArray(room?.slots) ? room.slots : [];
  const members = slots
    .map(slot => ({
      ...(slot?.member || {}),
      role: slot?.role || slot?.member?.role || '',
    }))
    .filter(member => Object.keys(member).length > 0);
  const roleCounts = new Map();
  const heroIds = new Set();

  members.forEach(member => {
    const role = String(member?.role || '').trim();
    if (role) roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    const heroId = String(member?.hero_id || member?.heroId || '').trim();
    if (heroId) {
      if (heroIds.has(heroId)) anomalies.push(`duplicate_hero:${heroId}`);
      heroIds.add(heroId);
    }
  });

  roleCap.forEach((capacity, roleName) => {
    const occupied = roleCounts.get(roleName) || 0;
    if (occupied !== capacity) {
      anomalies.push(`role_mismatch:${roleName}:${occupied}/${capacity}`);
    }
  });

  return Array.from(new Set(anomalies));
}

function summarizeRun({ result, roles, idealRooms }) {
  const rooms = Array.isArray(result?.rooms) ? result.rooms : [];
  const readyRooms = rooms.filter(room => room?.ready === true);
  const anomalies = [];
  const seenHeroIds = new Set();

  readyRooms.forEach((room, roomIndex) => {
    validateRoom({ room, roles }).forEach(anomaly => anomalies.push(`room${roomIndex}:${anomaly}`));
    const members = (Array.isArray(room?.slots) ? room.slots : [])
      .map(slot => slot?.member || null)
      .filter(Boolean);
    members.forEach(member => {
      const heroId = String(member?.hero_id || member?.heroId || '').trim();
      if (!heroId) return;
      if (seenHeroIds.has(heroId)) anomalies.push(`cross_room_duplicate:${heroId}`);
      seenHeroIds.add(heroId);
    });
  });

  if (readyRooms.length > idealRooms) {
    anomalies.push(`room_count_exceeds_ideal:${readyRooms.length}/${idealRooms}`);
  }

  return {
    ready: result?.ready === true,
    roomCount: readyRooms.length,
    anomalyCount: anomalies.length,
    anomalies: Array.from(new Set(anomalies)),
  };
}

function runScenario({
  name,
  roles,
  poolCounts,
  dist,
  asyncMode = false,
  standinPool = 0,
  trials = 200,
}) {
  const idealRooms = computeIdealRoomCount({ roles, poolCounts });
  let started = 0;
  let zeroRoomFailures = 0;
  let fullIdealMatches = 0;
  let totalRooms = 0;
  let anomalousSuccesses = 0;
  const anomalyCounts = {};
  const samples = [];

  for (let index = 0; index < trials; index += 1) {
    const queue = buildQueue({ roles, poolCounts, dist, startId: index * 1000 });
    const standins = [];

    if (asyncMode && standinPool > 0) {
      const roleNames = roles.map(role => role.name);
      for (let sid = 0; sid < standinPool; sid += 1) {
        const cursor = index * 10000 + sid;
        standins.push({
          id: `s-${cursor}`,
          owner_id: `bot-${cursor}`,
          hero_id: `standin-${cursor}`,
          role: roleNames[sid % roleNames.length],
          score: sampleScore(dist),
          simulated: true,
          standin: true,
          match_source: 'participant_pool',
        });
      }
    }

    const result = asyncMode
      ? matchAsyncParticipants({ roles, queue, standins, scoreWindows: [100, 200] })
      : matchRankParticipants({ roles, queue, scoreWindows: [100, 200] });

    const summary = summarizeRun({ result, roles, idealRooms });
    if (summary.ready) started += 1;
    if (summary.roomCount === 0) zeroRoomFailures += 1;
    if (summary.roomCount === idealRooms) fullIdealMatches += 1;
    totalRooms += summary.roomCount;
    if (summary.anomalyCount > 0) {
      anomalousSuccesses += 1;
      summary.anomalies.forEach(key => {
        anomalyCounts[key] = (anomalyCounts[key] || 0) + 1;
      });
      if (samples.length < 10) {
        samples.push({
          trial: index,
          roomCount: summary.roomCount,
          anomalies: summary.anomalies,
        });
      }
    }
  }

  return {
    name,
    roles,
    poolCounts,
    distribution: dist.name,
    asyncMode,
    standinPool,
    trials,
    idealRooms,
    started,
    startRate: trials ? (started / trials) * 100 : 0,
    zeroRoomFailures,
    zeroRoomFailureRate: trials ? (zeroRoomFailures / trials) * 100 : 0,
    averageRooms: trials ? totalRooms / trials : 0,
    idealRoomFulfillmentRate: trials ? (fullIdealMatches / trials) * 100 : 0,
    anomalousSuccesses,
    anomalousSuccessRate: trials ? (anomalousSuccesses / trials) * 100 : 0,
    anomalyCounts,
    samples,
  };
}

async function main() {
  const scenarios = [
    {
      name: '2v2_even_pool_10_10',
      roles: [
        { name: 'team_11', slot_count: 2 },
        { name: 'team_22', slot_count: 2 },
      ],
      poolCounts: { team_11: 10, team_22: 10 },
    },
    {
      name: '3v3_even_pool_10_10',
      roles: [
        { name: 'team_11', slot_count: 3 },
        { name: 'team_22', slot_count: 3 },
      ],
      poolCounts: { team_11: 10, team_22: 10 },
    },
    {
      name: '3v1_skewed_pool_10_10',
      roles: [
        { name: 'attack', slot_count: 3 },
        { name: 'defense', slot_count: 1 },
      ],
      poolCounts: { attack: 10, defense: 10 },
    },
    {
      name: '1v2v4_pool_7_2_8',
      roles: [
        { name: 'alpha', slot_count: 1 },
        { name: 'beta', slot_count: 2 },
        { name: 'gamma', slot_count: 4 },
      ],
      poolCounts: { alpha: 7, beta: 2, gamma: 8 },
    },
    {
      name: '3role_even_pool_10_10_10',
      roles: [
        { name: 'role_a', slot_count: 1 },
        { name: 'role_b', slot_count: 2 },
        { name: 'role_c', slot_count: 4 },
      ],
      poolCounts: { role_a: 10, role_b: 10, role_c: 10 },
    },
    {
      name: '2role_uneven_pool_14_5',
      roles: [
        { name: 'front', slot_count: 2 },
        { name: 'back', slot_count: 2 },
      ],
      poolCounts: { front: 14, back: 5 },
    },
  ];

  const dists = [
    { name: 'around_1000', type: 'normal', mean: 1000, sd: 50 },
    { name: 'wide', type: 'normal', mean: 1000, sd: 300 },
    { name: 'uniform_wide', type: 'uniform', min: 200, max: 2200 },
  ];

  const reports = [];
  for (const scenario of scenarios) {
    for (const dist of dists) {
      const realtime = runScenario({
        ...scenario,
        dist,
        asyncMode: false,
        trials: 250,
      });
      const async = runScenario({
        ...scenario,
        dist,
        asyncMode: true,
        standinPool: 8,
        trials: 250,
      });

      console.log(
        'POOL',
        scenario.name,
        dist.name,
        '-> realtime avgRooms',
        realtime.averageRooms.toFixed(2),
        'ideal',
        realtime.idealRooms,
        'zeroFail',
        realtime.zeroRoomFailureRate.toFixed(2),
        '% async avgRooms',
        async.averageRooms.toFixed(2),
        'zeroFail',
        async.zeroRoomFailureRate.toFixed(2),
        '% anomalies',
        `${realtime.anomalousSuccessRate.toFixed(2)}/${async.anomalousSuccessRate.toFixed(2)}`
      );

      reports.push({
        timestamp: new Date().toISOString(),
        scenario: scenario.name,
        poolCounts: scenario.poolCounts,
        roles: scenario.roles,
        distribution: dist,
        realtime,
        async,
      });
    }
  }

  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `matching-pool-scenarios-${Date.now()}.json`);
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
