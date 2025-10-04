import { useCallback, useRef } from 'react'

import { supabase } from '../../../lib/supabase'

export default function usePersistApiKey() {
  const lastStoredApiKeyRef = useRef('')

  return useCallback(async (value, version) => {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (!trimmed) {
      return false
    }
    if (lastStoredApiKeyRef.current === trimmed) {
      return true
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }

    const token = sessionData?.session?.access_token
    if (!token) {
      throw new Error('세션 토큰을 확인할 수 없습니다.')
    }

    const response = await fetch('/api/rank/user-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        apiKey: trimmed,
        apiVersion: typeof version === 'string' ? version : undefined,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const message = payload?.error || 'API 키를 저장하지 못했습니다.'
      throw new Error(message)
    }

    lastStoredApiKeyRef.current = trimmed
    return true
  }, [])
}
