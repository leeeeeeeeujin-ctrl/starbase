// inspect-rank-participants-via-supabase.js
// Query one row from rank_participants and print the id value to infer type
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main(){
  try {
    const { data, error } = await supabase
      .from('rank_participants')
      .select('id')
      .limit(1);
    if (error) { console.error('Query error:', error); process.exit(3); }
    if (!data || data.length === 0) { console.log('No rank_participants rows found'); process.exit(0); }
    console.log('Row:', data[0]);
    console.log('id typeof:', typeof data[0].id);
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e);
    process.exit(4);
  }
}

main();
