import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL') ??
  Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') ??
  ''
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE') ??
  ''

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase service-role environment variables for Edge function')
}

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'X-Client-Info': 'rank-edge-functions',
    },
  },
})
