// lib/rank/ai.js

export async function callChat({ userApiKey, system, user }) {
  if (!userApiKey) return { error: 'missing_user_api_key' }
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.7
      })
    })

    if (resp.status === 401 || resp.status === 429) return { error: 'quota_exhausted' }
    if (!resp.ok) return { error: 'ai_failed', detail: (await resp.text()).slice(0, 500) }

    const json = await resp.json()
    const text = json.choices?.[0]?.message?.content ?? ''
    return { text }
  } catch {
    return { error: 'ai_network_error' }
  }
}
