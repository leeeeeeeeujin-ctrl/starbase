// lib/rank/db.js
import { createClient } from '@supabase/supabase-js';

import { sanitizeSupabaseUrl } from '../supabaseEnv';

const supabaseUrl = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env value');
}

if (!serviceKey && !anonKey) {
  throw new Error(
    'Missing Supabase key. Provide SUPABASE_SERVICE_ROLE or NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

const supabaseKey = serviceKey || anonKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: supabaseKey,
      ...(serviceKey
        ? { Authorization: `Bearer ${serviceKey}` }
        : anonKey
          ? { Authorization: `Bearer ${anonKey}` }
          : {}),
    },
  },
});
