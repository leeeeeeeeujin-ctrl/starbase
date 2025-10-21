import { parseCookies } from '@/lib/server/cookies'
import { getRealGameSimulator } from '@/lib/mockGameServerReal'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'

function ensureAuthorised(req) {
  const password = process.env.ADMIN_PORTAL_PASSWORD
  if (!password || !password.trim()) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' }
  }
  const cookieHeader = req.headers.cookie || ''
  const cookies = parseCookies(cookieHeader)
  const token = cookies[COOKIE_NAME]
  const expected = require('crypto').createHash('sha256').update(password).digest('hex')
  if (!token || token !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }
  return { ok: true }
}

export default async function handler(req, res) {
  const auth = ensureAuthorised(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const { gameId, mode, heroIds, config } = req.body || {}

  if (!gameId) return res.status(400).json({ error: 'missing_game_id' })
  if (!Array.isArray(heroIds) || heroIds.length === 0) {
    return res.status(400).json({ error: 'missing_hero_ids' })
  }

  try {
    const simulator = getRealGameSimulator()
    const snapshot = await simulator.createSession(supabaseAdmin, {
      gameId,
      mode: mode || 'rank_solo',
      heroIds,
      config: config || {},
    })

    return res.status(200).json({ snapshot })
  } catch (e) {
    return res.status(500).json({ error: 'create_failed', detail: e.message })
  }
}
