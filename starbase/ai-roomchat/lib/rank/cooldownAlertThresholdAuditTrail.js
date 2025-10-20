import { randomUUID } from 'crypto'

const DEFAULT_TIMEOUT_MS = 8000

const ALERT_AUDIT_WEBHOOK_URL =
  process.env.RANK_COOLDOWN_ALERT_AUDIT_WEBHOOK_URL ||
  process.env.RANK_COOLDOWN_ALERT_WEBHOOK_URL ||
  process.env.SLACK_COOLDOWN_ALERT_WEBHOOK_URL ||
  null

const ALERT_AUDIT_AUTH_HEADER =
  process.env.RANK_COOLDOWN_ALERT_AUDIT_WEBHOOK_AUTHORIZATION ||
  process.env.RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION ||
  process.env.RANK_COOLDOWN_ALERT_WEBHOOK_TOKEN ||
  null

const auditTrail = []
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = DAY_MS * 7

const TIMELINE_LIMITS = {
  daily: 30,
  weekly: 26,
  monthly: 18,
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function normalizeGroup(group = {}) {
  return {
    warning:
      typeof group.warning === 'number' || group.warning === null
        ? group.warning
        : undefined,
    critical:
      typeof group.critical === 'number' || group.critical === null
        ? group.critical
        : undefined,
  }
}

function buildDiff(previous = {}, next = {}) {
  const diff = []
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])

  for (const key of keys) {
    const prevGroup = normalizeGroup(previous[key] || {})
    const nextGroup = normalizeGroup(next[key] || {})

    const changes = {}

    if (!Object.is(prevGroup.warning, nextGroup.warning)) {
      changes.warning = {
        before:
          prevGroup.warning === undefined ? null : prevGroup.warning ?? null,
        after:
          nextGroup.warning === undefined ? null : nextGroup.warning ?? null,
      }
    }

    if (!Object.is(prevGroup.critical, nextGroup.critical)) {
      changes.critical = {
        before:
          prevGroup.critical === undefined ? null : prevGroup.critical ?? null,
        after:
          nextGroup.critical === undefined ? null : nextGroup.critical ?? null,
      }
    }

    if (Object.keys(changes).length > 0) {
      diff.push({ metric: key, changes })
    }
  }

  return diff
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (typeof value === 'number') {
    const abs = Math.abs(value)
    if (abs >= 1000) return value.toFixed(0)
    if (abs >= 10) return value.toFixed(1)
    if (abs >= 1) return value.toFixed(2)
    return value.toFixed(3)
  }

  return String(value)
}

function buildDiffSummary(diff = []) {
  if (!Array.isArray(diff) || diff.length === 0) {
    return '변경 없음'
  }

  const parts = []

  for (const entry of diff) {
    if (!entry || typeof entry !== 'object') continue
    const changes = entry.changes || {}
    const changeTexts = []

    if (changes.warning) {
      changeTexts.push(
        `주의 ${formatValue(changes.warning.before)} → ${formatValue(changes.warning.after)}`,
      )
    }

    if (changes.critical) {
      changeTexts.push(
        `위험 ${formatValue(changes.critical.before)} → ${formatValue(changes.critical.after)}`,
      )
    }

    if (changeTexts.length > 0) {
      parts.push(`${entry.metric}: ${changeTexts.join(', ')}`)
    }
  }

  if (parts.length === 0) {
    return '변경 없음'
  }

  return parts.join(' · ')
}

function normalizeTimestamp(value) {
  if (!value) return { iso: null, ms: null }
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) {
    return { iso: null, ms: null }
  }

  return { iso: new Date(ms).toISOString(), ms }
}

