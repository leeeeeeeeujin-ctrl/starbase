import crypto from 'crypto'

import { parseCookies } from '@/lib/server/cookies'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'rank_admin_portal_session'
const RULE_TYPES = new Set(['favorite', 'subscription'])
const MAX_LABEL_LENGTH = 80
const MAX_NOTES_LENGTH = 160

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

  const cookies = parseCookies(req.headers.cookie || '')
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

function sanitiseString(value, { maxLength = 120 } = {}) {
  if (!value || typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.slice(0, maxLength)
}

function sanitiseSortOrder(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return 0
  }
  return Math.max(-999, Math.min(999, parsed))
}

function sanitiseFilters(raw = {}) {
  const ownerId = sanitiseString(raw.ownerId, { maxLength: 64 })
  const profileKey = sanitiseString(raw.profileKey, { maxLength: 128 })
  const heroId = sanitiseString(raw.heroId, { maxLength: 64 })
  const range = sanitiseString(raw.range, { maxLength: 24 })
  const search = sanitiseString(raw.search, { maxLength: 120 })
  const eventTypes = Array.isArray(raw.eventTypes)
    ? Array.from(
        new Set(
          raw.eventTypes
            .map((item) => sanitiseString(item, { maxLength: 48 }))
            .filter(Boolean),
        ),
      )
    : []

  return {
    range: range || null,
    ownerId,
    profileKey,
    heroId,
    search,
    eventTypes,
  }
}

function sanitiseTrend(raw = {}) {
  const stackMode = sanitiseString(raw.stackMode, { maxLength: 24 }) || 'total'
  const stackLimit = sanitiseString(raw.stackLimit, { maxLength: 24 }) || 'top5'
  return { stackMode, stackLimit }
}

function sanitiseSlack(raw = {}) {
  const channel = sanitiseString(raw.channel, { maxLength: 60 })
  const mention = sanitiseString(raw.mention, { maxLength: 60 })
  const webhookKey = sanitiseString(raw.webhookKey, { maxLength: 80 })
  const alwaysInclude = Boolean(raw.alwaysInclude)
  const notifyOnAnomaly = raw.notifyOnAnomaly !== undefined ? Boolean(raw.notifyOnAnomaly) : true
  const minEventsRaw = Number.parseInt(raw.minEvents, 10)
  const lookbackRaw = Number.parseInt(raw.lookbackWeeks, 10)

  const minEvents = Number.isFinite(minEventsRaw) && minEventsRaw > 0 ? Math.min(minEventsRaw, 500) : 1
  const lookbackWeeks = Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? Math.min(lookbackRaw, 52) : 4

  return {
    channel,
    mention,
    webhookKey,
    minEvents,
    lookbackWeeks,
    alwaysInclude,
    notifyOnAnomaly,
  }
}

function normaliseRule(record) {
  if (!record) return null
  const filters = sanitiseFilters(record.config?.filters || {})
  const trend = sanitiseTrend(record.config?.trend || {})

  if (record.rule_type === 'subscription') {
    return {
      id: record.id,
      type: 'subscription',
      label: record.label,
      notes: record.notes || '',
      sortOrder: record.sort_order || 0,
      updatedAt: record.updated_at || null,
      filters,
      trend,
      slack: sanitiseSlack(record.config?.slack || {}),
    }
  }

  return {
    id: record.id,
    type: 'favorite',
    label: record.label,
    notes: record.notes || '',
    sortOrder: record.sort_order || 0,
    updatedAt: record.updated_at || null,
    filters,
    trend,
  }
}

async function handleGet(req, res) {
  const { data, error } = await supabaseAdmin
    .from('rank_audio_monitor_rules')
    .select('id, rule_type, label, notes, config, sort_order, updated_at')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[admin/audio-monitor-rules] failed to fetch rules', error)
    return res.status(500).json({ error: 'Failed to fetch audio monitor rules' })
  }

  const favorites = []
  const subscriptions = []

  for (const record of data || []) {
    const normalised = normaliseRule(record)
    if (!normalised) continue
    if (normalised.type === 'subscription') {
      subscriptions.push(normalised)
    } else {
      favorites.push(normalised)
    }
  }

  return res.status(200).json({ favorites, subscriptions })
}

