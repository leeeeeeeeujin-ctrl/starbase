import { useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabase'
import { withTable } from '@/lib/supabaseTables'

import { aggregateHeroStats, safeFirstHeroId, summarize } from './utils'

export function useRankingShowcaseData({ maxGameSections = 3 } = {}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [heroMap, setHeroMap] = useState({})
  const [gameMap, setGameMap] = useState({})
  const [topStats, setTopStats] = useState(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: listError } = await withTable(
        supabase,
        'rank_participants',
        (table) =>
          supabase
            .from(table)
            .select('id, game_id, hero_id, heroes_id, hero_ids, rating, score, battles, updated_at')
            .order('rating', { ascending: false })
            .limit(30),
      )

      if (!alive) return

      if (listError) {
        setError(listError.message || '랭킹 정보를 불러오지 못했습니다.')
        setRows([])
        setHeroMap({})
        setGameMap({})
        setTopStats(null)
        setLoading(false)
        return
      }

      const normalized = (data || []).map((item) => ({
        ...item,
        hero_id: item?.hero_id || item?.heroes_id || null,
      }))
      const valid = normalized.filter((item) => safeFirstHeroId(item))
      setRows(valid)

      const heroIds = Array.from(new Set(valid.map((item) => safeFirstHeroId(item)).filter(Boolean)))
      const gameIds = Array.from(new Set(valid.map((item) => item?.game_id).filter(Boolean)))

      const [heroRes, gameRes] = await Promise.all([
        heroIds.length
          ? withTable(supabase, 'heroes', (table) =>
              supabase
                .from(table)
                .select('id, name, image_url, description, owner_id, ability1, ability2, ability3, ability4')
                .in('id', heroIds),
            )
          : Promise.resolve({ data: [], error: null }),
        gameIds.length
          ? withTable(supabase, 'rank_games', (table) =>
              supabase.from(table).select('id, name, image_url').in('id', gameIds)
            )
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!alive) return

      if (heroRes.error) setError(heroRes.error.message || '영웅 정보를 불러오지 못했습니다.')
      if (gameRes.error) setError((prev) => prev || gameRes.error.message || '게임 정보를 불러오지 못했습니다.')

      const heroLookup = {}
      ;(heroRes.data || []).forEach((item) => {
        heroLookup[item.id] = item
      })
      const gameLookup = {}
      ;(gameRes.data || []).forEach((item) => {
        gameLookup[item.id] = item
      })

      setHeroMap(heroLookup)
      setGameMap(gameLookup)
      setLoading(false)

      const topHeroId = safeFirstHeroId(valid[0])
      if (topHeroId) {
        const [attackRes, defendRes] = await Promise.all([
          withTable(supabase, 'rank_battles', (table) =>
            supabase
              .from(table)
              .select('id, result, attacker_hero_ids, defender_hero_ids')
              .contains('attacker_hero_ids', [topHeroId])
              .order('created_at', { ascending: false })
              .limit(40),
          ),
          withTable(supabase, 'rank_battles', (table) =>
            supabase
              .from(table)
              .select('id, result, attacker_hero_ids, defender_hero_ids')
              .contains('defender_hero_ids', [topHeroId])
              .order('created_at', { ascending: false })
              .limit(40),
          ),
        ])

        if (!alive) return

        if (attackRes.error || defendRes.error) {
          setTopStats(null)
        } else {
          setTopStats(
            aggregateHeroStats(topHeroId, attackRes.data || [], defendRes.data || []) || {
              wins: 0,
              losses: 0,
              draws: 0,
              total: 0,
              winRate: 0,
            },
          )
        }
      } else {
        setTopStats(null)
      }
    }

    load()

    return () => {
      alive = false
    }
  }, [])

  const enrichedRows = useMemo(() => rows.map((row) => summarize(row, heroMap, gameMap)), [rows, heroMap, gameMap])
  const highlight = enrichedRows[0] || null

  const leaders = useMemo(() => enrichedRows.slice(0, 6), [enrichedRows])

  const perGameSections = useMemo(() => {
    if (!rows.length) return []
    const grouped = new Map()

    rows.forEach((row) => {
      if (!row?.game_id) return
      if (!grouped.has(row.game_id)) grouped.set(row.game_id, [])
      grouped.get(row.game_id).push(row)
    })

    const sections = []
    grouped.forEach((value, gameId) => {
      const sorted = [...value].sort((a, b) => (b?.rating ?? 0) - (a?.rating ?? 0))
      sections.push({
        gameId,
        game: gameMap[gameId] || null,
        rows: sorted.slice(0, 3).map((row) => summarize(row, heroMap, gameMap)),
      })
    })

    sections.sort((a, b) => {
      const left = a.rows[0]?.rating ?? 0
      const right = b.rows[0]?.rating ?? 0
      return right - left
    })

    return sections.slice(0, maxGameSections)
  }, [rows, gameMap, heroMap, maxGameSections])

  return {
    loading,
    error,
    highlight,
    leaders,
    perGameSections,
    topStats,
  }
}

//
