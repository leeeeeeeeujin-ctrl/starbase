import { supabaseAdmin } from '@/lib/supabaseAdmin'

function safeIso(value) {
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

function safeJson(value) {
  if (!value) return {}
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (error) {
    return {}
  }
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function determineStatus(summary, context = {}) {
  if (context.overrideStatus) {
    return context.overrideStatus
  }

  if (!summary) {
    return 'pending'
  }

  if (summary.triggered) {
    return 'succeeded'
  }

  const alert = summary.alert || {}
  const rotation = summary.rotation || {}
  const attempted = Boolean(alert.attempted || rotation.attempted)

  if (!attempted) {
    return 'pending'
  }

  const delivered = Boolean(alert.delivered || rotation.triggered)
  if (delivered) {
    return 'succeeded'
  }

  if (context.isManualOverride) {
    return 'manual_override'
  }

  return 'retrying'
}

export async function recordCooldownAuditEntry({
  cooldownId,
  automationSummary,
  metadata,
  context = {},
}) {
  if (!cooldownId) {
    return { skipped: true, reason: 'missing_cooldown_id' }
  }

  const attemptCount = toFiniteNumber(metadata?.cooldownAutomation?.attemptCount)
  const retryState = metadata?.cooldownAutomation?.retryState || {}
  const retryCountFromState = toFiniteNumber(retryState?.attempt)
  const computedRetryCount =
    retryCountFromState !== undefined
      ? Math.max(retryCountFromState, 0)
      : attemptCount !== undefined
        ? Math.max(attemptCount - 1, 0)
        : 0

  const status = determineStatus(automationSummary, context)

  const insertPayload = {
    cooldown_id: cooldownId,
    status,
    retry_count: computedRetryCount,
    last_attempt_at: safeIso(automationSummary?.attemptedAt || retryState?.lastAttemptAt),
    next_retry_eta: safeIso(context.nextRetryEta || retryState?.nextRetryAt),
    doc_link_attached: Boolean(
      automationSummary?.alertDocLinkAttached ||
        automationSummary?.alertDocUrl ||
        automationSummary?.alert?.docUrl,
    ),
    automation_payload: safeJson({
      ...automationSummary,
      source: context.source || automationSummary?.source || null,
    }),
    digest_payload: safeJson(
      context.digestPayload ||
        (context.source === 'digest'
          ? {
              windowMinutes: context.windowMinutes,
              limit: context.limit,
              method: context.method,
            }
          : null),
    ),
    notes: context.notes || retryState?.notes || null,
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_api_key_audit')
      .insert([insertPayload])
      .select('id')

    if (error) {
      console.error('[cooldown-audit] insert failed', {
        cooldownId,
        error,
      })
      return { inserted: false, error }
    }

    const row = Array.isArray(data) ? data[0] : null
    return { inserted: true, id: row?.id || null }
  } catch (error) {
    console.error('[cooldown-audit] unexpected failure', {
      cooldownId,
      error,
    })
    return { inserted: false, error }
  }
}
