import crypto from 'crypto'

import { parseCookies } from '@/lib/server/cookies'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'
const DEFAULT_LIMIT = 50

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD
  if (!value || !value.trim()) {
    return null
  }
  return value
}

function getSessionToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

function isAuthorised(req) {
  const password = getConfiguredPassword()
  if (!password) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' }
  }

  const cookieHeader = req.headers.cookie || ''
  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies[COOKIE_NAME]

  if (!sessionToken) {
    return { ok: false, status: 401, message: 'Missing session token' }
  }

  const expected = getSessionToken(password)
  if (sessionToken !== expected) {
    return { ok: false, status: 401, message: 'Invalid session token' }
  }

  return { ok: true }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const auth = isAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  const limitParam = Number.parseInt(req.query.limit, 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 200 ? limitParam : DEFAULT_LIMIT

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_user_error_reports')
      .select('id, session_id, path, message, severity, stack, context, user_agent, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[admin/errors] failed to load error reports', error)
      return res.status(500).json({ error: 'Failed to fetch error reports' })
    }

    const now = Date.now()
    const last24hCutoff = now - 24 * 60 * 60 * 1000
    const stats = data.reduce(
      (accumulator, item) => {
        const createdAt = new Date(item.created_at).getTime()
        const severity = (item.severity || 'error').toLowerCase()
        accumulator.total += 1
        accumulator.bySeverity[severity] = (accumulator.bySeverity[severity] || 0) + 1
        if (!Number.isNaN(createdAt) && createdAt >= last24hCutoff) {
          accumulator.last24h += 1
        }
        return accumulator
      },
      { total: 0, last24h: 0, bySeverity: {} },
    )

    return res.status(200).json({ items: data, stats })
  } catch (error) {
    console.error('[admin/errors] unexpected failure', error)
    return res.status(500).json({ error: 'Unexpected error' })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
