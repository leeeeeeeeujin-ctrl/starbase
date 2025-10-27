#!/usr/bin/env node
/* eslint-disable no-console */
// Live-style matching simulator: multiple games, users join/leave over time,
// matcher invoked periodically; simulates mid-leave race conditions.

const fs = require('fs');
const path = require('path');
const { matchRankParticipants, matchAsyncParticipants } = require('../lib/rank/matching');

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randNormal(mean = 1000, sd = 200) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.round(mean + z * sd);
}

function makeId(prefix, n) { return `${prefix}-${n}-${Date.now().toString(36)}`; }

const GAME_TEMPLATES = [
  { name: 'duo', roles: [{ name: 'attack', slot_count: 1 }, { name: 'support', slot_count: 1 }] },
  { name: '2v2', roles: [{ name: 'attack', slot_count: 2 }, { name: 'support', slot_count: 2 }] },
  { name: 'solo', roles: [{ name: 'solo', slot_count: 1 }] },
  { name: '4p', roles: [{ name: 'tank', slot_count: 1 }, { name: 'dps', slot_count: 3 }] },
];

const DEFAULTS = {
  ticks: 200,
  initialUsers: 200,
  joinPerTickPerGame: 6,
  leaveProbPerTick: 0.02,
  midLeaveProbOnMatch: 0.05,
  standinPoolPerGame: 6,
  sensitivity: 0.5,
};

function createUser(ownerSeq, role, score) {
  const id = makeId('q', ownerSeq);
  return {
    id,
    owner_id: `user-${ownerSeq}`,
    hero_id: `hero-${ownerSeq}`,
    role,
    score,
    joined_at: new Date().toISOString(),
  };
}

function createStandin(idSeq, role, score) {
  return {
    id: `s-${idSeq}`,
    owner_id: `bot-${idSeq}`,
    hero_id: `b-${idSeq}`,
    role,
    score,
    simulated: true,
    match_source: 'participant_pool',
  };
}

function sampleScoreForRole(role) {
  // simple heuristic: role doesn't change score distribution here
  return randNormal(1000, 300);
}

function removeEntriesById(queue, idsToRemove) {
  const idset = new Set(idsToRemove);
  return queue.filter(entry => !idset.has(entry.id));
}

async function runSim(opts = {}) {
  const conf = { ...DEFAULTS, ...opts };
  process.env.RANK_ADAPTIVE_SENSITIVITY = String(conf.sensitivity);

  // per-game queues
  const games = GAME_TEMPLATES.map((t, gi) => ({ id: `game-${gi}`, name: t.name, roles: t.roles, queue: [] }));

  // populate initial users
  let seq = 1;
  for (const g of games) {
    for (let i = 0; i < Math.floor(conf.initialUsers / games.length); i += 1) {
      const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
      g.queue.push(createUser(seq++, role, sampleScoreForRole(role)));
    }
  }

  const metrics = {
    ticks: conf.ticks,
    totalJoins: 0,
    totalLeaves: 0,
    matchesAttempted: 0,
    matchesSucceeded: 0,
    matchesFailedMidLeave: 0,
    matchesPartial: 0,
    matchesNoStandins: 0,
    perGame: {},
  };

  for (const g of games) metrics.perGame[g.id] = { attempted: 0, success: 0, midLeave: 0 };

  // main tick loop
  for (let tick = 0; tick < conf.ticks; tick += 1) {
    // joins
    for (const g of games) {
      const joins = randInt(0, conf.joinPerTickPerGame);
      for (let j = 0; j < joins; j += 1) {
        const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
        g.queue.push(createUser(seq++, role, sampleScoreForRole(role)));
      }
      metrics.totalJoins += joins;
    }

    // random leaves
    for (const g of games) {
      const before = g.queue.length;
      g.queue = g.queue.filter(entry => {
        if (Math.random() < conf.leaveProbPerTick) {
          metrics.totalLeaves += 1;
          return false;
        }
        return true;
      });
    }

    // per-game matching phase
    for (const g of games) {
      // build standin pool
      const standins = [];
      for (let s = 0; s < conf.standinPoolPerGame; s += 1) {
        const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
        standins.push(createStandin(`g${g.id}-s${tick}-${s}`, role, sampleScoreForRole(role)));
      }

      // attempt async matching (human + standins)
      const options = { roles: g.roles, queue: g.queue.slice(), standins, scoreWindows: [100, 200] };
      const result = matchAsyncParticipants(options);
      metrics.matchesAttempted += 1;
      metrics.perGame[g.id].attempted += 1;

      if (!result || result.ready !== true || !Array.isArray(result.assignments) || result.assignments.length === 0) {
        // no ready match this tick
        if (result && result.error && result.error.type === 'insufficient_candidates') {
          metrics.matchesNoStandins = (metrics.matchesNoStandins || 0) + 1;
        }
        continue;
      }

      // we have an assignment(s); simulate mid-leave: some assigned members can leave before we finalize
      let anyFailed = false;
      let anyPartial = false;
      const idsToRemove = [];

      for (const assignment of result.assignments) {
        // members are raw member entries used by matcher (they may be the original objects)
        const members = assignment.members || [];
        if (members.length === 0) continue;

        // simulate mid-leave: each member independently may leave with midLeaveProbOnMatch
        const left = members.filter(() => Math.random() < conf.midLeaveProbOnMatch);
        if (left.length > 0) {
          anyFailed = true;
          metrics.matchesFailedMidLeave += 1;
          metrics.perGame[g.id].midLeave += 1;
        } else {
          // success: queue entries removed
          members.forEach(m => {
            if (m && m.id) idsToRemove.push(m.id);
          });
        }
      }

      if (!anyFailed && idsToRemove.length > 0) {
        // finalize successful match: remove matched ids from queue
        g.queue = removeEntriesById(g.queue, idsToRemove);
        metrics.matchesSucceeded += 1;
        metrics.perGame[g.id].success += 1;
      } else if (anyFailed && idsToRemove.length > 0) {
        // partial or failed: remove those that remained but count partial
        g.queue = removeEntriesById(g.queue, idsToRemove);
        metrics.matchesPartial += 1;
      }

      // small houseclean: cap queue sizes to avoid runaway
      if (g.queue.length > 2000) g.queue.splice(0, g.queue.length - 2000);
    }
  }

  // produce report
  const out = { generatedAt: new Date().toISOString(), config: conf, metrics };
  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `matching-live-sim-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outPath);
  console.log('SUMMARY', JSON.stringify(metrics, null, 2));
  return out;
}

if (require.main === module) {
  runSim().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runSim };
