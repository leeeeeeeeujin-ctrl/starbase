import { useCallback, useEffect, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'

export default function useLobbyStats({ heroId, enabled } = {}) {
  const [viewerId, setViewerId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [participations, setParticipations] = useState([])
  const [seasons, setSeasons] = useState([])
  const [logs, setLogs] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    async function loadViewer() {
      const { data, error } = await supabase.auth.getUser()
      if (cancelled) return
      if (!error && data?.user) {
        setViewerId(data.user.id)
      } else {
        setViewerId(null)
      }
    }
    loadViewer()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (!viewerId) return
    let cancelled = false

    async function loadStats() {
      setLoading(true)
      setError(null)

      const participantsResult = await withTable(supabase, 'rank_participants', (table) => {
        let query = supabase.from(table).select('*').eq('owner_id', viewerId)
        if (heroId) {
          query = query.or(`hero_id.eq.${heroId},hero_ids.cs.{${heroId}}`)
        }
        return query
      })

      if (cancelled) return

      if (participantsResult.error) {
        console.error(participantsResult.error)
        setError('참여 정보를 불러오지 못했습니다.')
        setParticipations([])
        setSeasons([])
        setLogs([])
        setLoading(false)
        return
      }

      const participantRows = participantsResult.data || []
      if (!participantRows.length) {
        setParticipations([])
        setSeasons([])
        setLogs([])
        setLoading(false)
        return
      }

      const gameIds = Array.from(new Set(participantRows.map((row) => row.game_id).filter(Boolean)))

      const [gamesResult, seasonsResult, battlesResult] = await Promise.all([
        withTable(supabase, 'rank_games', (table) =>
          supabase.from(table).select('id, name, description, image_url').in('id', gameIds),
        ),
        withTable(supabase, 'rank_game_seasons', (table) =>
          supabase
            .from(table)
            .select('*')
            .in('game_id', gameIds)
            .order('started_at', { ascending: false }),
        ),
        withTable(supabase, 'rank_battles', (table) =>
          supabase
            .from(table)
            .select('id, game_id, result, score_delta, created_at, attacker_owner_id, defender_owner_id')
            .in('game_id', gameIds)
            .order('created_at', { ascending: false })
            .limit(160),
        ),
      ])

      if (cancelled) return

      if (gamesResult.error) {
        console.error(gamesResult.error)
      }
      if (seasonsResult.error) {
        console.error(seasonsResult.error)
      }
      if (battlesResult.error) {
        console.error(battlesResult.error)
      }

      const gameMap = new Map((gamesResult.data || []).map((game) => [game.id, game]))

      const participationView = participantRows.map((row) => {
        const game = gameMap.get(row.game_id)
        const heroMatches = [row.hero_id, ...(row.hero_ids || [])].filter(Boolean)
        return {
          id: row.id,
          gameId: row.game_id,
          gameName: game?.name || '알 수 없는 게임',
          rating: row.rating ?? 0,
          battles: row.battles ?? 0,
          winRate: row.win_rate ?? 0,
          role: row.role || null,
          status: row.status || null,
          joinedAt: row.created_at,
          heroIds: heroMatches,
        }
      })

      const seasonView = (seasonsResult.data || []).map((row) => ({
        id: row.id,
        gameId: row.game_id,
        gameName: gameMap.get(row.game_id)?.name || '알 수 없는 게임',
        name: row.name,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        leaderboard: row.leaderboard || [],
      }))

      const relevantBattles = (battlesResult.data || []).filter((battle) => {
        if (!battle) return false
        if (battle.attacker_owner_id === viewerId) return true
        if (battle.defender_owner_id === viewerId) return true
        return false
      })

      let logRows = []
      if (relevantBattles.length) {
        const battleIds = relevantBattles.map((battle) => battle.id)
        const logsResult = await withTable(supabase, 'rank_battle_logs', (table) =>
          supabase
            .from(table)
            .select('id, battle_id, turn_no, prompt, ai_response, created_at')
            .in('battle_id', battleIds)
            .order('created_at', { ascending: false })
            .limit(200),
        )
        if (cancelled) return
        if (logsResult.error) {
          console.error(logsResult.error)
        }
        logRows = logsResult.data || []
      }

      const battleMap = new Map(relevantBattles.map((battle) => [battle.id, battle]))
      const logView = logRows.map((log) => {
        const battle = battleMap.get(log.battle_id)
        const game = battle ? gameMap.get(battle.game_id) : null
        return {
          id: log.id,
          battleId: log.battle_id,
          gameId: battle?.game_id || null,
          gameName: game?.name || '알 수 없는 게임',
          createdAt: log.created_at,
          turnNo: log.turn_no,
          prompt: log.prompt,
          aiResponse: log.ai_response,
          battle,
        }
      })

      setParticipations(participationView)
      setSeasons(seasonView)
      setLogs(logView)
      setLoading(false)
    }

    loadStats()

    return () => {
      cancelled = true
    }
  }, [enabled, viewerId, heroId, refreshKey])

  const leaveGame = useCallback(
    async (participantId) => {
      if (!participantId) {
        return { ok: false, error: '참여 정보를 찾을 수 없습니다.' }
      }
      const { error } = await withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).delete().eq('id', participantId),
      )
      if (error) {
        console.error(error)
        return { ok: false, error: error.message || '참여를 해제할 수 없습니다.' }
      }
      refresh()
      return { ok: true }
    },
    [refresh],
  )

  return {
    loading,
    error,
    participations,
    seasons,
    logs,
    leaveGame,
    refresh,
  }
}
