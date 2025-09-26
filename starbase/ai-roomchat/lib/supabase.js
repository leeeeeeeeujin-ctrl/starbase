// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

// ❗반드시 .env.local에 넣으세요
// NEXT_PUBLIC_SUPABASE_URL=https://jvopmawzszamguydylwu.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

function sanitiseSupabaseUrl(raw) {
  if (!raw) return raw
  const trimmed = raw.trim()
  const cleaned = trimmed.replace(/[)]+$/g, '')
  if (cleaned !== trimmed) {
    console.warn(
      'NEXT_PUBLIC_SUPABASE_URL 끝에 불필요한 문자를 제거했습니다. 환경 변수 값을 다시 확인해 주세요.',
    )
  }
  return cleaned
}

const url = sanitiseSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
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
})
