/**
 * Simple test script to call the finalize_rank_session_outcome RPC using @supabase/supabase-js
 * Usage:
 *   SUPABASE_URL=https://... SUPABASE_KEY=... node scripts/test-finalize-rpc.js
 *
 * Note: This only constructs a small test payload. Replace IDs with valid UUIDs from your dev DB.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  console.error('Please set SUPABASE_URL and SUPABASE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  const sessionId = process.env.TEST_SESSION_ID || '00000000-0000-0000-0000-000000000000';
  const gameId = process.env.TEST_GAME_ID || null;

  const outcomes = [
    {
      participant_id: null,
      owner_id: null,
      role: 'alpha',
      result: 'won',
      wins: 1,
      losses: 0,
      score_delta: 10,
      channel: 'prompt',
      history: {},
    },
  ];

  const roles = [];
  const summary = { turn: 1, result: 'completed', reason: 'test' };

  const { data, error } = await supabase.rpc('finalize_rank_session_outcome', {
    p_session_id: sessionId,
    p_game_id: gameId,
    p_outcomes: outcomes,
    p_roles: roles,
    p_summary: summary,
  });

  if (error) {
    console.error('RPC error:', error);
    process.exit(2);
  }

  console.log('RPC result:', JSON.stringify(data, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(3);
});
