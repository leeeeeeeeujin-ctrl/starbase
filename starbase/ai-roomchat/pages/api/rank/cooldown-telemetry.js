import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildCooldownTelemetry } from '@/lib/rank/cooldownTelemetry'
import {
  evaluateCooldownAlerts,
  loadCooldownAlertThresholds,
} from '@/lib/rank/cooldownAlertThresholds'
import {
  getCooldownThresholdAuditTrail,
  summarizeCooldownThresholdAuditTrail,
} from '@/lib/rank/cooldownAlertThresholdAuditTrail'

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  let stringValue = value

  if (value instanceof Date) {
    stringValue = value.toISOString()
  } else if (typeof value === 'object') {
    try {
      stringValue = JSON.stringify(value)
    } catch (error) {
      stringValue = String(value)
    }
  } else if (typeof value === 'boolean') {
    stringValue = value ? 'true' : 'false'
  }

  const normalized = String(stringValue).replace(/"/g, '""')
  if (/[",\n]/.test(normalized)) {
    return `"${normalized}"`
  }
  return normalized
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => toCsvValue(value)).join(',')).join('\r\n')
}

function buildProviderCsv(report, alerts) {
  const header = [
    'generated_at',
    'provider',
    'status',
    'tracked_keys',
    'keys_with_success',
    'currently_triggered',
    'triggered_ratio',
    'total_attempts',
    'estimated_failure_rate',
    'avg_alert_duration_ms',
    'avg_rotation_duration_ms',
    'recommended_backoff_ms',
    'recommended_weight',
    'doc_link_attachment_count',
    'doc_link_attachment_rate',
    'last_doc_link_attachment_rate',
    'next_retry_eta',
    'last_attempt_at',
    'issues',
  ]

  const providerAlerts = new Map()
  if (Array.isArray(alerts?.providers)) {
    for (const entry of alerts.providers) {
      providerAlerts.set(entry.provider, entry)
    }
  }

  const rows = Array.isArray(report?.providers)
    ? report.providers.map((provider) => {
        const alert = providerAlerts.get(provider.provider) || {}
        const issues = Array.isArray(alert.issues)
          ? alert.issues.map((issue) => issue.message).filter(Boolean).join(' | ')
          : ''
        const triggeredRatio = provider.trackedKeys
          ? provider.currentlyTriggered / provider.trackedKeys
          : 0
        return [
          report.generatedAt || new Date().toISOString(),
          provider.provider || 'unknown',
          alert.status || 'ok',
          provider.trackedKeys ?? 0,
          provider.keysWithSuccess ?? 0,
          provider.currentlyTriggered ?? 0,
          Number.isFinite(triggeredRatio) ? Number(triggeredRatio.toFixed(3)) : 0,
          provider.totalAttempts ?? 0,
          provider.estimatedFailureRate ?? 0,
          provider.avgAlertDurationMs ?? null,
          provider.avgRotationDurationMs ?? null,
          provider.recommendedBackoffMs ?? null,
          provider.recommendedWeight ?? null,
          provider.docLinkAttachmentCount ?? 0,
          provider.docLinkAttachmentRate ?? 0,
          provider.lastDocLinkAttachmentRate ?? 0,
          provider.nextRetryEta || null,
          provider.lastAttemptAt || null,
          issues,
        ]
      })
    : []

  return toCsv([header, ...rows])
}

function buildAttemptsCsv(report, alerts) {
  const header = [
    'generated_at',
    'key_hash',
    'key_sample',
    'provider',
    'reason',
    'overall_status',
    'issues',
    'attempt_id',
    'attempt_count',
    'attempted_at',
    'triggered',
    'doc_link_attached',
    'doc_link_attachment_count',
    'doc_link_attachment_rate',
    'alert_status',
    'alert_duration_ms',
    'alert_http_status',
    'alert_error',
    'rotation_status',
    'rotation_duration_ms',
    'rotation_http_status',
    'rotation_error',
  ]

  const attemptAlerts = new Map()
  if (Array.isArray(alerts?.attempts)) {
    for (const entry of alerts.attempts) {
      attemptAlerts.set(`${entry.keyHash ?? 'unknown'}::${entry.attemptedAt ?? ''}`, entry)
    }
  }

  const rows = Array.isArray(report?.latestAttempts)
    ? report.latestAttempts.map((attempt) => {
        const alertKey = `${attempt.keyHash ?? 'unknown'}::${attempt.attemptedAt ?? ''}`
        const evaluation = attemptAlerts.get(alertKey) || {}
        const issues = Array.isArray(evaluation.issues)
          ? evaluation.issues.map((issue) => issue.message).filter(Boolean).join(' | ')
          : ''

        const alert = attempt.alert || {}
        const alertResponse = alert.response || {}
        const alertError = alert.error || {}
        const rotation = attempt.rotation || {}
        const rotationResponse = rotation.response || {}
        const rotationError = rotation.error || {}

        return [
          report.generatedAt || new Date().toISOString(),
          attempt.keyHash || null,
          attempt.keySample || null,
          attempt.provider || null,
          attempt.reason || null,
          evaluation.status || 'ok',
          issues,
          attempt.attemptId || null,
          attempt.attemptCount ?? 0,
          attempt.attemptedAt || null,
          attempt.triggered ?? false,
          attempt.docLinkAttached ?? false,
          attempt.docLinkAttachmentCount ?? 0,
          attempt.docLinkAttachmentRate ?? 0,
          alert.status ?? null,
          alert.durationMs ?? null,
          alertResponse.status ?? null,
          alertError.message || null,
          rotation.status ?? null,
          rotation.durationMs ?? null,
          rotationResponse.status ?? null,
          rotationError.message || null,
        ]
      })
    : []

  return toCsv([header, ...rows])
}

