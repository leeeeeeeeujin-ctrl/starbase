import crypto from 'crypto'

import { parseCookies } from '@/lib/server/cookies'
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'
const TABLE_NAME = 'rank_title_settings'
const TITLE_SLUG = 'main'

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

function ensureAuthorised(req) {
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

function mapSettings(row) {
  if (!row) return null
  return {
    slug: row.slug,
    backgroundUrl: row.background_url || '',
    note: row.update_note || null,
    updatedAt: row.updated_at || null,
  }
}

async function handleGet(req, res) {
  const auth = ensureAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('slug, background_url, update_note, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1)

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true } })
      }
      console.error('Failed to fetch title settings:', error)
      return res.status(500).json({ error: 'Failed to load title settings' })
    }

    const settings = Array.isArray(data) && data.length > 0 ? mapSettings(data[0]) : null
    return res.status(200).json({ settings, meta: { missingTable: false } })
  } catch (error) {
    console.error('Unexpected error when loading title settings:', error)
    return res.status(500).json({ error: 'Failed to load title settings' })
  }
}

async function handlePut(req, res) {
  const auth = ensureAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  const { backgroundUrl, note } = req.body || {}
  const trimmedUrl = typeof backgroundUrl === 'string' ? backgroundUrl.trim() : ''
  const trimmedNote = typeof note === 'string' ? note.trim() : null

  if (!trimmedUrl) {
    return res.status(400).json({ error: '배경 이미지를 위한 URL을 입력해주세요.' })
  }

  try {
    const now = new Date().toISOString()
    const payload = {
      slug: TITLE_SLUG,
      background_url: trimmedUrl,
      update_note: trimmedNote,
      updated_at: now,
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'slug' })
      .select('slug, background_url, update_note, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1)

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true } })
      }
      console.error('Failed to update title settings:', error)
      return res.status(500).json({ error: '타이틀 배경을 저장하지 못했습니다.' })
    }

    const settings = Array.isArray(data) && data.length > 0 ? mapSettings(data[0]) : null
    return res.status(200).json({ settings, meta: { missingTable: false } })
  } catch (error) {
    console.error('Unexpected error when saving title settings:', error)
    return res.status(500).json({ error: '타이틀 배경을 저장하지 못했습니다.' })
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method === 'PUT') {
    return handlePut(req, res)
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  return res.status(405).json({ error: 'Method Not Allowed' })
}
