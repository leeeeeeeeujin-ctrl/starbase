#!/usr/bin/env node
// run-large-sim.js
// Simulator for E2E flow: create sessions, (optionally) simulate prompt/node cycles, call finalize RPC, collect logs
// Usage (from workspace root):
//  node ai-roomchat/scripts/run-large-sim.js --games 5 --sessions-per-game 10 --concurrency 5 --mode simple --preserve true

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { v4: uuidv4, validate: uuidValidate } = require('uuid');

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return out;
}

const args = parseArgs();
const GAMES = parseInt(args.games || args.gamesCount || 5, 10);
const SESSIONS_PER_GAME = parseInt(args['sessions-per-game'] || args.sessionsPerGame || 10, 10);
const CONCURRENCY = parseInt(args.concurrency || 5, 10);
const MODE = args.mode || 'simple';
const PRESERVE = args.preserve === 'false' ? false : true;
const PROMPT_CYCLES = parseInt(args['prompt-cycles'] || args.promptCycles || 3, 10);
const PROMPT_DELAY_MEAN = parseInt(args['prompt-delay-mean'] || 200, 10); // ms
const PROMPT_DELAY_JITTER = parseInt(args['prompt-delay-jitter'] || 150, 10); // ms

// diversity / error injection params
const DIVERSITY = args.diversity || 'low'; // low, medium, high
const INVALID_SESSION_CHANCE = parseFloat(args.invalidSessionChance || args.invalidSession || (DIVERSITY === 'high' ? 0.1 : DIVERSITY === 'medium' ? 0.03 : 0.0));
const MALFORMED_SUMMARY_CHANCE = parseFloat(args.malformedSummaryChance || (DIVERSITY === 'high' ? 0.06 : DIVERSITY === 'medium' ? 0.02 : 0.0));
const DUPLICATE_FINALIZE_CHANCE = parseFloat(args.duplicateFinalizeChance || (DIVERSITY === 'high' ? 0.05 : DIVERSITY === 'medium' ? 0.02 : 0.0));
const OCCASIONAL_NEW_GAME_CHANCE = parseFloat(args.newGameChance || (DIVERSITY === 'high' ? 0.15 : DIVERSITY === 'medium' ? 0.05 : 0.0));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function now() { return new Date().toISOString(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function findGameIds(limit) {
  const { data, error } = await supabase
    .from('rank_games')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(r => r.id);
}

async function createSession(gameId) {
  const { data, error } = await supabase
    .from('rank_sessions')
    .insert([{ game_id: gameId, status: 'active' }])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data.id;
}

async function finalizeSession(sessionId) {
  // randomize outcomes to increase variety
  const channels = [null, '', 'attacker', 'defender', 'support', '__no_channel__'];
  function pickChannel() { return channels[Math.floor(Math.random() * channels.length)]; }
  const outcomes = [];
  const count = 1 + Math.floor(Math.random() * 4); // 1..4 outcomes
  for (let i = 0; i < count; i++) {
    // Use UUIDs for participant_id in tests (or null). Previously numeric IDs were produced
    // which caused DB UUID parse errors when sent to the finalize RPC.
    outcomes.push({ participant_id: Math.random() > 0.6 ? uuidv4() : null, channel: pickChannel() });
  }

  const start = Date.now();
  // Defensive validation: ensure outcome participant IDs are either null or valid UUIDs.
  for (const o of outcomes) {
    if (o.participant_id !== null && !uuidValidate(o.participant_id)) {
      // If invalid, coerce to null and note in channel value
      console.warn('Coercing invalid participant_id to null for session', sessionId, 'value=', o.participant_id);
      o.participant_id = null;
    }
  }

  // Debug: log finalize payload (non-sensitive fields) to help diagnose type errors
  try { console.log('finalize payload for session', sessionId, JSON.stringify({ p_session_id: sessionId, p_outcomes: outcomes, p_summary: {} })); } catch (e) {}

  const { data, error } = await supabase.rpc('finalize_rank_session_outcome', {
    p_session_id: sessionId,
    p_game_id: null,
    p_outcomes: outcomes,
    p_roles: [],
    p_summary: {}
  });
  const dur = Date.now() - start;
  return { data, error, dur, outcomes };
}

async function fetchBattleLogPayload(sessionId) {
  const { data, error } = await supabase
    .from('rank_session_battle_logs')
    .select('payload')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data[0] && data[0].payload) || null;
}

async function runTasksWithPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let i = 0;
  async function runner() {
    while (true) {
      let idx;
      if (i >= tasks.length) break;
      idx = i++;
      try {
        const r = await tasks[idx]();
        results[idx] = { ok: true, result: r };
      } catch (err) {
        results[idx] = { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }
  }
  const runners = [];
  for (let j = 0; j < Math.min(concurrency, tasks.length); j++) runners.push(runner());
  await Promise.all(runners);
  return results;
}

function sampleDelay(mean, jitter) {
  return Math.max(10, Math.round(mean + (Math.random() - 0.5) * jitter));
}

async function simulatePromptCycle(entry, cycleIndex) {
  const start = now();
  const promptText = `SimPrompt game:${entry.gameIndex} session:${entry.sessionIndex} cycle:${cycleIndex} ts:${Date.now()}`;
  const delay = sampleDelay(PROMPT_DELAY_MEAN, PROMPT_DELAY_JITTER);
  await sleep(delay);
  const nodeOutput = `NodeOut(${cycleIndex}): ${promptText.split('').reverse().join('').slice(0, 200)}`;
  const end = now();
  return { index: cycleIndex, start, end, prompt: promptText, nodeOutput, delay };
}

async function main() {
  console.log(`Simulator starting: games=${GAMES}, sessionsPerGame=${SESSIONS_PER_GAME}, concurrency=${CONCURRENCY}, mode=${MODE}, preserve=${PRESERVE}`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const report = { meta: { ts: new Date().toISOString(), config: { GAMES, SESSIONS_PER_GAME, CONCURRENCY, MODE, PRESERVE, PROMPT_CYCLES } }, results: [], summary: {} };

  const discoveredGameIds = await findGameIds(GAMES);
  const gameIds = (discoveredGameIds && discoveredGameIds.length > 0) ? discoveredGameIds : [];
  if (gameIds.length === 0) {
    console.warn('No existing games found; create games in-app if you need owner-specific constraints satisfied. Simulator will attempt to reuse any available game.');
  }

  const tasks = [];
  for (let g = 0; g < GAMES; g++) {
    const chosenGameId = (gameIds.length > 0) ? gameIds[g % gameIds.length] : null;
    for (let s = 0; s < SESSIONS_PER_GAME; s++) {
      tasks.push(async () => {
        const entry = { gameIndex: g, sessionIndex: s, start: now(), steps: [] };
        try {
          if (!chosenGameId) {
            const reuse = (await findGameIds(1))[0];
            if (!reuse) throw new Error('No game available to attach session');
            entry.gameId = reuse;
          } else entry.gameId = chosenGameId;

          const t1 = Date.now();
          // occasionally create a new test game to increase variety (may fail if DB requires owner)
          if (Math.random() < OCCASIONAL_NEW_GAME_CHANCE) {
            const name = `sim_newgame_${Date.now()}_${Math.floor(Math.random()*10000)}`;
            try {
              const { data: gdata, error: gerr } = await supabase.from('rank_games').insert([{ name, description: 'sim-generated' }]).select('id').maybeSingle();
              if (!gerr && gdata && gdata.id) entry.gameId = gdata.id;
            } catch (e) {
              // ignore creation error, fallback to chosen game
            }
          }

          const sessionId = await createSession(entry.gameId);
          entry.sessionId = sessionId;
          entry.steps.push({ step: 'create_session', start: new Date(t1).toISOString(), end: now(), status: 'ok' });

          if (MODE === 'complex') {
            entry.promptCycles = [];
            for (let c = 0; c < PROMPT_CYCLES; c++) {
              const cycle = await simulatePromptCycle(entry, c);
              entry.promptCycles.push(cycle);
              entry.steps.push({ step: `prompt_cycle_${c}`, start: cycle.start, end: cycle.end, status: 'ok', delay: cycle.delay });
            }
          }

          const t2s = Date.now();

          // possibly inject an invalid session id to exercise 'session_not_found' paths
          let usedSessionId = sessionId;
          if (Math.random() < INVALID_SESSION_CHANCE) {
            usedSessionId = '00000000-0000-0000-0000-000000000000';
            entry.injected = entry.injected || [];
            entry.injected.push('invalid_session_id');
          }

          // possibly use malformed summary to exercise older coercion bugs
          let rpcResult;
          if (Math.random() < MALFORMED_SUMMARY_CHANCE) {
            const { data, error, dur, outcomes } = await supabase.rpc('finalize_rank_session_outcome', {
              p_session_id: usedSessionId,
              p_game_id: null,
              p_outcomes: [{ participant_id: null, channel: 'attacker' }],
              p_roles: [],
              p_summary: { turn: 'INVALID_INT' }
            });
            rpcResult = { data, error, dur, outcomes };
            entry.injected = entry.injected || [];
            entry.injected.push('malformed_summary');
          } else {
            rpcResult = await finalizeSession(usedSessionId);
          }

                  if (rpcResult.error) {
                    try {
                      console.error('Finalize RPC error for session', usedSessionId, JSON.stringify(rpcResult.error, null, 2));
                    } catch (e) {}
                    entry.steps.push({ step: 'finalize', start: new Date(t2s).toISOString(), end: now(), status: 'error', error: rpcResult.error && rpcResult.error.message ? rpcResult.error.message : String(rpcResult.error) });
                  } else {
                    entry.steps.push({ step: 'finalize', start: new Date(t2s).toISOString(), end: now(), status: 'ok', dur: rpcResult.dur, outcomes: rpcResult.outcomes });
                  }

          // duplicate finalize occasionally
          if (Math.random() < DUPLICATE_FINALIZE_CHANCE) {
            entry.injected = entry.injected || [];
            entry.injected.push('duplicate_finalize');
            try {
              const dup = await finalizeSession(sessionId);
              entry.steps.push({ step: 'finalize_duplicate', status: dup.error ? 'error' : 'ok' });
            } catch (e) {
              entry.steps.push({ step: 'finalize_duplicate', status: 'error', error: e && e.message ? e.message : String(e) });
            }
          }

          const t3s = Date.now();
          const payload = await fetchBattleLogPayload(sessionId).catch(e => null);
          entry.steps.push({ step: 'fetch_battle_log', start: new Date(t3s).toISOString(), end: now(), status: payload ? 'ok' : 'missing' });
          entry.battleLogSample = payload;

          entry.end = now();
          return entry;
        } catch (err) {
          entry.end = now();
          entry.steps.push({ step: 'error', status: 'error', error: err && err.message ? err.message : String(err) });
          return entry;
        }
      });
    }
  }

  const results = await runTasksWithPool(tasks, CONCURRENCY);
  report.results = results.map(r => r.ok ? r.result : { error: r.error });

  const total = report.results.length;
  const failed = report.results.filter(r => r.error || (r.steps && r.steps.some(s => s.status === 'error'))).length;
  const success = total - failed;
  report.summary = { total, success, failed };

  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const rptPath = path.join(reportsDir, `large-sim-${ts}.json`);
  fs.writeFileSync(rptPath, JSON.stringify(report, null, 2));
  console.log('Simulation finished. Report:', rptPath);
  console.log('Summary:', report.summary);
}

main().catch(err => { console.error('Fatal error in simulator:', err); process.exit(1); });
