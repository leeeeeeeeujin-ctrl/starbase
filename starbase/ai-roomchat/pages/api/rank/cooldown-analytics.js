import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildCooldownAnalytics } from '@/lib/rank/cooldownAnalytics'

const RANGE_DAY_MAP = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '180d': 180,
  '365d': 365,
}

function normalizeParam(value) {
  if (!value) return null
  if (Array.isArray(value)) {
    return normalizeParam(value[0])
  }
  return String(value)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const grouping = normalizeParam(req.query.grouping)
  const provider = normalizeParam(req.query.provider)
  const reason = normalizeParam(req.query.reason)
  const range = normalizeParam(req.query.range)
  const start = normalizeParam(req.query.start)
  const end = normalizeParam(req.query.end)

  try {
    let startForQuery = start
    let endForQuery = end

    if (!startForQuery && range) {
      const days = RANGE_DAY_MAP[range] || RANGE_DAY_MAP['90d']
      const endDate = end ? new Date(end) : new Date()
      if (Number.isNaN(endDate.getTime())) {
        endDate.setTime(Date.now())
      }
      const derivedStart = new Date(endDate)
      derivedStart.setUTCDate(derivedStart.getUTCDate() - days + 1)
      derivedStart.setUTCHours(0, 0, 0, 0)
      startForQuery = derivedStart.toISOString()
    }

    if (!endForQuery && range) {
      const endDate = new Date()
      endDate.setUTCHours(23, 59, 59, 999)
      endForQuery = endDate.toISOString()
    }

    let query = supabaseAdmin
      .from('rank_api_key_cooldowns')
      .select(
        `id, key_hash, provider, reason, metadata, notified_at, recorded_at, reported_at, updated_at, inserted_at`,
      )

    if (startForQuery) {
      query = query.gte('reported_at', startForQuery)
    }

    if (endForQuery) {
      query = query.lte('reported_at', endForQuery)
    }

    if (provider && provider !== 'all') {
      query = query.eq('provider', provider)
    }

    const { data, error } = await query

    if (error) {
      console.error('[cooldown-analytics] select failed', error)

      const missingTable =
        error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '')

      if (missingTable) {
        const analytics = buildCooldownAnalytics([], {
          grouping,
          provider,
          reason,
          range,
          start,
          end,
        })

        return res.status(200).json({
          ...analytics,
          meta: { missingTable: true },
        })
      }

      return res.status(500).json({ error: 'cooldown_analytics_failed' })
    }

    const analytics = buildCooldownAnalytics(data || [], {
      grouping,
      provider,
      reason,
      range,
      start,
      end,
    })

    return res.status(200).json(analytics)
  } catch (error) {
    console.error('[cooldown-analytics] unexpected failure', error)
    return res.status(500).json({ error: 'cooldown_analytics_failed' })
  }
}

