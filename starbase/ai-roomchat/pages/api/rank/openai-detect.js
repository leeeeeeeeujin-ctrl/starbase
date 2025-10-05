import { createClient } from '@supabase/supabase-js'

import { detectOpenAIPreset } from '@/lib/rank/openaiDetection'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for openai-detect API')
}

const anonClient = createClient(url, anonKey, { auth: { persistSession: false } })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  const user = userData?.user || null
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload || '{}')
    } catch (error) {
      return res.status(400).json({ error: 'invalid_payload' })
    }
  }

  const { apiKey } = payload || {}
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmedKey) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const detection = await detectOpenAIPreset({ apiKey: trimmedKey })
  if (!detection.ok) {
    const status = detection.status || 500
    return res.status(status).json({
      error: detection.errorCode || 'detect_failed',
      detail: detection.detail || 'OpenAI 버전을 확인하지 못했습니다.',
      tries: detection.tries || [],
    })
  }

  return res.status(200).json({
    ok: true,
    apiVersion: detection.apiVersion,
    model: detection.model,
    detail: detection.detail || '',
    fallback: !!detection.fallback,
    tries: detection.tries || [],
  })
}
