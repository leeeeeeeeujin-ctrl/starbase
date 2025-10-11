import { createClient } from '@supabase/supabase-js'

import { sanitizeSupabaseUrl } from './supabaseEnv'
import { createSupabaseAuthConfig } from './supabaseAuthConfig'

export { createSupabaseAuthConfig } from './supabaseAuthConfig'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const key =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ server-only

if (!url || !key) throw new Error('Missing SUPABASE envs')

const serviceAuthConfig = createSupabaseAuthConfig(url, {
  apikey: key,
  authorization: `Bearer ${key}`,
})

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { ...serviceAuthConfig.headers },
    fetch: serviceAuthConfig.fetch,
  },
})
