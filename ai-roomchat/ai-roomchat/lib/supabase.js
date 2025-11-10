// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

import { sanitizeSupabaseUrl } from './supabaseEnv';
import { createSupabaseAuthConfig } from './supabaseAuthConfig';

// ❗반드시 .env.local에 넣으세요
// NEXT_PUBLIC_SUPABASE_URL=https://jvopmawzszamguydylwu.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

const rawUrl = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isCiBuild =
  String(process.env.CI || '').toLowerCase() === 'true' || String(process.env.CI || '') === '1';
const isTestEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'test';

const url = rawUrl || (isCiBuild || isTestEnv ? 'http://localhost/dummy-supabase' : rawUrl);
const anon = rawAnon || (isCiBuild || isTestEnv ? 'anon-placeholder' : rawAnon);

// Graceful fallback: export a no-op client when env is missing to avoid runtime crashes in optional features.
function createNoop(){
  const noop = async () => ({ data: null, error: null });
  return {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => ({ select: noop, insert: noop, update: noop, delete: noop, maybeSingle: noop, single: noop }),
  };
}

export const supabase = (url && anon) ? createClient(url, anon, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // 코드 교환은 콜백 페이지에서만
  },
  global: (() => {
    const authConfig = createSupabaseAuthConfig(url, {
      apikey: anon,
    });
    return {
      headers: authConfig.headers,
      fetch: authConfig.fetch,
    };
  })(),
}) : createNoop();
