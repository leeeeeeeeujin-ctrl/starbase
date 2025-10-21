const DEFAULT_BACKOFF_SEQUENCE_MS = [3 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000]
const MIN_BACKOFF_MS = 60 * 1000
const MAX_BACKOFF_MS = 30 * 60 * 1000

function toObject(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      return {}
    }
  }
  if (typeof value === 'object') {
    return value
  }
  return {}
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function safeIso(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function normalizeAutomationPayload(payload) {
  const automation = toObject(payload)
  const alert = toObject(automation.alert)
  const alertResponse = toObject(alert.response)
  const alertError = toObject(alert.error)
  const rotation = toObject(automation.rotation)
  const rotationResponse = toObject(rotation.response)
  const rotationError = toObject(rotation.error)

  return {
    attemptId: automation.attemptId || null,
    attemptedAt: safeIso(automation.attemptedAt),
    triggered: Boolean(automation.triggered),
    docLinkAttached: Boolean(
      automation.alertDocLinkAttached || automation.alertDocUrl || alert.docUrl || automation.docUrl,
    ),
    alert: {
      attempted: alert.attempted ?? null,
      delivered: alert.delivered ?? null,
      status: toFiniteNumber(alert.status),
      durationMs: toFiniteNumber(alert.durationMs),
      responseStatus: toFiniteNumber(alertResponse.status),
      responseElapsedMs: toFiniteNumber(alertResponse.elapsedMs),
      errorMessage: alertError.message || null,
      errorType: alertError.type || null,
    },
    rotation: {
      attempted: rotation.attempted ?? null,
      triggered: rotation.triggered ?? null,
      status: toFiniteNumber(rotation.status),
      durationMs: toFiniteNumber(rotation.durationMs),
      responseStatus: toFiniteNumber(rotationResponse.status),
      responseElapsedMs: toFiniteNumber(rotationResponse.elapsedMs),
      errorMessage: rotationError.message || null,
      errorType: rotationError.type || null,
    },
  }
}

function normalizeAuditRow(row) {
  const retryCount = toFiniteNumber(row?.retry_count)
  const normalizedRetryCount = retryCount === null ? 0 : Math.max(0, retryCount)

  return {
    id: row?.id || null,
    status: row?.status || 'pending',
    retryCount: normalizedRetryCount,
    lastAttemptAt: safeIso(row?.last_attempt_at),
    nextRetryEta: safeIso(row?.next_retry_eta),
    insertedAt: safeIso(row?.inserted_at),
    notes: typeof row?.notes === 'string' ? row.notes : null,
    automation: normalizeAutomationPayload(row?.automation_payload),
  }
}

function summarizeRows(rows) {
  const summary = {
    total: 0,
    failures: 0,
    successes: 0,
    manualOverrides: 0,
    docLinkAttachments: 0,
    alertDurationSum: 0,
    alertDurationCount: 0,
    rotationDurationSum: 0,
    rotationDurationCount: 0,
  }

  for (const row of rows) {
    summary.total += 1

    if (row.status === 'succeeded') {
      summary.successes += 1
    } else if (row.status === 'manual_override') {
      summary.manualOverrides += 1
    } else {
      summary.failures += 1
    }

    if (row.automation.docLinkAttached) {
      summary.docLinkAttachments += 1
    }

    const alertDuration = row.automation.alert.durationMs
    if (alertDuration !== null) {
      summary.alertDurationSum += alertDuration
      summary.alertDurationCount += 1
    }

    const rotationDuration = row.automation.rotation.durationMs
    if (rotationDuration !== null) {
      summary.rotationDurationSum += rotationDuration
      summary.rotationDurationCount += 1
    }
  }

  const avgAlertDuration =
    summary.alertDurationCount > 0
      ? Math.round(summary.alertDurationSum / summary.alertDurationCount)
      : null
  const avgRotationDuration =
    summary.rotationDurationCount > 0
      ? Math.round(summary.rotationDurationSum / summary.rotationDurationCount)
      : null

  const docLinkAttachmentRate =
    summary.total > 0 ? Number((summary.docLinkAttachments / summary.total).toFixed(3)) : 0

  const failureRate =
    summary.total > 0 ? Number((summary.failures / summary.total).toFixed(3)) : 0

  return {
    ...summary,
    avgAlertDurationMs: avgAlertDuration,
    avgRotationDurationMs: avgRotationDuration,
    docLinkAttachmentRate,
    failureRate,
  }
}

function computeFailureStreak(rows) {
  let streak = 0
  for (const row of rows) {
    if (row.status === 'retrying' || row.status === 'pending') {
      streak += 1
      continue
    }
    break
  }
  return streak
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function buildCooldownRetryPlan(
  auditRows = [],
  {
    baseIntervalsMs = DEFAULT_BACKOFF_SEQUENCE_MS,
    now = new Date(),
    cooldownMetadata = null,
    includeAuditTrail = 5,
  } = {},
) {
  const nowMs = now instanceof Date ? now.getTime() : Date.now()
  const normalizedRows = Array.isArray(auditRows)
    ? auditRows
        .map((row) => normalizeAuditRow(row))
        .sort((a, b) => {
          const aTime = Date.parse(a.insertedAt || '') || 0
          const bTime = Date.parse(b.insertedAt || '') || 0
          return bTime - aTime
        })
    : []

  const latest = normalizedRows[0] || null

  const summary = summarizeRows(normalizedRows)
  const failureStreak = computeFailureStreak(normalizedRows)

  const auditTrail = normalizedRows.slice(0, includeAuditTrail).map((row) => ({
    id: row.id,
    status: row.status,
    retryCount: row.retryCount,
    lastAttemptAt: row.lastAttemptAt,
    nextRetryEta: row.nextRetryEta,
    insertedAt: row.insertedAt,
    alertStatus: row.automation.alert.status,
    alertDurationMs: row.automation.alert.durationMs,
    rotationStatus: row.automation.rotation.status,
    rotationDurationMs: row.automation.rotation.durationMs,
    docLinkAttached: row.automation.docLinkAttached,
    notes: row.notes,
  }))

  const lastStatus = latest?.status || 'pending'
  const haltDueToSuccess = lastStatus === 'succeeded'
  const haltDueToManual = lastStatus === 'manual_override'

  if (haltDueToSuccess || haltDueToManual) {
    return {
      shouldRetry: false,
      haltReason: haltDueToSuccess ? 'already_succeeded' : 'manual_override',
      lastStatus,
      lastAttemptAt: latest?.lastAttemptAt || null,
      failureStreak,
      summary,
      auditTrail,
    }
  }

  const maxFailureStreak = Array.isArray(baseIntervalsMs) ? baseIntervalsMs.length : 0
  if (maxFailureStreak > 0 && failureStreak >= maxFailureStreak) {
    return {
      shouldRetry: false,
      haltReason: 'max_retries_exhausted',
      lastStatus,
      lastAttemptAt: latest?.lastAttemptAt || null,
      failureStreak,
      summary,
      auditTrail,
    }
  }

  const attemptIndex = failureStreak > 0 ? failureStreak - 1 : 0
  const baseDelayMs = Array.isArray(baseIntervalsMs) && baseIntervalsMs.length
    ? baseIntervalsMs[Math.min(attemptIndex, baseIntervalsMs.length - 1)]
    : 3 * 60 * 1000

  const combinedAverageCandidates = [summary.avgAlertDurationMs, summary.avgRotationDurationMs].filter(
    (value) => typeof value === 'number' && value > 0,
  )
  const averageAutomationDuration = combinedAverageCandidates.length
    ? Math.round(
        combinedAverageCandidates.reduce((acc, value) => acc + value, 0) /
          combinedAverageCandidates.length,
      )
    : null

  const jitterMs = averageAutomationDuration
    ? clamp(Math.round(averageAutomationDuration * 0.35), 5000, 45000)
    : 10000

  const dynamicMultiplier = 1 + summary.failureRate * 0.4 + Math.min(failureStreak, 3) * 0.15
  let recommendedDelayMs = Math.round(baseDelayMs * dynamicMultiplier) + jitterMs
  recommendedDelayMs = clamp(recommendedDelayMs, MIN_BACKOFF_MS, MAX_BACKOFF_MS)

  const auditEtaMs = latest?.nextRetryEta ? Date.parse(latest.nextRetryEta) : NaN
  if (!Number.isNaN(auditEtaMs) && auditEtaMs > nowMs) {
    const auditDelay = auditEtaMs - nowMs
    if (auditDelay > recommendedDelayMs) {
      recommendedDelayMs = auditDelay
    }
  }

  const retryStateEta = cooldownMetadata?.cooldownAutomation?.retryState?.nextRetryAt
  const retryStateMs = retryStateEta ? Date.parse(retryStateEta) : NaN
  if (!Number.isNaN(retryStateMs) && retryStateMs > nowMs) {
    const retryStateDelay = retryStateMs - nowMs
    if (retryStateDelay > recommendedDelayMs) {
      recommendedDelayMs = retryStateDelay
    }
  }

  const recommendedRunAt = new Date(nowMs + recommendedDelayMs).toISOString()

  return {
    shouldRetry: true,
    haltReason: null,
    failureStreak,
    lastStatus,
    lastAttemptAt: latest?.lastAttemptAt || null,
    nextAttemptNumber: failureStreak + 1,
    baseDelayMs,
    recommendedDelayMs,
    recommendedRunAt,
    jitterMs,
    dynamicMultiplier: Number(dynamicMultiplier.toFixed(3)),
    summary,
    auditTrail,
  }
}

export const RETRY_BACKOFF_SEQUENCE_MS = DEFAULT_BACKOFF_SEQUENCE_MS
