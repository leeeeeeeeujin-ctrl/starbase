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
  { now = new Date(), windowMs = 48 * 60 * 60 * 1000, limit = 6 } = {},
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

  return {
    totalCount,
    recentWindowMs: normalizedWindow,
    recentWindowHours,
    recentCount,
    lastChangedAt: latest?.timestamp || null,
    lastSource: latest?.source || null,
    lastSummary: latest?.summary || null,
    lastRawEnvValue: latest?.rawEnvValue || null,
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
