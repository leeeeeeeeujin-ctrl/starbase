"use client"

import { supabase } from '../supabase'

let initialized = false
let lastToken = null

export function ensureRealtimeAuth() {
  if (initialized) {
    return
  }
  initialized = true

  const applyToken = (session) => {
    const token = session?.access_token || null
    if (token === lastToken) {
      return
    }
    lastToken = token
    try {
      supabase.realtime.setAuth(token || '')
    } catch (error) {
      console.warn('[realtime] 토큰 동기화 실패', error)
    }
  }

  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.warn('[realtime] 세션 정보를 불러오지 못했습니다.', error)
      return
    }
    applyToken(data?.session || null)
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    applyToken(session || null)
  })
}
