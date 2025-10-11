'use client'

function safeParse(json) {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch (error) {
    return null
  }
}

export async function requestMatchReadySignal({
  sessionId,
  gameId,
  matchInstanceId,
  participantId,
  windowSeconds = 15,
  signal,
} = {}) {
  const payload = {}
  if (sessionId) payload.session_id = sessionId
  if (gameId) payload.game_id = gameId
  if (matchInstanceId) payload.match_instance_id = matchInstanceId
  if (participantId) payload.participant_id = participantId
  if (windowSeconds) payload.window_seconds = windowSeconds

  const response = await fetch('/api/rank/ready-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
