import crypto from 'crypto'

import { parseCookies } from '@/lib/server/cookies'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'
const DEFAULT_LIMIT = 150
const MAX_LIMIT = 500

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

function parseDateQuery(value) {
  if (!value || typeof value !== 'string') {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString()
}

function parseArrayQuery(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildCsv(items) {
  const header = [
    'id',
    'created_at',
    'owner_id',
    'profile_key',
    'hero_id',
    'hero_name',
    'hero_source',
    'event_type',
    'changed_fields',
    'track_id',
    'preset_id',
    'manual_override',
  ]

  const escapeCell = (value) => {
    if (value == null) {
      return ''
    }
    const stringified = String(value)
    if (/[",\n]/.test(stringified)) {
      return `"${stringified.replace(/"/g, '""')}"`
    }
    return stringified
  }

  const rows = items.map((item) => {
    const details = item?.details || {}
    const preference = details.preference || {}
    const changedFields = Array.isArray(details.changedFields) ? details.changedFields.join('|') : ''

    const cells = [
      item.id,
      item.created_at,
      item.owner_id,
      item.profile_key,
      item.hero_id || '',
      item.hero_name || '',
      item.hero_source || '',
      item.event_type,
      changedFields,
      preference.trackId || '',
      preference.presetId || '',
      preference.manualOverride ? 'true' : 'false',
    ]

    return cells.map(escapeCell).join(',')
  })

  return [header.join(','), ...rows].join('\n')
}

function normaliseStats(items) {
  const stats = {
    total: 0,
    uniqueOwners: 0,
    uniqueProfiles: 0,
    byEventType: {},
  }

  const owners = new Set()
  const profiles = new Set()

  for (const item of items) {
    stats.total += 1
    owners.add(item.owner_id)
    profiles.add(`${item.owner_id}::${item.profile_key}`)
    const eventType = (item.event_type || 'unknown').toLowerCase()
    stats.byEventType[eventType] = (stats.byEventType[eventType] || 0) + 1
  }

  stats.uniqueOwners = owners.size
  stats.uniqueProfiles = profiles.size

  return stats
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
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT

  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : ''
  const profileKey = typeof req.query.profileKey === 'string' ? req.query.profileKey.trim() : ''
  const heroId = typeof req.query.heroId === 'string' ? req.query.heroId.trim() : ''
  const eventTypes = parseArrayQuery(req.query.eventType)
  const since = parseDateQuery(req.query.since)
  const until = parseDateQuery(req.query.until)
  const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : ''

  try {
    let query = supabaseAdmin
      .from('rank_audio_events')
      .select('id, owner_id, profile_key, hero_id, hero_name, hero_source, event_type, details, created_at')

    if (ownerId) {
      query = query.eq('owner_id', ownerId)
    }
    if (profileKey) {
      query = query.eq('profile_key', profileKey)
    }
    if (heroId) {
      query = query.eq('hero_id', heroId)
    }
    if (eventTypes.length) {
      query = query.in('event_type', eventTypes)
    }
    if (since) {
      query = query.gte('created_at', since)
    }
    if (until) {
      query = query.lte('created_at', until)
    }

    query = query.order('created_at', { ascending: false }).limit(limit)

    const { data, error } = await query

    if (error) {
      console.error('[admin/audio-events] failed to fetch events', error)
      return res.status(500).json({ error: 'Failed to fetch audio events' })
    }

    const items = Array.isArray(data) ? data : []
    const filtered = searchTerm
      ? items.filter((item) => {
          const haystacks = [
            item.hero_name,
            item.hero_source,
            item.profile_key,
            item.event_type,
            item.details?.preference?.trackId,
            item.details?.preference?.presetId,
            ...(Array.isArray(item.details?.changedFields) ? item.details.changedFields : []),
          ]
            .filter(Boolean)
            .map((value) => String(value).toLowerCase())
          return haystacks.some((value) => value.includes(searchTerm))
        })
      : items

    const stats = normaliseStats(filtered)
    const responsePayload = {
      items: filtered,
      stats,
      availableEventTypes: Array.from(
        new Set(items.map((item) => (item.event_type || '').trim()).filter(Boolean)),
      ).sort(),
    }

    if (req.query.format === 'csv') {
      const csv = buildCsv(filtered)
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="rank-audio-events-${timestamp}.csv"`)
      return res.status(200).send(csv)
    }

    return res.status(200).json(responsePayload)
  } catch (error) {
    console.error('[admin/audio-events] unexpected failure', error)
    return res.status(500).json({ error: 'Unexpected error' })
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}