function buildAuditTimelineCsv(timeline, mode) {
  if (!timeline || !Array.isArray(timeline.buckets)) {
    return null
  }

  const header = [
    'mode',
    'window_label',
    'bucket_label',
    'bucket_secondary_label',
    'bucket_start',
    'bucket_end',
    'count',
    'is_current',
  ]

  const windowLabel = timeline.windowLabel || ''
  const rows = timeline.buckets.map((bucket) => [
    mode,
    windowLabel,
    bucket.label || '',
    bucket.secondaryLabel || '',
    bucket.start || '',
    bucket.end || '',
    bucket.count ?? 0,
    bucket.isCurrent ? 'true' : 'false',
  ])

  return toCsv([header, ...rows])
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const latestLimitParam = Array.isArray(req.query.latestLimit)
    ? req.query.latestLimit[0]
    : req.query.latestLimit

  const latestLimit = Number(latestLimitParam)
  const normalizedLimit = Number.isFinite(latestLimit) && latestLimit > 0 ? Math.min(latestLimit, 50) : 15

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_api_key_cooldowns')
      .select(
        `id, key_hash, key_sample, provider, reason, metadata, notified_at, reported_at, updated_at`,
      )

    if (error) {
      console.error('[cooldown-telemetry] select failed', error)
      return res.status(500).json({ error: 'cooldown_telemetry_failed' })
    }

    const report = buildCooldownTelemetry(data || [], { latestLimit: normalizedLimit })
    const thresholdOverrides = loadCooldownAlertThresholds()
    const alerts = evaluateCooldownAlerts(report, thresholdOverrides)
    const thresholdAuditTrail = getCooldownThresholdAuditTrail()
    const thresholdAudit = summarizeCooldownThresholdAuditTrail(thresholdAuditTrail, {
      now: new Date(),
      limit: 8,
      timelineDays: 14,
      timelineWeeks: 12,
      timelineMonths: 12,
    })

    const formatParam = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format
    const format = typeof formatParam === 'string' ? formatParam.toLowerCase() : null

    if (format === 'csv') {
      const sectionParam = Array.isArray(req.query.section) ? req.query.section[0] : req.query.section
      const section = typeof sectionParam === 'string' ? sectionParam.toLowerCase() : 'providers'

      let csvContent = null
      if (section === 'providers') {
        csvContent = buildProviderCsv(report, alerts)
      } else if (section === 'attempts') {
        csvContent = buildAttemptsCsv(report, alerts)
      } else if (section === 'audit-timeline') {
        const modeParam = Array.isArray(req.query.mode) ? req.query.mode[0] : req.query.mode
        const requestedMode = typeof modeParam === 'string' ? modeParam.toLowerCase() : 'daily'
        const availableTimelines = thresholdAudit?.timelines || {}
        const timeline = availableTimelines[requestedMode]
        if (!timeline) {
          return res.status(400).json({ error: 'unsupported_timeline_mode' })
        }
        csvContent = buildAuditTimelineCsv(timeline, requestedMode)
      }

      if (!csvContent) {
        return res.status(400).json({ error: 'unsupported_csv_section' })
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      const normalizedSection = section.replace(/[^a-z0-9-]/gi, '') || 'export'
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cooldown-${normalizedSection}-${timestamp}.csv"`,
      )
      return res.status(200).send(`\uFEFF${csvContent}`)
    }

    return res.status(200).json({
      ...report,
      alerts,
      thresholdAudit,
    })
  } catch (error) {
    console.error('[cooldown-telemetry] unexpected failure', error)
    return res.status(500).json({ error: 'cooldown_telemetry_failed' })
  }
}

