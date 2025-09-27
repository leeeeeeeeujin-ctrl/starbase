import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { buildStatSlides } from '../../utils/characterStats'
import { formatKoreanDate } from '../../utils/dateFormatting'

export default function useHeroParticipations({ hero }) {
  const [participations, setParticipations] = useState([])
  const [gameDetails, setGameDetails] = useState({})
  const [scoreboards, setScoreboards] = useState({})
  const [heroLookup, setHeroLookup] = useState({})
  const [selectedGameId, setSelectedGameId] = useState(null)
  const [loading, setLoading] = useState(false)

  const heroId = hero?.id || null

  const heroSeed = useMemo(() => {
    if (!heroId) return null
    return {
      id: heroId,
      name: hero?.name ?? null,
      image_url: hero?.image_url ?? null,
      ability1: hero?.ability1 ?? null,
      ability2: hero?.ability2 ?? null,
      ability3: hero?.ability3 ?? null,
      ability4: hero?.ability4 ?? null,
    }
  }, [
    hero?.ability1,
    hero?.ability2,
    hero?.ability3,
    hero?.ability4,
    hero?.image_url,
    hero?.name,
    heroId,
  ])

  const requestIdRef = useRef(0)

  const applyInitialState = useCallback(
    (requestId) => {
      if (requestId && requestId !== requestIdRef.current) return
      setParticipations([])
      setGameDetails({})
      setScoreboards({})
      setHeroLookup(heroSeed ? { [heroSeed.id]: heroSeed } : {})
      setSelectedGameId(null)
      setLoading(false)
    },
    [heroSeed],
  )

  const loadParticipations = useCallback(
    async ({ silent } = {}) => {
      const requestId = ++requestIdRef.current
      if (!heroId) {
        applyInitialState(requestId)
        return
      }

      if (!silent) setLoading(true)

      try {
        const { data: heroSlots, error: heroSlotsError } = await withTable(
          supabase,
          'game_slots',
        (table) =>
          supabase
            .from(table)
            .select('id, game_id, hero_id, slot_no')
            .eq('hero_id', heroId),
      )

        if (heroSlotsError) {
          console.warn('game_slots hero lookup failed:', heroSlotsError.message)
        }

        const filteredSlots = Array.isArray(heroSlots) ? heroSlots.filter((row) => row?.game_id) : []
        const gameIds = Array.from(new Set(filteredSlots.map((row) => row.game_id)))

        if (gameIds.length === 0) {
          applyInitialState(requestId)
          return
        }

        const [allSlotsResult, gamesResult, sessionsResult] = await Promise.all([
          withTable(supabase, 'game_slots', (table) =>
            supabase
              .from(table)
            .select('id, game_id, hero_id, slot_no')
            .in('game_id', gameIds),
        ),
        withTable(supabase, 'games', (table) =>
          supabase
            .from(table)
            .select('id, name, cover_path, description, owner_id, created_at')
            .in('id', gameIds),
        ),
        withTable(supabase, 'game_sessions', (table) =>
          supabase
            .from(table)
            .select('id, game_id, created_at, mode, started_by')
            .in('game_id', gameIds)
            .order('created_at', { ascending: false }),
        ),
      ])

        const { data: allSlots, error: allSlotsError } = allSlotsResult
        if (allSlotsError) {
          console.warn('game_slots peers lookup failed:', allSlotsError.message)
        }

        const { data: games, error: gamesError } = gamesResult
        if (gamesError) {
          console.warn('games lookup failed:', gamesError.message)
        }

        const { data: sessions, error: sessionsError } = sessionsResult
        if (sessionsError) {
          console.warn('game_sessions lookup failed:', sessionsError.message)
        }

        const gameMap = {}
        ;(Array.isArray(games) ? games : []).forEach((game) => {
          if (game?.id) {
            gameMap[game.id] = {
              ...game,
              image_url: game.cover_path || game.image_url || null,
            }
          }
        })

        const sessionsByGame = new Map()
        ;(Array.isArray(sessions) ? sessions : []).forEach((session) => {
          if (!session?.game_id) return
          if (!sessionsByGame.has(session.game_id)) {
            sessionsByGame.set(session.game_id, [])
          }
          sessionsByGame.get(session.game_id).push(session)
        })

        const scoreboardMap = {}
        const heroIds = new Set(heroId ? [heroId] : [])

        ;(Array.isArray(allSlots) ? allSlots : []).forEach((slot) => {
          if (!slot?.game_id) return
          if (!scoreboardMap[slot.game_id]) {
            scoreboardMap[slot.game_id] = []
          }
          scoreboardMap[slot.game_id].push({
            id: slot.id,
            game_id: slot.game_id,
            hero_id: slot.hero_id,
            slot_no: slot.slot_no,
            role: slot.slot_no != null ? `슬롯 ${slot.slot_no}` : '',
            rating: slot.slot_no != null ? slot.slot_no + 1 : null,
            battles: (sessionsByGame.get(slot.game_id) || []).length || null,
          })
          if (slot.hero_id) {
            heroIds.add(slot.hero_id)
          }
        })

        const participationRows = filteredSlots.map((slot) => {
          const sessionList = sessionsByGame.get(slot.game_id) || []
          const sessionCount = sessionList.length
          const latestSession = sessionList[0]?.created_at || null
          const oldestSession = sessionList.length ? sessionList[sessionList.length - 1]?.created_at : null
          const modeFrequency = sessionList.reduce((acc, session) => {
            const modeKey = session?.mode || '기록 없음'
            acc[modeKey] = (acc[modeKey] || 0) + 1
            return acc
          }, {})
          const primaryMode = Object.keys(modeFrequency).sort(
            (left, right) => (modeFrequency[right] || 0) - (modeFrequency[left] || 0),
          )[0]

          return {
            id: slot.id,
            game_id: slot.game_id,
            hero_id: slot.hero_id,
            slot_no: slot.slot_no,
            role: slot.slot_no != null ? `슬롯 ${slot.slot_no}` : '',
            sessionCount,
            latestSessionAt: latestSession ? formatKoreanDate(latestSession) : null,
            firstSessionAt: oldestSession ? formatKoreanDate(oldestSession) : null,
            primaryMode: primaryMode || null,
            game: gameMap[slot.game_id] || null,
          }
        })

        if (requestId !== requestIdRef.current) {
          return
        }

        setParticipations(participationRows)
        setGameDetails(gameMap)
        setScoreboards(scoreboardMap)

        const { data: heroRows, error: heroErr } = heroIds.size
          ? await withTable(supabase, 'heroes', (table) =>
              supabase
                .from(table)
                .select('id, name, image_url, ability1, ability2, ability3, ability4')
                .in('id', Array.from(heroIds))
            )
          : { data: [], error: null }

        if (heroErr) console.warn('heroes lookup failed:', heroErr.message)

        const lookup = {}
        ;(Array.isArray(heroRows) ? heroRows : []).forEach((row) => {
          if (row?.id) lookup[row.id] = row
        })
        if (heroSeed?.id) {
          lookup[heroSeed.id] = heroSeed
        }
        if (requestId === requestIdRef.current) {
          setHeroLookup(lookup)
          setSelectedGameId((current) => {
            if (current && participationRows.some((row) => row.game_id === current)) {
              return current
            }
            return participationRows[0]?.game_id || null
          })
        }
      } catch (error) {
        console.error('Failed to load hero participations:', error)
      } finally {
        if (requestId === requestIdRef.current && !silent) {
          setLoading(false)
        }
      }
    },
    [applyInitialState, heroId, heroSeed],
  )

  useEffect(() => {
    loadParticipations({ silent: false })
    return () => {
      requestIdRef.current += 1
    }
  }, [loadParticipations])

  const refresh = useCallback(() => {
    loadParticipations({ silent: false })
  }, [loadParticipations])

  const selectedEntry = useMemo(
    () => participations.find((row) => row.game_id === selectedGameId) || null,
    [participations, selectedGameId],
  )

  const selectedScoreboard = useMemo(() => {
    if (!selectedGameId) return []
    const rows = scoreboards[selectedGameId] || []
    return [...rows].sort((a, b) => {
      const left = a.slot_no ?? Number.MAX_SAFE_INTEGER
      const right = b.slot_no ?? Number.MAX_SAFE_INTEGER
      return left - right
    })
  }, [scoreboards, selectedGameId])

  const selectedGame = useMemo(() => {
    if (!selectedGameId) return null
    const match = participations.find((row) => row.game_id === selectedGameId)
    if (match?.game) return match.game
    return gameDetails[selectedGameId] || null
  }, [gameDetails, participations, selectedGameId])

  const statSlides = useMemo(
    () => buildStatSlides(participations, scoreboards, heroId),
    [participations, scoreboards, heroId],
  )

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
    refresh,
  }
}

//
