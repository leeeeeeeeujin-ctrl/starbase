import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  getCooldownDocumentationUrl,
  mergeCooldownMetadata,
  runCooldownAutomation,
} from '@/lib/rank/cooldownAutomation'
import { recordCooldownAuditEntry } from '@/lib/rank/cooldownAudit'
import {
  RETRY_BACKOFF_SEQUENCE_MS,
  buildCooldownRetryPlan,
} from '@/lib/rank/cooldownRetryScheduler'

function parseRequestPayload(req) {
  if (req.method === 'GET') {
    return req.query || {}
  }
  if (req.body && typeof req.body === 'object') {
    return req.body
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch (error) {
      return {}
    }
  }
  return {}
}

function toNumber(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return numeric
}

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

async function computeRetryPlan(cooldownId, metadata) {
  if (!cooldownId) return null
  try {
    const { data: auditRows, error } = await supabaseAdmin
      .from('rank_api_key_audit')
      .select(
        'id, status, retry_count, last_attempt_at, next_retry_eta, automation_payload, inserted_at, notes',
      )
      .eq('cooldown_id', cooldownId)
      .order('inserted_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('cooldown-digest retry plan lookup failed:', { cooldownId, error })
      return null
    }

    return buildCooldownRetryPlan(auditRows || [], {
      baseIntervalsMs: RETRY_BACKOFF_SEQUENCE_MS,
      now: new Date(),
      cooldownMetadata: metadata,
      includeAuditTrail: 10,
    })
  } catch (error) {
    console.error('cooldown-digest retry plan unexpected failure:', { cooldownId, error })
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const payload = parseRequestPayload(req)
  const limit = Math.min(Math.max(toNumber(payload.limit, 25), 1), 200)
  const sinceMinutes = Math.max(toNumber(payload.since_minutes, 60), 1)
  const documentationUrl = getCooldownDocumentationUrl()
  const automationOptions = documentationUrl ? { docUrl: documentationUrl } : {}
  try {
    const { data, error } = await supabaseAdmin
      .from('rank_api_key_cooldowns')
      .select(
        'id, key_hash, key_sample, reason, provider, viewer_id, game_id, session_id, recorded_at, expires_at, reported_at, notified_at, note, metadata',
      )
      .is('notified_at', null)
      .order('recorded_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('cooldown-digest fetch failed:', error)
      return res.status(500).json({ error: 'cooldown_digest_failed' })
    }

    if (!data || data.length === 0) {
      return res.status(200).json({ processed: 0, message: 'no_pending_events' })
    }

    let processed = 0
    let delivered = 0

    for (const row of data) {
      processed += 1
      console.info('[cooldown-digest]', {
        id: row.id,
        keySample: row.key_sample || row.key_hash,
        reason: row.reason,
        provider: row.provider,
        recordedAt: row.recorded_at,
        expiresAt: row.expires_at,
        viewerId: row.viewer_id,
        gameId: row.game_id,
        sessionId: row.session_id,
        note: row.note,
        windowMinutes: sinceMinutes,
      })

      const metadataObject = toObject(row.metadata)
      const retryPlan = await computeRetryPlan(row.id, metadataObject)
      const automationOptionsForRow = { ...automationOptions }
      if (retryPlan) {
        automationOptionsForRow.retryPlan = retryPlan
      } else if (metadataObject?.cooldownAutomation?.retryState?.nextRetryAt) {
        automationOptionsForRow.retryEta = metadataObject.cooldownAutomation.retryState.nextRetryAt
      }

      let automationSummary = null
      try {
        automationSummary = await runCooldownAutomation({
          hashedKey: row.key_hash,
          keySample: row.key_sample,
          reason: row.reason,
          provider: row.provider,
          viewerId: row.viewer_id,
          gameId: row.game_id,
          sessionId: row.session_id,
          recordedAt: row.recorded_at,
          expiresAt: row.expires_at,
          note: row.note,
          nextRetryEta:
            retryPlan?.recommendedRunAt ||
            retryPlan?.nextRetryEta ||
            metadataObject?.cooldownAutomation?.retryState?.nextRetryAt ||
            null,
        }, automationOptionsForRow)
      } catch (automationError) {
        console.error('cooldown-digest automation failure:', {
          id: row.id,
          error: automationError,
        })
      }

      if (automationSummary && automationSummary.triggered) {
        delivered += 1
      }

      if (automationSummary) {
        console.info('[cooldown-digest] automation summary', {
          id: row.id,
          hashedKey: row.key_hash,
          alert: automationSummary.alert,
          rotation: automationSummary.rotation,
          triggered: automationSummary.triggered,
          alertDocLinkAttached: automationSummary.alertDocLinkAttached,
          alertDocUrl: automationSummary.alertDocUrl || automationSummary.alert?.docUrl || null,
        })

        const metadata = mergeCooldownMetadata(row.metadata, automationSummary)
        const updatePatch = { metadata }
        if (automationSummary.triggered && automationSummary.notifiedAt) {
          updatePatch.notified_at = automationSummary.notifiedAt
        }

        const { error: updateError } = await supabaseAdmin
          .from('rank_api_key_cooldowns')
          .update(updatePatch)
          .eq('id', row.id)

        if (updateError) {
          console.error('cooldown-digest metadata update failed:', {
            id: row.id,
            error: updateError,
          })
        }

        await recordCooldownAuditEntry({
          cooldownId: row.id,
          automationSummary,
          metadata,
          context: {
            source: 'digest',
            method: req.method,
            windowMinutes: sinceMinutes,
            limit,
            notes: row.note,
            nextRetryEta:
              automationSummary.retryEta ||
              retryPlan?.recommendedRunAt ||
              retryPlan?.nextRetryEta ||
              metadataObject?.cooldownAutomation?.retryState?.nextRetryAt ||
              null,
          },
        })
      }
    }

    return res.status(200).json({
      processed,
      delivered,
      windowMinutes: sinceMinutes,
    })
  } catch (error) {
    console.error('cooldown-digest unexpected failure:', error)
    return res.status(500).json({ error: 'cooldown_digest_failed' })
  }
}
