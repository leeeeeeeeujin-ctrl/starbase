'use client'

import { supabase } from '../supabase'

function safeParse(json) {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch (error) {
    return null
  }
}

function sanitizeToken(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}

async function resolveAccessToken(providedToken) {
  const direct = sanitizeToken(providedToken)
  if (direct) {
    return direct
  }

  if (!supabase?.auth?.getSession) {
    return ''
  }

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      return ''
    }
    return sanitizeToken(data?.session?.access_token)
  } catch (error) {
    return ''
  }
}

export async function requestMatchReadySignal({
  sessionId,
  gameId,
  matchInstanceId,
  participantId,
  token,
  windowSeconds = 15,
  signal,
} = {}) {
  const payload = {}
  if (sessionId) payload.session_id = sessionId
  if (gameId) payload.game_id = gameId
  if (matchInstanceId) payload.match_instance_id = matchInstanceId
  if (participantId) payload.participant_id = participantId
  if (windowSeconds) payload.window_seconds = windowSeconds

  const accessToken = await resolveAccessToken(token)
  if (!accessToken) {
    const error = new Error('missing_access_token')
    error.payload = { error: 'missing_access_token' }
    throw error
  }

  const response = await fetch('/api/rank/ready-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  })

  const text = await response.text()
  const data = safeParse(text) || {}

  if (!response.ok) {
    const error = new Error(data?.error || 'ready_check_failed')
    error.response = response
    error.payload = data
    throw error
  }

  return data
}
