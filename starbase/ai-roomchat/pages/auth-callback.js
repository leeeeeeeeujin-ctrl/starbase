// pages/auth-callback.js
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [msg, setMsg] = useState('로그인 처리 중…')

  useEffect(() => {
    let mounted = true
    async function run() {
      try {
        // PKCE 코드 교환 시도
        if (typeof window !== 'undefined') {
          await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {})
        }
        // 세션 확인
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setMsg('로그인 완료! 이동 중…')
          router.replace('/roster')
        } else {
          setMsg('로그인 실패. 홈으로 이동합니다.')
          setTimeout(() => router.replace('/'), 800)
        }
      } catch (e) {
        console.error(e)
        setMsg('로그인 중 오류. 홈으로 이동합니다.')
        setTimeout(() => router.replace('/'), 800)
      }
    }
    if (mounted) run()
    return () => { mounted = false }
  }, [router])

  return <div style={{ padding:24 }}>{msg}</div>
}
