import { createClient } from '@supabase/supabase-js'

import { normalizeGeminiMode } from '@/lib/rank/geminiConfig'
import { fetchGeminiModelList } from '@/lib/rank/geminiModelsService'
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv'

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for gemini-models API')
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
})

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

  const { apiKey, mode } = payload || {}
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
  if (!trimmedKey) {
    return res.status(400).json({ error: 'missing_user_api_key' })
  }

  const normalizedMode = normalizeGeminiMode(mode)
  const result = await fetchGeminiModelList({ apiKey: trimmedKey, mode: normalizedMode })

  if (!result.ok) {
    const status = result.status || 500
    return res
      .status(status)
      .json({ error: result.errorCode || 'list_models_failed', detail: result.detail || '' })
  }

  return res.status(200).json({
    ok: true,
    mode: normalizedMode,
    models: result.models || [],
    fallback: !!result.fallback,
  })
}
