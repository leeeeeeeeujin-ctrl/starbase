// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

import { sanitizeSupabaseUrl } from './supabaseEnv'
import { createSupabaseAuthConfig } from './supabaseAuthConfig'

// ❗반드시 .env.local에 넣으세요
// NEXT_PUBLIC_SUPABASE_URL=https://jvopmawzszamguydylwu.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error('Missing Supabase env. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anon, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // 코드 교환은 콜백 페이지에서만
  },
  global: (() => {
    const authConfig = createSupabaseAuthConfig(url, {
      apikey: anon,
    })
    return {
      headers: authConfig.headers,
      fetch: authConfig.fetch,
    }
  })(),
})
