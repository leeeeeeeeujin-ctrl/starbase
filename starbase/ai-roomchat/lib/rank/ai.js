// lib/rank/ai.js

export async function callChat({ userApiKey, system, user, apiVersion = 'gemini' }) {
  const trimmedKey = typeof userApiKey === 'string' ? userApiKey.trim() : ''
  if (!trimmedKey) {
    return { error: 'missing_user_api_key' }
  }

  const trimmedPrompt = typeof user === 'string' ? user : ''
  if (!trimmedPrompt.trim()) {
    return { error: 'missing_prompt' }
  }

  const trimmedSystem = typeof system === 'string' ? system.trim() : ''

  try {
    if (apiVersion === 'gemini') {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: trimmedPrompt }],
          },
        ],
      }

      if (trimmedSystem) {
        body.systemInstruction = {
          parts: [{ text: trimmedSystem }],
        }
      }

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${encodeURIComponent(
          trimmedKey,
        )}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )

      if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
        return { error: 'quota_exhausted' }
      }
      if (!resp.ok) {
        return { error: 'ai_failed', detail: (await resp.text()).slice(0, 500) }
      }

      const json = await resp.json()
      const parts = json?.candidates?.[0]?.content?.parts
      const text = Array.isArray(parts)
        ? parts
            .filter((part) => typeof part?.text === 'string')
            .map((part) => part.text)
            .join('\n')
        : ''
      return { text: typeof text === 'string' ? text : '' }
    }

    const headers = {
      Authorization: `Bearer ${trimmedKey}`,
      'Content-Type': 'application/json',
    }

    if (apiVersion === 'responses') {
      const input = []
      if (trimmedSystem) {
        input.push({
          role: 'system',
          content: [{ type: 'text', text: trimmedSystem }],
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
          ...(trimmedSystem
            ? [{ role: 'system', content: trimmedSystem }]
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
