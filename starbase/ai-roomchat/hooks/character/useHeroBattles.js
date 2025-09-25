import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { buildBattleSummary, includesHeroId } from '../../utils/characterStats'

const LOGS_SLICE = 5

export default function useHeroBattles({ hero, selectedGameId }) {
  const [battleDetails, setBattleDetails] = useState([])
  const [visibleBattles, setVisibleBattles] = useState(LOGS_SLICE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const heroId = hero?.id || null

  useEffect(() => {
    let active = true

    if (!heroId || !selectedGameId) {
      setBattleDetails([])
      setVisibleBattles(LOGS_SLICE)
      setLoading(false)
      setError('')
      return () => {
        active = false
      }
    }

    setLoading(true)
    setError('')

    ;(async () => {
      const fields = [
        'id',
        'game_id',
        'created_at',
        'result',
        'score_delta',
        'attacker_owner_id',
        'attacker_hero_ids',
        'defender_owner_id',
        'defender_hero_ids',
      ].join(', ')

      async function fetchByColumn(column) {
        const { data, error: columnError } = await supabase
          .from('rank_battles')
          .select(fields)
          .eq('game_id', selectedGameId)
          .contains(column, [heroId])
          .order('created_at', { ascending: false })
          .limit(40)
        if (columnError) {
          console.warn('rank_battles contains fetch failed:', columnError.message)
          return []
        }
        return data || []
      }

      let attackRows = await fetchByColumn('attacker_hero_ids')
      let defendRows = await fetchByColumn('defender_hero_ids')

      if (!attackRows.length && !defendRows.length) {
        const { data, error: fallbackError } = await supabase
          .from('rank_battles')
          .select(fields)
          .eq('game_id', selectedGameId)
          .order('created_at', { ascending: false })
          .limit(40)
        if (fallbackError) {
          if (active) {
            setError('전투 로그를 불러올 수 없습니다.')
            setLoading(false)
          }
          return
        }
        const fallback = (data || []).filter(
          (row) => includesHeroId(row.attacker_hero_ids, heroId) || includesHeroId(row.defender_hero_ids, heroId),
        )
        attackRows = fallback
        defendRows = []
      }

      const merged = [...attackRows, ...defendRows]
      const byId = new Map()
      merged.forEach((row) => {
        if (row?.id) byId.set(row.id, row)
      })
      const battles = Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      )

      const ids = battles.map((battle) => battle.id)
      const { data: logRows, error: logError } = ids.length
        ? await supabase
            .from('rank_battle_logs')
            .select('battle_id, turn_no, prompt, ai_response, created_at')
            .in('battle_id', ids)
        : { data: [], error: null }

      if (logError) {
        console.warn('rank_battle_logs fetch failed:', logError.message)
      }

      const logsMap = new Map()
      ;(logRows || []).forEach((log) => {
        if (!log?.battle_id) return
        if (!logsMap.has(log.battle_id)) logsMap.set(log.battle_id, [])
        logsMap.get(log.battle_id).push(log)
      })

      const detailed = battles.map((battle) => ({
        ...battle,
        logs: (logsMap.get(battle.id) || []).sort((a, b) => (a.turn_no ?? 0) - (b.turn_no ?? 0)),
      }))

      if (!active) return
      setBattleDetails(detailed)
      setVisibleBattles(Math.min(LOGS_SLICE, detailed.length))
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [heroId, selectedGameId])

  const battleSummary = useMemo(() => buildBattleSummary(battleDetails), [battleDetails])

  const handleShowMore = useCallback(() => {
    setVisibleBattles((count) => Math.min(count + LOGS_SLICE, (battleDetails || []).length))
  }, [battleDetails])

  return {
    battleDetails,
    battleSummary,
    visibleBattles,
    loading,
    error,
    showMore: handleShowMore,
  }
}

//