function buildRulePayload(body, { requireId = false } = {}) {
  const type = sanitiseString(body.type, { maxLength: 32 }).toLowerCase()
  const label = sanitiseString(body.label, { maxLength: MAX_LABEL_LENGTH })
  const notes = sanitiseString(body.notes, { maxLength: MAX_NOTES_LENGTH })
  const sortOrder = sanitiseSortOrder(body.sortOrder)
  const filters = sanitiseFilters(body.filters || {})
  const trend = sanitiseTrend(body.trend || {})
  const slack = sanitiseSlack(body.slack || {})

  if (!RULE_TYPES.has(type)) {
    return { error: 'Unsupported rule type' }
  }

  if (!label) {
    return { error: 'Label is required' }
  }

  if (type === 'subscription' && !slack.channel && !slack.webhookKey) {
    return { error: 'Slack channel 또는 Webhook 식별자가 필요합니다.' }
  }

  const payload = {
    type,
    label,
    notes,
    sortOrder,
    filters,
    trend,
    slack,
  }

  if (requireId) {
    const id = sanitiseString(body.id, { maxLength: 64 })
    if (!id) {
      return { error: 'Rule id is required' }
    }
    payload.id = id
  } else if (body.id) {
    const id = sanitiseString(body.id, { maxLength: 64 })
    if (id) {
      payload.id = id
    }
  }

  return { payload }
}

async function handlePost(req, res) {
  const { payload, error } = buildRulePayload(req.body || {})
  if (error) {
    return res.status(400).json({ error })
  }

  try {
    const config = { filters: payload.filters, trend: payload.trend }
    if (payload.type === 'subscription') {
      config.slack = payload.slack
    }

    const insertPayload = {
      rule_type: payload.type,
      label: payload.label,
      notes: payload.notes,
      config,
      sort_order: payload.sortOrder,
    }

    const { data, error: insertError } = await supabaseAdmin
      .from('rank_audio_monitor_rules')
      .insert([insertPayload])
      .select('id, rule_type, label, notes, config, sort_order, updated_at')
      .single()

    if (insertError) {
      console.error('[admin/audio-monitor-rules] failed to insert rule', insertError)
      return res.status(500).json({ error: 'Failed to save rule' })
    }

    const normalised = normaliseRule(data)
    return res.status(200).json({ rule: normalised })
  } catch (err) {
    console.error('[admin/audio-monitor-rules] unexpected error inserting rule', err)
    return res.status(500).json({ error: 'Failed to save rule' })
  }
}

async function handlePut(req, res) {
  const { payload, error } = buildRulePayload(req.body || {}, { requireId: true })
  if (error) {
    return res.status(400).json({ error })
  }

  try {
    const config = { filters: payload.filters, trend: payload.trend }
    if (payload.type === 'subscription') {
      config.slack = payload.slack
    }

    const updatePayload = {
      rule_type: payload.type,
      label: payload.label,
      notes: payload.notes,
      config,
      sort_order: payload.sortOrder,
      updated_at: new Date().toISOString(),
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('rank_audio_monitor_rules')
      .update(updatePayload)
      .eq('id', payload.id)
      .select('id, rule_type, label, notes, config, sort_order, updated_at')
      .single()

    if (updateError) {
      if (updateError.code === 'PGRST116' || updateError.details?.includes('0 rows')) {
        return res.status(404).json({ error: 'Rule not found' })
      }
      console.error('[admin/audio-monitor-rules] failed to update rule', updateError)
      return res.status(500).json({ error: 'Failed to update rule' })
    }

    const normalised = normaliseRule(data)
    return res.status(200).json({ rule: normalised })
  } catch (err) {
    console.error('[admin/audio-monitor-rules] unexpected error updating rule', err)
    return res.status(500).json({ error: 'Failed to update rule' })
  }
}

async function handleDelete(req, res) {
  const id = sanitiseString(req.body?.id, { maxLength: 64 })
  if (!id) {
    return res.status(400).json({ error: 'Rule id is required' })
  }

  const { error } = await supabaseAdmin
    .from('rank_audio_monitor_rules')
    .delete()
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    if (error.code === 'PGRST116' || error.details?.includes('0 rows')) {
      return res.status(404).json({ error: 'Rule not found' })
    }
    console.error('[admin/audio-monitor-rules] failed to delete rule', error)
    return res.status(500).json({ error: 'Failed to delete rule' })
  }

  return res.status(200).json({ ok: true })
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const auth = ensureAuthorised(req)
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message })
  }

  if (req.method === 'GET') {
    return handleGet(req, res)
  }

  if (req.method === 'POST') {
    return handlePost(req, res)
  }

  if (req.method === 'PUT') {
    return handlePut(req, res)
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res)
  }

  return res.status(405).json({ error: 'Method Not Allowed' })
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8kb',
    },
  },
}
