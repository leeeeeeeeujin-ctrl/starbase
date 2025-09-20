// pages/auth-callback.js  ← 방법 B를 선택한 예시
'use client'
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
        // URL에 code가 있을 때만 교환 시도 (400 소음 방지)
        const href = typeof window !== 'undefined' ? window.location.href : ''
        const hasCode = href.includes('code=')
        const { data: { session } } = await supabase.auth.getSession()

        if (!session && hasCode) {
          await supabase.auth.exchangeCodeForSession(href)
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setMsg('로그인 완료! 이동 중…')
          router.replace('/roster')
        } else {
          setMsg('로그인 실패. 홈으로 이동합니다.')
          setTimeout(() => router.replace('/'), 600)
        }
      } catch (e) {
        console.error(e)
        setMsg('로그인 중 오류. 홈으로 이동합니다.')
        setTimeout(() => router.replace('/'), 600)
      }
    }
    if (mounted) run()
    return () => { mounted = false }
  }, [router])

  return <div style={{ padding:24 }}>{msg}</div>
}
