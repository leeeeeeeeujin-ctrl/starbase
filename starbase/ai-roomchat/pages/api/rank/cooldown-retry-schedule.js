import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  RETRY_BACKOFF_SEQUENCE_MS,
  buildCooldownRetryPlan,
} from '@/lib/rank/cooldownRetryScheduler'

function pickStringParam(value) {
  if (Array.isArray(value)) {
    return value.length ? pickStringParam(value[0]) : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : undefined
  }
  return undefined
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const cooldownIdParam =
    pickStringParam(req.query.cooldownId) || pickStringParam(req.query.id)
  const keyHashParam =
    pickStringParam(req.query.keyHash) || pickStringParam(req.query.hashedKey)

  if (!cooldownIdParam && !keyHashParam) {
    return res.status(400).json({ error: 'missing_identifier' })
  }

  try {
    let cooldownQuery = supabaseAdmin
      .from('rank_api_key_cooldowns')
      .select(
        'id, key_hash, key_sample, provider, reason, recorded_at, expires_at, notified_at, metadata',
      )

    if (cooldownIdParam) {
      cooldownQuery = cooldownQuery.eq('id', cooldownIdParam)
    } else {
      cooldownQuery = cooldownQuery.eq('key_hash', keyHashParam)
    }

    const { data: cooldownRow, error: cooldownError } = await cooldownQuery.single()

    if (cooldownError) {
      if (cooldownError.code === 'PGRST116' || cooldownError.details?.includes('No rows found')) {
        return res.status(404).json({ error: 'cooldown_not_found' })
      }
      console.error('[cooldown-retry-schedule] cooldown fetch failed', cooldownError)
      return res.status(500).json({ error: 'cooldown_lookup_failed' })
    }

    const metadata = toObject(cooldownRow?.metadata)

    const { data: auditRows, error: auditError } = await supabaseAdmin
      .from('rank_api_key_audit')
      .select(
        'id, status, retry_count, last_attempt_at, next_retry_eta, automation_payload, inserted_at, notes',
      )
      .eq('cooldown_id', cooldownRow.id)
      .order('inserted_at', { ascending: false })
      .limit(50)

    if (auditError) {
      console.error('[cooldown-retry-schedule] audit fetch failed', auditError)
      return res.status(500).json({ error: 'audit_lookup_failed' })
    }

    const plan = buildCooldownRetryPlan(auditRows || [], {
      baseIntervalsMs: RETRY_BACKOFF_SEQUENCE_MS,
      now: new Date(),
      cooldownMetadata: metadata,
      includeAuditTrail: 10,
    })

    return res.status(200).json({
      cooldown: {
        id: cooldownRow.id,
        keyHash: cooldownRow.key_hash,
        keySample: cooldownRow.key_sample,
        provider: cooldownRow.provider,
        reason: cooldownRow.reason,
        recordedAt: cooldownRow.recorded_at,
        expiresAt: cooldownRow.expires_at,
        notifiedAt: cooldownRow.notified_at,
      },
      plan,
      baseIntervalsMs: RETRY_BACKOFF_SEQUENCE_MS,
    })
  } catch (error) {
    console.error('[cooldown-retry-schedule] unexpected failure', error)
    return res.status(500).json({ error: 'retry_schedule_failed' })
  }
}
