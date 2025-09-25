export async function registerGame(payload) {
  const response = await fetch('/api/rank/register-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  return response.json()
}

export async function playRank({ gameId, heroIds, userApiKey }) {
  const response = await fetch('/api/rank/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, heroIds, userApiKey })
  })

  return response.json()
}
