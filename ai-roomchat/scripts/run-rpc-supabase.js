// run-rpc-supabase.js
// Minimal runner that calls the finalize_rank_session_outcome RPC using a service role key.
// Usage:
//   1) npm install @supabase/supabase-js dotenv
//   2) create a local .env (see .env.example) or export env vars
//   3) node run-rpc-supabase.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_ID = process.env.SESSION_ID; // optional, if you want to test a specific session

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example and do NOT commit your .env file.'
  );
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const sessionId = SESSION_ID || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  // Example outcomes payload: adjust as needed
  const outcomes = [
    { participant_id: null, channel: null },
    { participant_id: null, channel: '' },
    { participant_id: null, channel: 'attacker' },
  ];

  try {
    console.log('Calling RPC finalize_rank_session_outcome for session', sessionId);
    const { data, error } = await supabase.rpc('finalize_rank_session_outcome', {
      p_session_id: sessionId,
      p_game_id: null,
      p_outcomes: outcomes,
      p_roles: [],
      p_summary: {},
    });

    if (error) {
      console.error('RPC error:', error);
      process.exitCode = 3;
    } else {
      console.log('RPC result:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exitCode = 4;
  }
}

main();
