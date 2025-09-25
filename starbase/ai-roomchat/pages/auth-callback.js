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
        const href = typeof window !== 'undefined' ? window.location.href : ''
        if (!href) {
          return
        }

        const currentUrl = new URL(href)
        const code = currentUrl.searchParams.get('code')
        const errorDescription = currentUrl.searchParams.get('error_description')
        const nextPath = sanitizeNextPath(currentUrl.searchParams.get('next'))

        if (errorDescription) {
          const decoded = decodeURIComponent(errorDescription)
          setMsg(`로그인 실패: ${decoded}`)
          setTimeout(() => router.replace('/'), 1200)
          return
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }

        if (!session) {
          if (!code) {
            setMsg('로그인 코드가 존재하지 않습니다. 홈으로 이동합니다.')
            setTimeout(() => router.replace('/'), 1200)
            return
          }

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error(exchangeError)
            setMsg(`로그인 실패: ${exchangeError.message}`)
            setTimeout(() => router.replace('/'), 1200)
            return
          }
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) {
          throw userError
        }

        if (user) {
          setMsg('로그인 완료! 이동 중…')
          router.replace(nextPath)
        } else {
          setMsg('로그인 실패. 홈으로 이동합니다.')
          setTimeout(() => router.replace('/'), 1200)
        }
      } catch (e) {
        console.error(e)
        setMsg('로그인 중 오류. 홈으로 이동합니다.')
        setTimeout(() => router.replace('/'), 1200)
      }
    }

    if (mounted) run()
    return () => { mounted = false }
  }, [router])

  function sanitizeNextPath(raw) {
    if (!raw || raw === '/' || raw === '') {
      return '/roster'
    }

    // 외부 리디렉션 방지: http/https로 시작하면 기본 페이지로
    if (/^https?:/i.test(raw) || raw.startsWith('//')) {
      return '/roster'
    }

    return raw.startsWith('/') ? raw : `/${raw}`
  }

  return <div style={{ padding:24 }}>{msg}</div>
}
