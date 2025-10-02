import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TABLE_NAME = 'rank_cooldown_timeline_uploads'

function toJson(value) {
  if (!value) return {}
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (error) {
      return {}
    }
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      return {}
    }
  }
  return {}
}

function toIso(value) {
  if (!value) return null
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date.toISOString()
  } catch (error) {
    return null
  }
}

function sanitizeText(value, fallback = null) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return fallback
}

function normalizeStatus(value) {
  const normalized = sanitizeText(value)
  if (!normalized) return 'unknown'
  switch (normalized) {
    case 'uploaded':
    case 'skipped':
    case 'failed':
      return normalized
    default:
      return 'unknown'
  }
}

function normalizeFormat(value) {
  const normalized = sanitizeText(value)
  if (!normalized) return null
  return normalized.toLowerCase()
}

function normalizeSection(value) {
  return sanitizeText(value, 'unknown')
}

function normalizeMode(value) {
  const normalized = sanitizeText(value)
  return normalized || null
}

function getOccurrenceTimestamp(row) {
  return toIso(row.uploadedAt || row.insertedAt)
}

function buildSummary(entries, { now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const oneDayMs = 24 * 60 * 60 * 1000
  const sevenDaysMs = 7 * oneDayMs
  const thirtyDaysMs = 30 * oneDayMs

  const summary = {
    overall: {
      lastSuccessAt: null,
      lastSuccessSection: null,
      success24h: 0,
      success7d: 0,
      success30d: 0,
      failures24h: 0,
      failures7d: 0,
      skipped24h: 0,
      skipped7d: 0,
    },
    groups: [],
  }

  const groupMap = new Map()

  for (const entry of entries) {
    const groupKey = `${entry.section || 'unknown'}::${entry.mode || 'default'}`
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        section: entry.section || 'unknown',
        mode: entry.mode || null,
        lastEvent: null,
        lastSuccess: null,
        success24h: 0,
        success7d: 0,
        success30d: 0,
        failures24h: 0,
        failures7d: 0,
        skipped24h: 0,
        skipped7d: 0,
        formats: new Map(),
      })
    }

    const group = groupMap.get(groupKey)
    const occurredAtIso = getOccurrenceTimestamp(entry)
    const occurredMs = occurredAtIso ? Date.parse(occurredAtIso) : null

    if (!group.lastEvent || (occurredMs !== null && occurredMs > Date.parse(group.lastEvent.insertedAt || group.lastEvent.uploadedAt || 0))) {
      group.lastEvent = {
        status: entry.status,
        insertedAt: entry.insertedAt || null,
        uploadedAt: entry.uploadedAt || null,
        format: entry.format || null,
        strategy: entry.strategy || null,
        filename: entry.filename || null,
        errorMessage: entry.errorMessage || null,
      }
    }

    const formatKey = entry.format || 'unknown'
    if (!group.formats.has(formatKey)) {
      group.formats.set(formatKey, {
        format: entry.format || null,
        lastEvent: null,
        lastSuccessAt: null,
        success24h: 0,
        success7d: 0,
        success30d: 0,
        failures24h: 0,
        failures7d: 0,
        skipped24h: 0,
        skipped7d: 0,
      })
    }

    const formatSummary = group.formats.get(formatKey)

    if (!formatSummary.lastEvent || (occurredMs !== null && occurredMs > Date.parse(formatSummary.lastEvent.insertedAt || formatSummary.lastEvent.uploadedAt || 0))) {
      formatSummary.lastEvent = {
        status: entry.status,
        insertedAt: entry.insertedAt || null,
        uploadedAt: entry.uploadedAt || null,
        strategy: entry.strategy || null,
        filename: entry.filename || null,
        errorMessage: entry.errorMessage || null,
      }
    }

    if (entry.status === 'uploaded') {
      if (!group.lastSuccess || (occurredMs !== null && occurredMs > Date.parse(group.lastSuccess))) {
        group.lastSuccess = occurredAtIso
      }
      if (!formatSummary.lastSuccessAt || (occurredMs !== null && occurredMs > Date.parse(formatSummary.lastSuccessAt))) {
        formatSummary.lastSuccessAt = occurredAtIso
      }
      if (occurredMs !== null) {
        if (nowMs - occurredMs <= oneDayMs) {
          group.success24h += 1
          formatSummary.success24h += 1
          summary.overall.success24h += 1
        }
        if (nowMs - occurredMs <= sevenDaysMs) {
          group.success7d += 1
          formatSummary.success7d += 1
          summary.overall.success7d += 1
        }
        if (nowMs - occurredMs <= thirtyDaysMs) {
          group.success30d += 1
          formatSummary.success30d += 1
          summary.overall.success30d += 1
        }
        if (!summary.overall.lastSuccessAt || occurredMs > Date.parse(summary.overall.lastSuccessAt)) {
          summary.overall.lastSuccessAt = occurredAtIso
          summary.overall.lastSuccessSection = groupKey
        }
      }
    } else if (entry.status === 'failed') {
      if (occurredMs !== null) {
        if (nowMs - occurredMs <= oneDayMs) {
          group.failures24h += 1
          formatSummary.failures24h += 1
          summary.overall.failures24h += 1
        }
        if (nowMs - occurredMs <= sevenDaysMs) {
          group.failures7d += 1
          formatSummary.failures7d += 1
          summary.overall.failures7d += 1
        }
      }
    } else if (entry.status === 'skipped') {
      if (occurredMs !== null) {
        if (nowMs - occurredMs <= oneDayMs) {
          group.skipped24h += 1
          formatSummary.skipped24h += 1
          summary.overall.skipped24h += 1
        }
        if (nowMs - occurredMs <= sevenDaysMs) {
          group.skipped7d += 1
          formatSummary.skipped7d += 1
          summary.overall.skipped7d += 1
        }
      }
    }
  }

  summary.groups = Array.from(groupMap.values()).map((group) => ({
    key: group.key,
    section: group.section,
    mode: group.mode,
    lastEvent: group.lastEvent,
    lastSuccessAt: group.lastSuccess,
    success24h: group.success24h,
    success7d: group.success7d,
    success30d: group.success30d,
    failures24h: group.failures24h,
    failures7d: group.failures7d,
    skipped24h: group.skipped24h,
    skipped7d: group.skipped7d,
    formats: Array.from(group.formats.values()),
  }))

  summary.groups.sort((a, b) => {
    const aTime = a.lastEvent?.insertedAt ? Date.parse(a.lastEvent.insertedAt) : 0
    const bTime = b.lastEvent?.insertedAt ? Date.parse(b.lastEvent.insertedAt) : 0
    return bTime - aTime
  })

  return summary
}

