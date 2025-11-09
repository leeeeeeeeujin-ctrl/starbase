// run-rpc-create-session.js
// Creates a minimal test game + session, then calls finalize_rank_session_outcome
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env, then run
//   node run-rpc-create-session.js

const { createClient } = require('@supabase/supabase-js');
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
    // 1) find an existing game, otherwise try to create one
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

    // 2) create a test session
    const { data: session, error: sessionErr } = await supabase
      .from('rank_sessions')
      .insert([{ game_id: gameId, status: 'active' }])
      .select('id')
      .maybeSingle();

    if (sessionErr) throw sessionErr;
    const sessionId = session.id;
    console.log('Created session id', sessionId);

    // 3) call finalize_rank_session_outcome RPC
    const outcomes = [
      { participant_id: null, channel: null },
      { participant_id: null, channel: '' },
      { participant_id: null, channel: 'attacker' },
    ];

    console.log('Calling finalize_rank_session_outcome for session', sessionId);
    const { data: rpcData, error: rpcErr } = await supabase.rpc('finalize_rank_session_outcome', {
      p_session_id: sessionId,
      p_game_id: null,
      p_outcomes: outcomes,
      p_roles: [],
      p_summary: {},
    });

    if (rpcErr) {
      console.error('RPC error:', rpcErr);
    } else {
      console.log('RPC result:', JSON.stringify(rpcData, null, 2));
    }

    // 4) fetch battle log payload.channels
    const { data: logs, error: logsErr } = await supabase
      .from('rank_session_battle_logs')
      .select('payload')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (logsErr) throw logsErr;
    if (logs && logs.length > 0) {
      console.log(
        'Latest battle log payload.channels:',
        JSON.stringify(logs[0].payload.channels, null, 2)
      );
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