function startOfUtcDay(ms) {
  const date = new Date(ms)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

function formatTimelineLabel(ms) {
  const date = new Date(ms)
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  return `${month}/${day}`
}

function formatTimelineWeekday(ms) {
  const date = new Date(ms)
  return date.toLocaleDateString('ko-KR', { weekday: 'short', timeZone: 'UTC' })
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return new Intl.NumberFormat('ko-KR').format(value)
}

function startOfUtcWeek(ms) {
  const date = new Date(ms)
  const utcDay = date.getUTCDay() || 7
  const diff = utcDay - 1
  date.setUTCDate(date.getUTCDate() - diff)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

function getIsoWeekInfo(ms) {
  const date = new Date(ms)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
  return { year: target.getUTCFullYear(), week }
}

function formatWeekLabel(startMs, endMs) {
  const start = new Date(startMs)
  const end = new Date(endMs - 1)
  const startLabel = `${start.getUTCMonth() + 1}/${start.getUTCDate()}`
  const endLabel = `${end.getUTCMonth() + 1}/${end.getUTCDate()}`
  return `${startLabel}~${endLabel}`
}

function formatWeekSecondaryLabel(ms) {
  const { year, week } = getIsoWeekInfo(ms)
  const weekId = String(week).padStart(2, '0')
  return `${String(year).slice(-2)}W${weekId}`
}

function startOfUtcMonth(ms) {
  const date = new Date(ms)
  date.setUTCDate(1)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

function addUtcMonths(ms, delta) {
  const date = new Date(ms)
  const targetMonth = date.getUTCMonth() + delta
  date.setUTCMonth(targetMonth, 1)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}

function formatMonthLabel(ms) {
  const date = new Date(ms)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatMonthSecondaryLabel(ms) {
  const date = new Date(ms)
  const month = date.getUTCMonth() + 1
  return `${month}월`
}

function buildTimeline(
  events = [],
  { nowMs, mode = 'daily', windowDays = 14, windowWeeks = 12, windowMonths = 12 } = {},
) {
  const normalizedMode = ['daily', 'weekly', 'monthly'].includes(mode) ? mode : 'daily'
  const limit = TIMELINE_LIMITS[normalizedMode] || 30

  if (normalizedMode === 'weekly') {
    const normalizedWeeks = Number.isFinite(windowWeeks) && windowWeeks > 0
      ? Math.min(Math.floor(windowWeeks), limit)
      : 12
    if (!normalizedWeeks) {
      return { mode: normalizedMode, windowLabel: '최근 0주', buckets: [], maxCount: 0 }
    }

    const currentWeekStart = startOfUtcWeek(nowMs)
    const firstBucketStart = currentWeekStart - WEEK_MS * (normalizedWeeks - 1)
    const bucketMap = new Map()

    for (const event of events) {
      const bucketStart = startOfUtcWeek(event.timestampMs)
      const current = bucketMap.get(bucketStart) || { count: 0 }
      current.count += 1
      bucketMap.set(bucketStart, current)
    }

    const buckets = []
    let maxCount = 0

    for (let index = 0; index < normalizedWeeks; index += 1) {
      const bucketStart = firstBucketStart + WEEK_MS * index
      const bucketEnd = bucketStart + WEEK_MS
      const count = bucketMap.get(bucketStart)?.count ?? 0
      if (count > maxCount) {
        maxCount = count
      }

      buckets.push({
        id: `audit-week-${bucketStart}`,
        start: new Date(bucketStart).toISOString(),
        end: new Date(bucketEnd).toISOString(),
        count,
        label: formatWeekLabel(bucketStart, bucketEnd),
        secondaryLabel: formatWeekSecondaryLabel(bucketStart),
        tooltip: `${formatWeekLabel(bucketStart, bucketEnd)} (${formatWeekSecondaryLabel(bucketStart)}) · ${formatNumber(count)}회`,
        isCurrent: bucketStart === currentWeekStart,
      })
    }

    return {
      mode: normalizedMode,
      windowLabel: `최근 ${normalizedWeeks}주`,
      windowWeeks: normalizedWeeks,
      buckets,
      maxCount,
    }
  }

  if (normalizedMode === 'monthly') {
    const normalizedMonths = Number.isFinite(windowMonths) && windowMonths > 0
      ? Math.min(Math.floor(windowMonths), limit)
      : 6
    if (!normalizedMonths) {
      return { mode: normalizedMode, windowLabel: '최근 0개월', buckets: [], maxCount: 0 }
    }

    const currentMonthStart = startOfUtcMonth(nowMs)
    const firstBucketStart = addUtcMonths(currentMonthStart, -(normalizedMonths - 1))
    const bucketMap = new Map()

    for (const event of events) {
      const bucketStart = startOfUtcMonth(event.timestampMs)
      const current = bucketMap.get(bucketStart) || { count: 0 }
      current.count += 1
      bucketMap.set(bucketStart, current)
    }

    const buckets = []
    let maxCount = 0

    for (let index = 0; index < normalizedMonths; index += 1) {
      const bucketStart = addUtcMonths(firstBucketStart, index)
      const bucketEnd = addUtcMonths(bucketStart, 1)
      const count = bucketMap.get(bucketStart)?.count ?? 0
      if (count > maxCount) {
        maxCount = count
      }

      buckets.push({
        id: `audit-month-${bucketStart}`,
        start: new Date(bucketStart).toISOString(),
        end: new Date(bucketEnd).toISOString(),
        count,
        label: formatMonthLabel(bucketStart),
        secondaryLabel: formatMonthSecondaryLabel(bucketStart),
        tooltip: `${formatMonthLabel(bucketStart)} · ${formatNumber(count)}회`,
        isCurrent: bucketStart === currentMonthStart,
      })
    }

    return {
      mode: normalizedMode,
      windowLabel: `최근 ${normalizedMonths}개월`,
      windowMonths: normalizedMonths,
      buckets,
      maxCount,
    }
  }

  const normalizedDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.min(Math.floor(windowDays), limit) : 14
  if (!normalizedDays) {
    return { mode: normalizedMode, windowLabel: '최근 0일', buckets: [], maxCount: 0 }
  }

  const todayStart = startOfUtcDay(nowMs)
  const firstBucketStart = todayStart - DAY_MS * (normalizedDays - 1)

  const bucketMap = new Map()
  for (const event of events) {
    const bucketStart = startOfUtcDay(event.timestampMs)
    const current = bucketMap.get(bucketStart) || { count: 0 }
    current.count += 1
    bucketMap.set(bucketStart, current)
  }

  const buckets = []
  let maxCount = 0

  for (let index = 0; index < normalizedDays; index += 1) {
    const bucketStart = firstBucketStart + DAY_MS * index
    const bucketEnd = bucketStart + DAY_MS
    const count = bucketMap.get(bucketStart)?.count ?? 0
    if (count > maxCount) {
      maxCount = count
    }

    buckets.push({
      id: `audit-day-${bucketStart}`,
      start: new Date(bucketStart).toISOString(),
      end: new Date(bucketEnd).toISOString(),
      count,
      label: formatTimelineLabel(bucketStart),
      secondaryLabel: formatTimelineWeekday(bucketStart),
      tooltip: `${formatTimelineLabel(bucketStart)} (${formatTimelineWeekday(bucketStart)}) · ${formatNumber(count)}회`,
      isCurrent: bucketStart === todayStart,
    })
  }

  return {
    mode: normalizedMode,
    windowLabel: `최근 ${normalizedDays}일`,
    windowDays: normalizedDays,
    buckets,
    maxCount,
  }
}

function buildSlackText(event) {
  const lines = [
    ':memo: RANK_COOLDOWN_ALERT_THRESHOLDS 변경 감지',
    `• 적용 시각: ${event.timestamp}`,
  ]

  if (event.source) {
    lines.push(`• 적용 경로: ${event.source}`)
  }

  if (event.rawEnvValue) {
    const raw = event.rawEnvValue.trim()
    const truncated = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw
    lines.push(`• 원본 값: \`${truncated}\``)
  }

  for (const entry of event.diff) {
    const changeLines = []
    if (entry.changes.warning) {
      changeLines.push(
        `warning ${formatValue(entry.changes.warning.before)} → ${formatValue(
          entry.changes.warning.after,
        )}`,
      )
    }
    if (entry.changes.critical) {
      changeLines.push(
        `critical ${formatValue(entry.changes.critical.before)} → ${formatValue(
          entry.changes.critical.after,
        )}`,
      )
    }

    lines.push(`• ${entry.metric}: ${changeLines.join(', ')}`)
  }

  return lines.join('\n')
}

async function postJson(url, body, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    return true
  } finally {
    clearTimeout(timer)
  }
}

async function publishSlackNotification(event) {
  if (!ALERT_AUDIT_WEBHOOK_URL) {
    return { skipped: true, reason: 'missing_webhook' }
  }

  try {
    await postJson(
      ALERT_AUDIT_WEBHOOK_URL,
      {
        type: 'rank.cooldown.threshold_change',
        text: buildSlackText(event),
        diff: event.diff,
        overrides: event.overrides ?? null,
      },
      {
        headers: ALERT_AUDIT_AUTH_HEADER
          ? { Authorization: ALERT_AUDIT_AUTH_HEADER }
          : {},
      },
    )

    return { delivered: true }
  } catch (error) {
    console.error('[cooldown-threshold-audit] Slack 통지 실패', {
      error,
    })
    return { delivered: false, error }
  }
}

function pushAuditEvent(event) {
  auditTrail.push(event)
  if (auditTrail.length > 50) {
    auditTrail.shift()
  }
}

export function getCooldownThresholdAuditTrail() {
  return auditTrail.map((entry) => ({ ...entry }))
}

export function summarizeCooldownThresholdAuditTrail(
  events = [],
  {
    now = new Date(),
    windowMs = 48 * 60 * 60 * 1000,
    limit = 6,
    timelineDays = 14,
    timelineWeeks = 12,
    timelineMonths = 12,
  } = {},
) {
  const nowMs = now instanceof Date ? now.getTime() : Date.now()
  const normalizedWindow = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 48 * 60 * 60 * 1000
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 20) : 6

  const normalizedEvents = Array.isArray(events)
    ? events
        .map((event) => {
          if (!event || typeof event !== 'object') return null
          const { iso, ms } = normalizeTimestamp(event.timestamp)
          if (!ms) {
            return null
          }

          const diff = Array.isArray(event.diff) ? event.diff : []
          return {
            id: event.id || `audit-${ms}`,
            timestampMs: ms,
            timestamp: iso,
            source: event.source || null,
            rawEnvValue:
              typeof event.rawEnvValue === 'string' && event.rawEnvValue.trim().length
                ? event.rawEnvValue
                : null,
            overrides: event.overrides || null,
            diff,
            summary: buildDiffSummary(diff),
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.timestampMs - a.timestampMs)
    : []

  const cutoff = nowMs - normalizedWindow
  const recentCount = normalizedEvents.filter((event) => event.timestampMs >= cutoff).length
  const totalCount = normalizedEvents.length
  const latest = normalizedEvents[0] || null
  const windowHoursRaw = normalizedWindow / (60 * 60 * 1000)
  const recentWindowHours = Number.isInteger(windowHoursRaw)
    ? windowHoursRaw
    : Number(windowHoursRaw.toFixed(1))

  const timelineDaily = buildTimeline(normalizedEvents, {
    nowMs,
    mode: 'daily',
    windowDays: timelineDays,
  })
  const timelineWeekly = buildTimeline(normalizedEvents, {
    nowMs,
    mode: 'weekly',
    windowWeeks: timelineWeeks,
  })
  const timelineMonthly = buildTimeline(normalizedEvents, {
    nowMs,
    mode: 'monthly',
    windowMonths: timelineMonths,
  })

  const timelines = {
    daily: timelineDaily,
  }

  if (timelineWeekly) {
    timelines.weekly = timelineWeekly
  }

  if (timelineMonthly) {
    timelines.monthly = timelineMonthly
  }

  return {
    totalCount,
    recentWindowMs: normalizedWindow,
    recentWindowHours,
    recentCount,
    lastChangedAt: latest?.timestamp || null,
    lastSource: latest?.source || null,
    lastSummary: latest?.summary || null,
    lastRawEnvValue: latest?.rawEnvValue || null,
    timeline: timelineDaily,
    timelines,
    events: normalizedEvents.slice(0, normalizedLimit).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      source: event.source,
      summary: event.summary,
      diff: event.diff,
      rawEnvValue: event.rawEnvValue,
      overrides: event.overrides,
    })),
  }
}

export function recordCooldownThresholdChange({
  previous,
  next,
  context = {},
}) {
  if (!next) {
    return { recorded: false, reason: 'missing_next' }
  }

  const diff = buildDiff(previous || {}, next || {})
  if (diff.length === 0) {
    return { recorded: false, reason: 'no_change' }
  }

  const event = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: context.source || 'env:RANK_COOLDOWN_ALERT_THRESHOLDS',
    rawEnvValue: context.rawEnvValue || null,
    overrides: clone(context.overrides || null),
    diff,
    previous: clone(previous || null),
    next: clone(next || null),
  }

  console.info('[cooldown-threshold-audit] 환경 임계값 변경 감지', {
    source: event.source,
    diff: event.diff,
  })

  pushAuditEvent(event)

  queueMicrotask(() => {
    publishSlackNotification(event).catch((error) => {
      console.error('[cooldown-threshold-audit] Slack 통지 비동기 실패', {
        error,
      })
    })
  })

  return { recorded: true, event }
}
