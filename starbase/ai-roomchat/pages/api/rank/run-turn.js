// pages/api/rank/run-turn.js
import { callChat } from '@/lib/rank/ai'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const { apiKey, prompt, system = '' } = req.body || {}

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'missing_prompt' })
  }

  const result = await callChat({
    userApiKey: apiKey,
    system: typeof system === 'string' ? system : '',
    user: prompt,
  })

  return res.status(200).json(result)
}
