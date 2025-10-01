// lib/rank/db.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env value')
}

if (!serviceKey && !anonKey) {
  throw new Error('Missing Supabase key. Provide SUPABASE_SERVICE_ROLE or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, serviceKey || anonKey, {
  auth: { persistSession: false },
})
