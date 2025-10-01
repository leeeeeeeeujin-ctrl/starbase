import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAdminLanguageInsights } from '@/lib/rank/adminLanguageInsights'

function normalizeLimit(raw) {
  const numeric = Number.parseInt(Array.isArray(raw) ? raw[0] : raw, 10)
  if (!Number.isFinite(numeric)) return 250
  return Math.min(Math.max(numeric, 50), 1000)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const limit = normalizeLimit(req.query.limit)

  try {
    const { data, error } = await supabaseAdmin
      .from('rank_battle_logs')
      .select(
        `
        battle_id,
        prompt,
        ai_response,
        meta,
        created_at,
        battle:rank_battles!inner(result, hidden, created_at)
      `,
      )
      .eq('turn_no', 1)
      .eq('battle.hidden', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      const missingTable =
        error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '')

      if (missingTable) {
        return res.status(200).json({
          baseline: { wins: 0, losses: 0, draws: 0, winRate: null },
          tokens: { total: 0, maxMatches: 1, topByFrequency: [], topPositive: [], topNegative: [] },
          sentences: {
            tiers: { S: [], A: [], B: [], C: [], D: [] },
            topPositive: [],
            topNegative: [],
          },
          sampleSize: 0,
          meta: { missingTable: true },
        })
      }

      console.error('[admin-language-insights] select failed', error)
      return res.status(500).json({ error: 'language_insights_failed' })
    }

    const insights = buildAdminLanguageInsights(data || [])
    return res.status(200).json({ ...insights, meta: { limit } })
  } catch (error) {
    console.error('[admin-language-insights] unexpected failure', error)
    return res.status(500).json({ error: 'language_insights_failed' })
  }
}
