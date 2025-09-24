// pages/api/rank/run-turn.js
import { callChat } from '@/lib/rank/ai'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { apiKey, prompt, system = '', apiVersion = 'chat_completions' } = req.body || {}

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'missing_prompt' })
  }
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const result = await callChat({
    userApiKey: apiKey,
    system: typeof system === 'string' ? system : '',
    user: prompt,
    apiVersion,
  })

  if (result?.error) {
    return res.status(400).json(result)
  }

  return res.status(200).json(result)
}
