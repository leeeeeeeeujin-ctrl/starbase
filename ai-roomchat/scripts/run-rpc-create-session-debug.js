// run-rpc-create-session-debug.js
// Calls the debug finalize RPC (finalize_rank_session_outcome_debug) with UUID participant_ids

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  try {
    let { data: games, error: gamesErr } = await supabase
      .from('rank_games')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (gamesErr) throw gamesErr;

    let gameId;
    if (games && games.length > 0 && games[0].id) {
      gameId = games[0].id;
      console.log('Using existing game id', gameId);
    } else {
      const gameName = `test-game-${Date.now()}`;
      console.log('No existing games found; inserting test game:', gameName);
      let { data: game, error: gameErr } = await supabase
        .from('rank_games')
        .insert([{ name: gameName, description: 'temporary test game' }])
        .select('id')
        .maybeSingle();

      if (gameErr) throw gameErr;
      gameId = game.id;
      console.log('Created game id', gameId);
    }

    const { data: session, error: sessionErr } = await supabase
      .from('rank_sessions')
      .insert([{ game_id: gameId, status: 'active' }])
      .select('id')
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    const sessionId = session.id;
    console.log('Created session id', sessionId);

    const p1 = crypto.randomUUID();
    const p2 = crypto.randomUUID();
    const p3 = crypto.randomUUID();

    const outcomes = [
      { participant_id: p1, channel: 'support' },
      { participant_id: p2, channel: 'attacker' },
      { participant_id: p3, channel: null }
    ];

    console.log('Using participant_ids:', p1, p2, p3);

    console.log('Calling finalize_rank_session_outcome_debug for session', sessionId);
    const { data: rpcData, error: rpcErr } = await supabase.rpc('finalize_rank_session_outcome_debug', {
      p_session_id: sessionId,
      p_game_id: null,
      p_outcomes: outcomes,
      p_roles: [],
      p_summary: {}
    });

    if (rpcErr) {
      console.error('RPC error:', rpcErr);
    } else {
      console.log('RPC result:', JSON.stringify(rpcData, null, 2));
    }

    const { data: logs, error: logsErr } = await supabase
      .from('rank_session_battle_logs')
      .select('payload')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (logsErr) throw logsErr;
    if (logs && logs.length > 0) {
      console.log('Latest battle log payload.channels:', JSON.stringify(logs[0].payload.channels, null, 2));
    } else {
      console.log('No battle logs found for session', sessionId);
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(3);
  }
}

main();
