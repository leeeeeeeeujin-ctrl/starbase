// lib/rank/ai.js

export async function callChat({ userApiKey, system, user, apiVersion = 'chat_completions' }) {
  if (!userApiKey) {
    return { error: 'missing_user_api_key' }
  }

  const trimmedPrompt = typeof user === 'string' ? user : ''
  if (!trimmedPrompt.trim()) {
    return { error: 'missing_prompt' }
  }

  const headers = {
    Authorization: `Bearer ${userApiKey}`,
    'Content-Type': 'application/json',
  }

  try {
    if (apiVersion === 'responses') {
      const input = []
      if (system && typeof system === 'string' && system.trim()) {
        input.push({
          role: 'system',
          content: [{ type: 'text', text: system }],
        })
      }
      input.push({
        role: 'user',
        content: [{ type: 'text', text: trimmedPrompt }],
      })

      const resp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          input,
          temperature: 0.7,
        }),
      })

      if (resp.status === 401 || resp.status === 429) {
        return { error: 'quota_exhausted' }
      }
      if (!resp.ok) {
        return { error: 'ai_failed', detail: (await resp.text()).slice(0, 500) }
      }

      const json = await resp.json()
      let text = ''
      if (Array.isArray(json.output)) {
        text = json.output
          .filter((item) => item?.type === 'message')
          .flatMap((item) => item?.message?.content || [])
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
      }
      if (!text && typeof json.output_text === 'string') {
        text = json.output_text
      }
      return { text: typeof text === 'string' ? text : '' }
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          ...(system && typeof system === 'string' && system.trim()
            ? [{ role: 'system', content: system }]
            : []),
          { role: 'user', content: trimmedPrompt },
        ],
        temperature: 0.7,
      }),
    })

    if (resp.status === 401 || resp.status === 429) {
      return { error: 'quota_exhausted' }
    }
    if (!resp.ok) {
      return { error: 'ai_failed', detail: (await resp.text()).slice(0, 500) }
    }

    const json = await resp.json()
    const text = json.choices?.[0]?.message?.content ?? ''
    return { text: typeof text === 'string' ? text : '' }
  } catch (error) {
    return { error: 'ai_network_error' }
  }
}
