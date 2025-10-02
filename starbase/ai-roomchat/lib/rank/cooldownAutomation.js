import { randomUUID } from 'crypto'

const DEFAULT_TIMEOUT_MS = 8000
const ALERT_WEBHOOK_URL =
  process.env.RANK_COOLDOWN_ALERT_WEBHOOK_URL || process.env.SLACK_COOLDOWN_ALERT_WEBHOOK_URL
const ALERT_WEBHOOK_AUTH_HEADER =
  process.env.RANK_COOLDOWN_ALERT_WEBHOOK_AUTHORIZATION || process.env.RANK_COOLDOWN_ALERT_WEBHOOK_TOKEN
const DEFAULT_ALERT_DOC_URL =
  'https://github.com/starbasehq/starbase/blob/main/starbase/ai-roomchat/docs/rank-api-key-cooldown-monitoring.md#edge-webhook-retry-runbook-2025-11-07-%EC%97%85%EB%8D%B0%EC%9D%B4%ED%8A%B8'
const ALERT_DOC_URL =
  process.env.RANK_COOLDOWN_ALERT_DOC_URL ||
  process.env.RANK_COOLDOWN_ALERT_DOC_LINK ||
  process.env.RANK_COOLDOWN_RUNBOOK_URL ||
  process.env.RANK_COOLDOWN_DOC_URL ||
  DEFAULT_ALERT_DOC_URL
const ROTATION_ENDPOINT =
  process.env.RANK_COOLDOWN_ROTATION_URL || process.env.RANK_COOLDOWN_ROTATION_WEBHOOK_URL
const ROTATION_METHOD = (process.env.RANK_COOLDOWN_ROTATION_METHOD || 'POST').toUpperCase()
const ROTATION_SECRET = process.env.RANK_COOLDOWN_ROTATION_SECRET
const ROTATION_PROVIDER_FILTER =
  process.env.RANK_COOLDOWN_ROTATION_PROVIDER_FILTER || process.env.RANK_COOLDOWN_ROTATION_PROVIDER

function sanitizeString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function sanitizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return null
  }

  const hashedKey = sanitizeString(event.hashedKey).trim()
  if (!hashedKey) return null

  const parseIso = (value) => {
    if (!value) return null
    try {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) {
        return null
      }
      return date.toISOString()
    } catch (error) {
      return null
    }
  }

  return {
    hashedKey,
    keySample: sanitizeString(event.keySample) || null,
    reason: sanitizeString(event.reason) || 'unknown',
    provider: sanitizeString(event.provider) || null,
    viewerId: sanitizeString(event.viewerId) || null,
    gameId: sanitizeString(event.gameId) || null,
    sessionId: sanitizeString(event.sessionId) || null,
    recordedAt: parseIso(event.recordedAt),
    expiresAt: parseIso(event.expiresAt),
    nextRetryEta: parseIso(event.nextRetryEta),
    note: sanitizeString(event.note) || null,
  }
}

function createAbortController(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    controller,
    dispose() {
      clearTimeout(timer)
    },
  }
}

function resolveDocUrl(options = {}) {
  const candidates = [options.docUrl, options.runbookUrl, ALERT_DOC_URL]

  for (const candidate of candidates) {
    const url = sanitizeString(candidate)
    if (!url) continue
    if (url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://')) {
      return url
    }
  }

  return null
}

export function getCooldownDocumentationUrl() {
  return resolveDocUrl()
}

