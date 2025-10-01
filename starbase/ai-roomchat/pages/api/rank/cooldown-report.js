import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  mergeCooldownMetadata,
  runCooldownAutomation,
} from '@/lib/rank/cooldownAutomation'

function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch (error) {
      return null
    }
  }

  return null
}

function toStringValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function toIsoString(value, fallbackMs) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString()
  }
  if (fallbackMs) {
    return new Date(fallbackMs).toISOString()
  }
  return new Date().toISOString()
}

function sanitizeNote(value) {
  const note = toStringValue(value)
  if (!note) return null
  return note.slice(0, 500)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const payload = parseJsonBody(req)

  if (!payload) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const hashedKey = toStringValue(payload.hashedKey || payload.keyHash).trim()
  if (!hashedKey) {
    return res.status(400).json({ error: 'missing_hashed_key' })
  }

  const now = Date.now()
  const recordedAtIso = toIsoString(payload.recordedAt, now)
  const expiresAtIso = toIsoString(payload.expiresAt, now)

  const insertPayload = {
    key_hash: hashedKey,
    key_sample: toStringValue(payload.sample || payload.keySample) || null,
    reason: toStringValue(payload.reason) || 'unknown',
    provider: toStringValue(payload.provider) || null,
    viewer_id: toStringValue(payload.viewerId) || null,
    game_id: toStringValue(payload.gameId) || null,
    session_id: toStringValue(payload.sessionId) || null,
    recorded_at: recordedAtIso,
    expires_at: expiresAtIso,
    reported_at: new Date(now).toISOString(),
    notified_at: null,
    source: 'client_local',
    note: sanitizeNote(payload.note),
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_api_key_cooldowns')
      .upsert([insertPayload], { onConflict: 'key_hash', ignoreDuplicates: false })
      .select(
        'id, key_sample, reason, provider, viewer_id, game_id, session_id, recorded_at, expires_at, notified_at, metadata',
      )

    if (error) {
      console.error('cooldown-report insert failed:', error)
      return res.status(500).json({ error: 'cooldown_report_failed' })
    }

    const row = Array.isArray(data) ? data[0] : null
    if (!row) {
      return res.status(202).json({ recorded: true, automation: null })
    }

    const eventForAutomation = {
      hashedKey,
      keySample: row.key_sample || insertPayload.key_sample,
      reason: row.reason || insertPayload.reason,
      provider: row.provider || insertPayload.provider,
      viewerId: row.viewer_id || insertPayload.viewer_id,
      gameId: row.game_id || insertPayload.game_id,
      sessionId: row.session_id || insertPayload.session_id,
      recordedAt: row.recorded_at || recordedAtIso,
      expiresAt: row.expires_at || expiresAtIso,
      note: insertPayload.note,
    }

    let automationSummary = null
    try {
      automationSummary = await runCooldownAutomation(eventForAutomation)
    } catch (automationError) {
      console.error('cooldown-report automation failed:', automationError)
    }

    if (automationSummary) {
      console.info('[cooldown-report] automation summary', {
        hashedKey,
        alert: automationSummary.alert,
        rotation: automationSummary.rotation,
        triggered: automationSummary.triggered,
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
        console.error('cooldown-report metadata update failed:', updateError)
      }

      return res.status(automationSummary.triggered ? 202 : 200).json({
        recorded: true,
        automation: automationSummary,
      })
    }

    return res.status(202).json({ recorded: true, automation: null })
  } catch (error) {
    console.error('cooldown-report unexpected failure:', error)
    return res.status(500).json({ error: 'cooldown_report_failed' })
  }
}
