import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildCooldownTelemetry } from '@/lib/rank/cooldownTelemetry'
import { evaluateCooldownAlerts } from '@/lib/rank/cooldownAlertThresholds'

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
    const alerts = evaluateCooldownAlerts(report)

    return res.status(200).json({
      ...report,
      alerts,
    })
  } catch (error) {
    console.error('[cooldown-telemetry] unexpected failure', error)
    return res.status(500).json({ error: 'cooldown_telemetry_failed' })
  }
}

