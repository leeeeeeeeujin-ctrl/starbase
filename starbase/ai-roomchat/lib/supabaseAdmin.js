import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ server-only

if (!url || !key) throw new Error('Missing SUPABASE envs')

export const supabaseAdmin = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  },
})
