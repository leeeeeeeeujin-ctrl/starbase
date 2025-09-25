import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import { MAX_GAME_ROWS, SORT_OPTIONS } from '../constants'

export default function useGameBrowser({ enabled } = {}) {
  const [gameQuery, setGameQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [gameSort, setGameSort] = useState('latest')
  const [gameRows, setGameRows] = useState([])
  const [gameLoading, setGameLoading] = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [gameRoles, setGameRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [roleChoice, setRoleChoice] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(gameQuery), 250)
    return () => clearTimeout(timer)
  }, [gameQuery])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function loadGames() {
      setGameLoading(true)

      const { data, error } = await withTable(supabase, 'rank_games', (table) => {
        let query = supabase
          .from(table)
          .select('id,name,description,image_url,created_at,likes_count,play_count')

        if (debouncedQuery.trim()) {
          const value = `%${debouncedQuery.trim()}%`
          query = query.or(`name.ilike.${value},description.ilike.${value}`)
        }

        const plan = SORT_OPTIONS.find((item) => item.key === gameSort) || SORT_OPTIONS[0]
        plan.orders.forEach((order) => {
          query = query.order(order.column, { ascending: order.asc })
        })

        return query.limit(MAX_GAME_ROWS)
      })
      if (cancelled) return

      if (error) {
        console.error(error)
        setGameRows([])
      } else {
        setGameRows(data || [])
      }

      setGameLoading(false)
    }

    loadGames()

    return () => {
      cancelled = true
    }
  }, [enabled, debouncedQuery, gameSort])

  useEffect(() => {
    if (!selectedGame) return
    let cancelled = false

    async function loadDetail() {
      setDetailLoading(true)
      setRoleChoice('')

      const [rolesResult, participantsResult] = await Promise.all([
        withTable(supabase, 'rank_game_roles', (table) =>
          supabase.from(table).select('*').eq('game_id', selectedGame.id)
        ),
        withTable(supabase, 'rank_participants', (table) =>
          supabase.from(table).select('*').eq('game_id', selectedGame.id)
        ),
      ])

      if (cancelled) return

      if (rolesResult.error) {
        console.error(rolesResult.error)
        setGameRoles([])
      } else {
        setGameRoles(rolesResult.data || [])
      }

      if (participantsResult.error) {
        console.error(participantsResult.error)
        setParticipants([])
      } else {
        setParticipants(participantsResult.data || [])
      }

      setDetailLoading(false)
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedGame])

  const roleSlots = useMemo(() => {
    const map = new Map()
    gameRoles.forEach((role) => {
      const occupied = participants.filter((p) => (p.role || '') === role.name).length
      map.set(role.name, { capacity: role.slot_count ?? 1, occupied })
    })
    return map
  }, [gameRoles, participants])

  return {
    gameQuery,
    setGameQuery,
    gameSort,
    setGameSort,
    gameRows,
    gameLoading,
    selectedGame,
    setSelectedGame,
    detailLoading,
    gameRoles,
    participants,
    roleChoice,
    setRoleChoice,
    roleSlots,
  }
}
//
