import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { buildStatSlides } from '../../utils/characterStats'

export default function useHeroParticipations({ hero }) {
  const [participations, setParticipations] = useState([])
  const [gameDetails, setGameDetails] = useState({})
  const [scoreboards, setScoreboards] = useState({})
  const [heroLookup, setHeroLookup] = useState({})
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [loading, setLoading] = useState(false)

  const heroId = hero?.id || null

  const loadParticipations = useCallback(async () => {
    if (!heroId) {
      setParticipations([])
      setGameDetails({})
      setScoreboards({})
      setHeroLookup(hero ? { [hero.id]: hero } : {})
      setSelectedGameId(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const selectFields =
      'id, game_id, owner_id, hero_id, hero_ids, role, score, rating, battles, win_rate, created_at, updated_at'

    const [{ data: soloRows, error: soloErr }, { data: packRows, error: packErr }] = await Promise.all([
      withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).select(selectFields).eq('hero_id', heroId)
      ),
      withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).select(selectFields).contains('hero_ids', [heroId])
      ),
    ])

    if (soloErr) console.warn('rank_participants hero_id fetch failed:', soloErr.message)
    if (packErr) console.warn('rank_participants hero_ids fetch failed:', packErr.message)

    const combined = [...(soloRows || []), ...(packRows || [])]
    const byGame = new Map()
    combined.forEach((row) => {
      if (!row?.game_id) return
      const key = `${row.game_id}:${row.owner_id}`
      if (!byGame.has(key)) {
        byGame.set(key, row)
      }
    })

    const rows = Array.from(byGame.values()).sort((a, b) => {
      const left = new Date(a.updated_at || a.created_at || 0)
      const right = new Date(b.updated_at || b.created_at || 0)
      return right - left
    })

    const gameIds = Array.from(new Set(rows.map((row) => row.game_id).filter(Boolean)))

    const [{ data: games, error: gameErr }, { data: boardRows, error: boardErr }] = await Promise.all([
      gameIds.length
        ? withTable(supabase, 'rank_games', (table) =>
            supabase
              .from(table)
              .select('id, name, image_url, description, created_at')
              .in('id', gameIds)
          )
        : { data: [], error: null },
      gameIds.length
        ? withTable(supabase, 'rank_participants', (table) =>
            supabase
              .from(table)
              .select('id, game_id, owner_id, hero_id, hero_ids, role, rating, battles, score, updated_at')
              .in('game_id', gameIds)
          )
        : { data: [], error: null },
    ])

    if (gameErr) console.warn('rank_games fetch failed:', gameErr.message)
    if (boardErr) console.warn('scoreboard fetch failed:', boardErr.message)

    const gameMap = {}
    ;(games || []).forEach((game) => {
      if (game?.id) gameMap[game.id] = game
    })

    const scoreboardMap = {}
    ;(boardRows || []).forEach((row) => {
      if (!row?.game_id) return
      if (!scoreboardMap[row.game_id]) scoreboardMap[row.game_id] = []
      scoreboardMap[row.game_id].push(row)
    })

    setParticipations(rows.map((row) => ({ ...row, game: gameMap[row.game_id] || null })))
    setGameDetails(gameMap)
    setScoreboards(scoreboardMap)

    const heroIds = new Set()
    Object.values(scoreboardMap).forEach((list) => {
      list.forEach((row) => {
        if (row?.hero_id) heroIds.add(row.hero_id)
        if (Array.isArray(row?.hero_ids)) {
          row.hero_ids.forEach((value) => heroIds.add(value))
        }
      })
    })
    if (heroId) heroIds.add(heroId)

    const { data: heroRows, error: heroErr } = heroIds.size
      ? await withTable(supabase, 'heroes', (table) =>
          supabase
            .from(table)
            .select('id, name, image_url, ability1, ability2, ability3, ability4')
            .in('id', Array.from(heroIds))
        )
      : { data: [], error: null }

    if (heroErr) console.warn('heroes lookup fetch failed:', heroErr.message)

    const lookup = {}
    ;(heroRows || []).forEach((row) => {
      if (row?.id) lookup[row.id] = row
    })
    if (hero?.id) {
      lookup[hero.id] = {
        id: hero.id,
        name: hero.name,
        image_url: hero.image_url,
        ability1: hero.ability1,
        ability2: hero.ability2,
        ability3: hero.ability3,
        ability4: hero.ability4,
      }
    }
    setHeroLookup(lookup)

    setSelectedGameId((current) => {
      if (current && rows.some((row) => row.game_id === current)) {
        return current
      }
      return rows[0]?.game_id || null
    })

    setLoading(false)
  }, [hero, heroId])

  useEffect(() => {
    loadParticipations()
  }, [loadParticipations])

  const selectedEntry = useMemo(
    () => participations.find((row) => row.game_id === selectedGameId) || null,
    [participations, selectedGameId],
  )

  const selectedScoreboard = useMemo(() => {
    if (!selectedGameId) return []
    const rows = scoreboards[selectedGameId] || []
    return [...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
  }, [scoreboards, selectedGameId])

  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null
    const match = participations.find((row) => row.game_id === selectedGameId)
    if (match?.game) return match.game
    return gameDetails[selectedGameId] || null
  }, [gameDetails, participations, selectedGameId])

  const statSlides = useMemo(() => buildStatSlides(participations, scoreboards, heroId), [participations, scoreboards, heroId])

  return {
    loading,
    participations,
    selectedEntry,
    selectedGame,
    selectedGameId,
    selectedScoreboard,
    statSlides,
    heroLookup,
    setSelectedGameId,
    refresh: loadParticipations,
  }
}

//
