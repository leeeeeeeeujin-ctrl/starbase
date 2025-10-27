const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing env SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main(){
  console.log('Querying information_schema.columns for table rank_participants...');
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name,data_type,udt_name')
    .eq('table_name', 'rank_participants');
  if (error) {
    console.error('Error querying information_schema.columns:', error);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e=>{ console.error(e); process.exit(1); });
