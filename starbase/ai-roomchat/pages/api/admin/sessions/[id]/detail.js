import { parseCookies } from '@/lib/server/cookies'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD
  if (!value || !value.trim()) return null
  return value
}

function getSessionToken(secret) {
  const { createHash } = require('crypto')
  return createHash('sha256').update(secret).digest('hex')
}

function isAuthorised(req) {
  const password = getConfiguredPassword()
  if (!password) return { ok: false, status: 500, message: 'Admin portal password is not configured' }
  const cookieHeader = req.headers.cookie || ''
  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies[COOKIE_NAME]
  if (!sessionToken) return { ok: false, status: 401, message: 'Missing session token' }
  const expected = getSessionToken(password)
  if (sessionToken !== expected) return { ok: false, status: 401, message: 'Invalid session token' }
  return { ok: true }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const auth = isAuthorised(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message })

  const id = (req.query.id || '').trim()
  if (!id) return res.status(400).json({ error: 'missing_session_id' })

  try {
    const [{ data: session, error: sErr }, { data: metas, error: mErr }, { data: battles, error: bErr }] = await Promise.all([
      supabaseAdmin.from('rank_sessions').select('*').eq('id', id).maybeSingle(),
      supabaseAdmin.from('rank_session_meta').select('*').eq('session_id', id),
      supabaseAdmin.from('rank_battles').select('*').eq('game_id', supabaseAdmin.rpc ? undefined : undefined).eq('game_id', null).limit(0),
    ])
    if (sErr) throw sErr
    if (!session) return res.status(404).json({ error: 'not_found' })

    // Fetch battles by game_id (sessions reference game_id)
    const { data: battleList, error: battleErr } = await supabaseAdmin
      .from('rank_battles')
      .select('*')
      .eq('game_id', session.game_id)
      .order('created_at', { ascending: true })
    if (battleErr) throw battleErr

    const battleIds = (battleList || []).map((b) => b.id)
    let logsMap = {}
    if (battleIds.length) {
      const { data: logs, error: logErr } = await supabaseAdmin
        .from('rank_battle_logs')
        .select('*')
        .in('battle_id', battleIds)
        .order('created_at', { ascending: true })
      if (logErr) throw logErr
      logsMap = (logs || []).reduce((acc, row) => {
        const key = row.battle_id
        if (!acc[key]) acc[key] = []
        acc[key].push(row)
        return acc
      }, {})
    }

    const battlesWithLogs = (battleList || []).map((b) => ({ ...b, logs: logsMap[b.id] || [] }))

    return res.status(200).json({ session, metas: metas || [], battles: battlesWithLogs })
  } catch (e) {
    console.error('[admin/sessions/detail] failure', e)
    return res.status(500).json({ error: 'Failed to load session detail', message: e.message })
  }
}

export const config = { api: { bodyParser: false } }
