#!/usr/bin/env node
/* eslint-disable no-console */
// Live-style matching simulator with a reservation PoC.
// Steps:
// 1) Matcher returns assignments.
// 2) Reservation step: check members still in queue; if any missing, try quick-fill from standins.
// 3) If quick-fill can't fully satisfy, attempt a single immediate retry with relaxed sensitivity (+0.1).

const fs = require('fs');
const path = require('path');
const { matchAsyncParticipants } = require('../lib/rank/matching');
const reservationStore = require('../lib/rank/reservationStore');

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randNormal(mean = 1000, sd = 200) {
  let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
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

function createUser(ownerSeq, role) {
  const id = makeId('q', ownerSeq);
  return { id, owner_id: `user-${ownerSeq}`, hero_id: `hero-${ownerSeq}`, role, score: randNormal(1000, 300), joined_at: new Date().toISOString() };
}
function createStandin(idSeq, role) {
  return { id: `s-${idSeq}`, owner_id: `bot-${idSeq}`, hero_id: `b-${idSeq}`, role, score: randNormal(1000, 300), simulated: true, match_source: 'participant_pool' };
}

function removeEntriesById(queue, idsToRemove) {
  const idset = new Set(idsToRemove);
  return queue.filter(entry => !idset.has(entry.id));
}

function tryQuickFill(missingSlotsByRole, standins) {
  // simple greedy fill: for each role, consume standins matching role
  const fills = [];
  for (const [role, needed] of Object.entries(missingSlotsByRole)) {
    for (let i = 0; i < needed; i++) {
      const idx = standins.findIndex(s => s.role === role);
      if (idx === -1) break;
      const picked = standins.splice(idx, 1)[0];
      fills.push(picked);
    }
  }
  return fills;
}

async function runReservationSim(opts = {}) {
  const conf = { ...DEFAULTS, ...opts };
  process.env.RANK_ADAPTIVE_SENSITIVITY = String(conf.sensitivity);

  const games = GAME_TEMPLATES.map((t, gi) => ({ id: `game-${gi}`, name: t.name, roles: t.roles, queue: [] }));
  let seq = 1;
  for (const g of games) {
    for (let i = 0; i < Math.floor(conf.initialUsers / games.length); i += 1) {
      const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
      g.queue.push(createUser(seq++, role));
    }
  }

  const metrics = { ticks: conf.ticks, totalJoins: 0, totalLeaves: 0, attempts: 0, success: 0, reservationSucceeded: 0, reservationFailed: 0, quickFilled: 0, retriesAttempted: 0, retriesSucceeded: 0, perGame: {} };
  for (const g of games) metrics.perGame[g.id] = { attempted: 0, success: 0, reservationSucc: 0, reservationFail: 0 };

  for (let tick = 0; tick < conf.ticks; tick += 1) {
    // joins
    for (const g of games) {
      const joins = randInt(0, conf.joinPerTickPerGame);
      for (let j = 0; j < joins; j += 1) {
        const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
        g.queue.push(createUser(seq++, role));
      }
      metrics.totalJoins += joins;
    }

    // random leaves
    for (const g of games) {
      g.queue = g.queue.filter(entry => {
        if (Math.random() < conf.leaveProbPerTick) { metrics.totalLeaves += 1; return false; }
        return true;
      });
    }

    // matching phase
    for (const g of games) {
      const standins = [];
      for (let s = 0; s < conf.standinPoolPerGame; s += 1) {
        const role = g.roles[Math.floor(Math.random() * g.roles.length)].name;
        standins.push(createStandin(`g${g.id}-t${tick}-s${s}`, role));
      }

      const options = { roles: g.roles, queue: g.queue.slice(), standins: standins.slice(), scoreWindows: [100, 200] };
      const result = matchAsyncParticipants(options);
      metrics.attempts += 1; metrics.perGame[g.id].attempted += 1;

      if (!result || result.ready !== true || !Array.isArray(result.assignments) || result.assignments.length === 0) {
        // no ready match
        continue;
      }

      // Reservation step: attempt atomic reserve via reservationStore
      const assignedMemberIds = [];
      result.assignments.forEach(a => { (a.members || []).forEach(m => { if (m && m.id) assignedMemberIds.push(m.id); }); });

      const reserveResult = reservationStore.reserve(assignedMemberIds, { ttl: 3000 });
      if (reserveResult && reserveResult.ok) {
        // reservation succeeded
        metrics.success += 1; metrics.reservationSucceeded += 1; metrics.perGame[g.id].reservationSucc += 1;
        // finalize: remove assigned ids and commit reservation
        g.queue = removeEntriesById(g.queue, assignedMemberIds);
        reservationStore.commit(assignedMemberIds);
        metrics.perGame[g.id].success += 1;
        continue;
      }

      // reservation failed (some missing or already reserved)
      metrics.perGame[g.id].reservationFail += 1; metrics.reservationFailed += 1;

      // determine which assigned ids are missing from queue
      const presentSet = new Set(g.queue.map(q => q.id));
      const missing = assignedMemberIds.filter(id => !presentSet.has(id));

      // compute missing count per role for quick-fill
      const missingSlotsByRole = {};
      for (const a of result.assignments) {
        const members = a.members || [];
        const rMissing = members.filter(m => !presentSet.has(m?.id)).length;
        if (rMissing > 0) {
          missingSlotsByRole[a.role] = (missingSlotsByRole[a.role] || 0) + rMissing;
        }
      }

      // quick-fill from standins and reserve those standins
      const standinPool = standins.slice();
      const fills = tryQuickFill(missingSlotsByRole, standinPool);
      metrics.quickFilled += fills.length;

      // attempt to reserve any filled standins + remaining present assigned ids
      const presentAssigned = assignedMemberIds.filter(id => presentSet.has(id));
      const toReserveIds = presentAssigned.concat(fills.map(f => f.id));
      const reserveAfterFill = reservationStore.reserve(toReserveIds, { ttl: 3000 });
      if (reserveAfterFill && reserveAfterFill.ok) {
        // treat as success: commit and remove presentAssigned from queue
        reservationStore.commit(toReserveIds);
        g.queue = removeEntriesById(g.queue, presentAssigned);
        metrics.success += 1; metrics.perGame[g.id].success += 1; metrics.perGame[g.id].reservationSucc += 1; metrics.reservationSucceeded += 1;
        continue;
      }

      // Quick-fill + reserve didn't suffice -> attempt one immediate retry with relaxed sensitivity
      metrics.retriesAttempted += 1;
      const originalSens = Number(process.env.RANK_ADAPTIVE_SENSITIVITY || conf.sensitivity);
      const relaxed = originalSens + 0.1;
      process.env.RANK_ADAPTIVE_SENSITIVITY = String(relaxed);
      const retryResult = matchAsyncParticipants({ roles: g.roles, queue: g.queue.slice(), standins: standins.slice(), scoreWindows: [100, 200] });
      process.env.RANK_ADAPTIVE_SENSITIVITY = String(originalSens);

      if (retryResult && retryResult.ready === true && Array.isArray(retryResult.assignments) && retryResult.assignments.length > 0) {
        const retryAssignedIds = [];
        retryResult.assignments.forEach(a => { (a.members || []).forEach(m => { if (m && m.id) retryAssignedIds.push(m.id); }); });
        const presentSetRetry = new Set(g.queue.map(q => q.id));
        const missingOnRetry = retryAssignedIds.filter(id => !presentSetRetry.has(id));
        if (missingOnRetry.length === 0) {
          const r2 = reservationStore.reserve(retryAssignedIds, { ttl: 3000 });
          if (r2 && r2.ok) {
            reservationStore.commit(retryAssignedIds);
            g.queue = removeEntriesById(g.queue, retryAssignedIds);
            metrics.retriesSucceeded += 1; metrics.success += 1; metrics.perGame[g.id].success += 1;
            continue;
          }
        }
      }

      // still failed -> leave queue unchanged and rely on future ticks
    }
  }

  const out = { generatedAt: new Date().toISOString(), config: conf, metrics };
  const outDir = path.join(process.cwd(), 'reports'); fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `matching-live-reservation-poc-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outPath); console.log('METRICS', JSON.stringify(metrics, null, 2));
  return out;
}

if (require.main === module) { runReservationSim().catch(err => { console.error(err); process.exit(1); }); }
module.exports = { runReservationSim };