function formatEtaForAlert(isoString) {
  if (!isoString) return null
  try {
    const target = new Date(isoString)
    if (Number.isNaN(target.getTime())) {
      return null
    }

    const now = new Date()
    const baseLabel = target.toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const diffMs = target.getTime() - now.getTime()
    const absMs = Math.abs(diffMs)

    if (absMs < 15000) {
      return `${baseLabel} (지금)`
    }

    const minutes = Math.round(absMs / 60000)
    if (minutes < 60) {
      return `${baseLabel} (${minutes}분 ${diffMs >= 0 ? '후' : '전'})`
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    const durationLabel = remainingMinutes
      ? `${hours}시간 ${remainingMinutes}분`
      : `${hours}시간`
    return `${baseLabel} (${durationLabel} ${diffMs >= 0 ? '후' : '전'})`
  } catch (error) {
    return null
  }
}

function buildAlertPayload(event, docUrl, { retryPlan } = {}) {
  const lines = [
    ':rotating_light: API 키 쿨다운 감지',
    `• 키 샘플: ${event.keySample || event.hashedKey}`,
    `• 사유: ${event.reason || 'unknown'}`,
  ]

  if (event.provider) {
    lines.push(`• 제공자: ${event.provider}`)
  }
  if (event.viewerId) {
    lines.push(`• 뷰어: ${event.viewerId}`)
  }
  if (event.gameId) {
    lines.push(`• 게임: ${event.gameId}`)
  }
  if (event.sessionId) {
    lines.push(`• 세션: ${event.sessionId}`)
  }
  if (event.recordedAt) {
    lines.push(`• 감지 시각: ${event.recordedAt}`)
  }
  if (event.expiresAt) {
    lines.push(`• 해제 예정: ${event.expiresAt}`)
  }
  if (event.note) {
    lines.push(`• 비고: ${event.note}`)
  }

  if (docUrl) {
    lines.push(`• 대응 가이드: ${docUrl}`)
  }

  const retryEtaCandidate =
    retryPlan?.recommendedRunAt ||
    retryPlan?.nextRetryEta ||
    event.nextRetryEta ||
    null
  const retryEtaLabel = formatEtaForAlert(retryEtaCandidate)
  if (retryEtaLabel) {
    lines.push(`• 다음 자동 재시도 ETA: ${retryEtaLabel}`)
  }

  const payload = {
    type: 'rank.cooldown.alert',
    text: lines.join('\n'),
    event,
  }

  if (docUrl) {
    payload.links = { runbook: docUrl }
  }

  if (retryPlan) {
    payload.retryPlan = {
      shouldRetry: Boolean(retryPlan.shouldRetry),
      recommendedRunAt: retryPlan.recommendedRunAt || retryPlan.nextRetryEta || null,
      failureStreak: retryPlan.failureStreak ?? null,
      lastStatus: retryPlan.lastStatus || null,
      nextAttemptNumber: retryPlan.nextAttemptNumber ?? null,
    }
  }

  return payload
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildHttpSnapshot(result) {
  if (!result || typeof result !== 'object') return null

  const snapshot = {
    ok: Boolean(result.ok),
    status: typeof result.status === 'number' ? result.status : null,
    elapsedMs: toNumber(result.elapsedMs),
  }

  if (result.contentType) {
    snapshot.contentType = result.contentType
  }

  if (typeof result.text === 'string' && result.text.length > 0) {
    snapshot.bodyText = result.text
  }

  if (result.json !== undefined) {
    snapshot.bodyJson = result.json
  }

  return snapshot
}

function buildErrorSnapshot(result) {
  if (!result || typeof result !== 'object') return null

  const snapshot = {
    message: result.message || null,
    name: result.name || null,
    type: result.type || null,
    timedOut: Boolean(result.timedOut),
  }

  const elapsed = toNumber(result.elapsedMs)
  if (elapsed !== undefined) {
    snapshot.elapsedMs = elapsed
  }

  return snapshot
}

async function postJson(url, body, { method = 'POST', headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { controller, dispose } = createAbortController(timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const contentType = response.headers?.get?.('content-type') || null
    const text = await response.text().catch(() => '')
    let json
    if (contentType && contentType.toLowerCase().includes('application/json') && text) {
      try {
        json = JSON.parse(text)
      } catch (parseError) {
        json = undefined
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      text,
      json,
      contentType,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      error: true,
      message: error.message,
      name: error.name,
      type: error.type,
      timedOut: error.name === 'AbortError',
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    dispose()
  }
}

export async function dispatchCooldownAlert(event, options = {}) {
  const sanitized = sanitizeEvent(event)
  if (!sanitized) {
    return { attempted: false, skipped: true, reason: 'invalid_event' }
  }

  const webhookUrl = options.webhookUrl || ALERT_WEBHOOK_URL
  if (!webhookUrl) {
    return { attempted: false, skipped: true, reason: 'missing_webhook' }
  }

  const headers = {}
  const authHeader = options.webhookAuthorization || ALERT_WEBHOOK_AUTH_HEADER
  if (authHeader) {
    headers.Authorization = authHeader
  }

  const docUrl = resolveDocUrl(options)
  const retryPlan = options.retryPlan || null
  const fallbackRetryEta = options.retryEta || null
  const resolvedRetryEta =
    sanitized.nextRetryEta ||
    retryPlan?.recommendedRunAt ||
    retryPlan?.nextRetryEta ||
    fallbackRetryEta ||
    null
  const alertEvent = {
    ...sanitized,
    nextRetryEta: resolvedRetryEta,
  }
  const payload = buildAlertPayload(alertEvent, docUrl, { retryPlan })
  const result = await postJson(webhookUrl, payload, { method: 'POST', headers })

  if (!result.ok) {
    const summary = {
      attempted: true,
      delivered: false,
      status: typeof result.status === 'number' ? result.status : null,
      durationMs: toNumber(result.elapsedMs),
      retryEta: resolvedRetryEta,
    }

    if (result.status !== undefined) {
      summary.response = buildHttpSnapshot(result)
    }

    if (result.error) {
      summary.error = buildErrorSnapshot(result)
    }

    if (docUrl) {
      summary.docUrl = docUrl
    }

    if (retryPlan) {
      summary.retryPlan = payload.retryPlan
    }

    return summary
  }

  return {
    attempted: true,
    delivered: true,
    status: result.status,
    durationMs: toNumber(result.elapsedMs),
    response: buildHttpSnapshot(result),
    retryEta: resolvedRetryEta,
    ...(retryPlan ? { retryPlan: payload.retryPlan } : {}),
    ...(docUrl ? { docUrl } : {}),
  }
}

function shouldTriggerRotation(event) {
  if (!ROTATION_ENDPOINT) return false
  if (!event) return false
  if (!event.reason) return true
  if (!ROTATION_PROVIDER_FILTER) return true
  const provider = (event.provider || '').toLowerCase()
  return provider === ROTATION_PROVIDER_FILTER.toLowerCase()
}

export async function triggerAutoKeyRotation(event, options = {}) {
  const sanitized = sanitizeEvent(event)
  if (!sanitized) {
    return { attempted: false, skipped: true, reason: 'invalid_event' }
  }

  const endpoint = options.rotationEndpoint || ROTATION_ENDPOINT
  if (!endpoint) {
    return { attempted: false, skipped: true, reason: 'missing_endpoint' }
  }

  if (!shouldTriggerRotation(sanitized)) {
    return { attempted: false, skipped: true, reason: 'provider_filtered' }
  }

  const method = (options.rotationMethod || ROTATION_METHOD || 'POST').toUpperCase()

  const headers = {}
  const secret = options.rotationSecret || ROTATION_SECRET
  if (secret) {
    headers.Authorization = secret
  }

  const result = await postJson(
    endpoint,
    {
      type: 'rank.cooldown.rotation_request',
      event: sanitized,
    },
    { method, headers },
  )

  if (!result.ok) {
    const summary = {
      attempted: true,
      triggered: false,
      status: typeof result.status === 'number' ? result.status : null,
      durationMs: toNumber(result.elapsedMs),
      endpoint: endpoint,
      method,
    }

    if (result.status !== undefined) {
      summary.response = buildHttpSnapshot(result)
    }

    if (result.error) {
      summary.error = buildErrorSnapshot(result)
    }

    return summary
  }

  return {
    attempted: true,
    triggered: true,
    status: result.status,
    durationMs: toNumber(result.elapsedMs),
    endpoint,
    method,
    response: buildHttpSnapshot(result),
  }
}

export async function runCooldownAutomation(event, options = {}) {
  const sanitized = sanitizeEvent(event)
  if (!sanitized) {
    const attemptedAt = new Date().toISOString()
    return {
      attemptedAt,
      attemptId: randomUUID?.() || null,
      triggered: false,
      skipped: true,
      reason: 'invalid_event',
      alert: { attempted: false, skipped: true, reason: 'invalid_event' },
      rotation: { attempted: false, skipped: true, reason: 'invalid_event' },
    }
  }

  const attemptedAt = new Date().toISOString()
  const attemptId = randomUUID?.() || null
  const summary = {
    attemptedAt,
    attemptId,
    triggered: false,
    alert: await dispatchCooldownAlert(sanitized, options),
  }

  summary.retryPlan = summary.alert?.retryPlan || options.retryPlan || null
  const retryEtaCandidate =
    summary.alert?.retryEta ||
    summary.retryPlan?.recommendedRunAt ||
    summary.retryPlan?.nextRetryEta ||
    sanitized.nextRetryEta ||
    options.retryEta ||
    null
  if (retryEtaCandidate) {
    summary.retryEta = retryEtaCandidate
  }

  const alertDocUrl = summary.alert?.docUrl || null
  summary.alertDocLinkAttached = Boolean(alertDocUrl)
  if (alertDocUrl) {
    summary.alertDocUrl = alertDocUrl
  }

  const rotation = await triggerAutoKeyRotation(sanitized, options)
  summary.rotation = rotation

  if (summary.alert.delivered || rotation.triggered) {
    summary.triggered = true
    summary.notifiedAt = new Date().toISOString()
  }

  return summary
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

export function mergeCooldownMetadata(existingMetadata, automationSummary) {
  const base = isObject(existingMetadata) ? existingMetadata : {}
  const previous = isObject(base.cooldownAutomation) ? base.cooldownAutomation : {}
  const previousRetryState = isObject(previous.retryState) ? previous.retryState : {}
  const previousCount = Number(previous.attemptCount)
  const attemptCount = Number.isFinite(previousCount) ? previousCount : 0
  const previousDocLinkCount = Number(previous.docLinkAttachmentCount)
  const docLinkAttachmentCount = Number.isFinite(previousDocLinkCount) ? previousDocLinkCount : 0

  const alertDocUrl =
    automationSummary.alertDocUrl || automationSummary.alert?.docUrl || null
  const alertDocLinkAttached = Boolean(automationSummary.alertDocLinkAttached || alertDocUrl)

  const merged = {
    ...base,
    cooldownAutomation: {
      attemptCount: attemptCount + 1,
      lastAttemptedAt: automationSummary.attemptedAt,
      lastAttemptId: automationSummary.attemptId || null,
      lastResult: {
        triggered: automationSummary.triggered,
        alert: automationSummary.alert,
        rotation: automationSummary.rotation,
        alertDocLinkAttached,
        alertDocUrl,
      },
      lastDocLinkAttached: alertDocLinkAttached,
      lastDocUrl: alertDocUrl,
      docLinkAttachmentCount:
        alertDocLinkAttached ? docLinkAttachmentCount + 1 : docLinkAttachmentCount,
    },
  }

  if (automationSummary.triggered && automationSummary.notifiedAt) {
    merged.cooldownAutomation.lastSuccessAt = automationSummary.notifiedAt
  }

  const recommendedRetryEta =
    automationSummary.retryEta ||
    automationSummary.retryPlan?.recommendedRunAt ||
    automationSummary.retryPlan?.nextRetryEta ||
    null

  if (automationSummary.retryPlan || recommendedRetryEta) {
    const retryPlan = automationSummary.retryPlan || {}
    const generatedAt = new Date().toISOString()
    const recommendedRunAt =
      retryPlan.recommendedRunAt || retryPlan.nextRetryEta || recommendedRetryEta || null

    const retryPlanRecord = {
      recommendedRunAt,
      nextAttemptNumber: retryPlan.nextAttemptNumber ?? null,
      failureStreak: retryPlan.failureStreak ?? null,
      lastStatus: retryPlan.lastStatus || null,
      generatedAt,
    }
    if (retryPlan.shouldRetry !== undefined) {
      retryPlanRecord.shouldRetry = Boolean(retryPlan.shouldRetry)
    }

    merged.cooldownAutomation.retryPlan = retryPlanRecord

    merged.cooldownAutomation.retryState = {
      ...previousRetryState,
      nextRetryAt: recommendedRunAt,
      attempt:
        retryPlan.nextAttemptNumber ??
        previousRetryState.attempt ??
        (Number.isFinite(merged.cooldownAutomation.attemptCount)
          ? merged.cooldownAutomation.attemptCount
          : null),
      failureStreak: retryPlan.failureStreak ?? previousRetryState.failureStreak ?? null,
      lastStatus: retryPlan.lastStatus || previousRetryState.lastStatus || null,
      generatedAt,
    }
  }

  return merged
}