function normalizeRow(row = {}) {
  return {
    id: row.id || null,
    section: normalizeSection(row.section),
    mode: normalizeMode(row.mode),
    format: normalizeFormat(row.format),
    status: normalizeStatus(row.status),
    strategy: sanitizeText(row.strategy),
    filename: sanitizeText(row.filename),
    uploadedAt: toIso(row.uploaded_at),
    insertedAt: toIso(row.inserted_at),
    metadata: toJson(row.metadata),
    errorMessage: sanitizeText(row.error_message),
  }
}

export async function recordTimelineUploadEvent({
  section,
  mode,
  format,
  status,
  strategy,
  filename,
  metadata,
  uploadedAt,
  errorMessage,
} = {}) {
  try {
    const payload = {
      section: normalizeSection(section),
      mode: normalizeMode(mode),
      format: normalizeFormat(format),
      status: normalizeStatus(status),
      strategy: sanitizeText(strategy),
      filename: sanitizeText(filename),
      uploaded_at: toIso(uploadedAt) || new Date().toISOString(),
      metadata: toJson(metadata),
      error_message: sanitizeText(errorMessage),
    }

    const { error } = await supabaseAdmin.from(TABLE_NAME).insert([payload])
    if (error) {
      console.error('[cooldown-timeline-uploads] insert failed', error)
      return { inserted: false, error }
    }

    return { inserted: true }
  } catch (error) {
    console.error('[cooldown-timeline-uploads] unexpected failure', error)
    return { inserted: false, error }
  }
}

export async function fetchTimelineUploadSummary({ limit = 30, now = new Date() } = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select(
        'id, section, mode, format, status, strategy, filename, uploaded_at, inserted_at, metadata, error_message',
      )
      .order('inserted_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)))

    if (error) {
      console.error('[cooldown-timeline-uploads] select failed', error)
      return { recent: [], summary: buildSummary([], { now }), error }
    }

    const rows = Array.isArray(data) ? data.map((row) => normalizeRow(row)) : []
    const summary = buildSummary(rows, { now })

    return { recent: rows, summary }
  } catch (error) {
    console.error('[cooldown-timeline-uploads] unexpected failure', error)
    return { recent: [], summary: buildSummary([], { now }) }
  }
}

export { buildSummary as summarizeTimelineUploadRows }
