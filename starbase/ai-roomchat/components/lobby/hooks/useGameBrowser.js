import { useCallback, useEffect, useMemo, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import { MAX_GAME_ROWS, SORT_OPTIONS } from '../constants'

function computeGameStats(participants = [], battles = [], game = {}) {
  const totalPlayers = participants.length
  const totalBattles = battles.length
  const ratingSum = participants.reduce((acc, row) => acc + (row.rating ?? 0), 0)
  const winRateSum = participants.reduce((acc, row) => acc + ((row.win_rate ?? 0) || 0), 0)
  const battleSum = participants.reduce((acc, row) => acc + (row.battles ?? 0), 0)

  const topPlayers = [...participants]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 5)
    .map((row, index) => ({
      rank: index + 1,
      heroId: row.hero_id,
      heroName: row.hero_name || row.hero_id || '알 수 없음',
      rating: row.rating ?? 0,
      battles: row.battles ?? 0,
      winRate: row.win_rate ?? 0,
    }))

  return {
    totalPlayers,
    totalBattles,
    averageRating: totalPlayers ? Math.round((ratingSum / totalPlayers) * 10) / 10 : 0,
    averageWinRate: totalPlayers ? Math.round((winRateSum / totalPlayers) * 1000) / 10 : 0,
    averageBattles: totalPlayers ? Math.round((battleSum / totalPlayers) * 10) / 10 : 0,
    likes: game.likes_count ?? 0,
    playCount: game.play_count ?? 0,
    topPlayers,
  }
}

function normaliseGameRow(raw = {}) {
  const base = {
    id: raw.id,
    owner_id: raw.owner_id,
    name: raw.name || '이름 없는 게임',
    description: raw.description || '',
    created_at: raw.created_at || null,
    image_url: raw.image_url ?? raw.cover_path ?? null,
    cover_path: raw.cover_path ?? null,
    likes_count: raw.likes_count ?? 0,
    play_count: raw.play_count ?? 0,
    tags: raw.tags || [],
  }

  return base
}

export default function useGameBrowser({ enabled } = {}) {
  const [gameQuery, setGameQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [gameSort, setGameSort] = useState('latest')
  const [gameRows, setGameRows] = useState([])
  const [gameLoading, setGameLoading] = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRevision, setDetailRevision] = useState(0)
  const [gameRoles, setGameRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [roleChoice, setRoleChoice] = useState('')
  const [gameTags, setGameTags] = useState([])
  const [gameSeasons, setGameSeasons] = useState([])
  const [gameBattleLogs, setGameBattleLogs] = useState([])
  const [gameStats, setGameStats] = useState(null)
  const [viewerId, setViewerId] = useState(null)
  const [gameSourceTable, setGameSourceTable] = useState('')

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
    const timer = setTimeout(() => setDebouncedQuery(gameQuery), 250)
    return () => clearTimeout(timer)
  }, [gameQuery])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function loadGames() {
      setGameLoading(true)

      const result = await withTable(supabase, 'rank_games', (table) => {
        let query = supabase
          .from(table)
          .select('id,name,description,image_url,created_at,likes_count,play_count,owner_id')

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

      const { data, error, table } = result || {}

      if (!cancelled) {
        setGameSourceTable(table || '')
      }

      if (cancelled) return

      if (error) {
        console.error(error)
        setGameRows([])
        setGameLoading(false)
        return
      }
      let rows = (data || []).map((row) => normaliseGameRow(row))

      if (rows.length) {
        const ids = rows.map((row) => row.id)
        const { data: tagRows, error: tagError } = await withTable(
          supabase,
          'rank_game_tags',
          (table) =>
            supabase
              .from(table)
              .select('id, game_id, tag')
              .in('game_id', ids)
              .order('tag', { ascending: true }),
        )
        if (tagError) {
          console.error(tagError)
        }
        const tagMap = new Map()
        ;(tagRows || []).forEach((tag) => {
          const list = tagMap.get(tag.game_id) || []
          list.push(tag.tag)
          tagMap.set(tag.game_id, list)
        })
        rows = rows.map((row) => ({
          ...row,
          tags: tagMap.get(row.id) || [],
        }))
      }

      setGameRows(rows)
      if (selectedGame) {
        const match = rows.find((row) => row.id === selectedGame.id)
        if (match) {
          setSelectedGame((prev) => (prev ? { ...prev, ...match } : prev))
        }
      }
      setGameLoading(false)
    }

    loadGames()

    return () => {
      cancelled = true
    }
  }, [enabled, debouncedQuery, gameSort, selectedGame?.id])

  useEffect(() => {
    if (!selectedGame) {
      setGameRoles([])
      setParticipants([])
      setGameTags([])
      setGameSeasons([])
      setGameBattleLogs([])
      setGameStats(null)
      return
    }

    if (gameSourceTable && gameSourceTable !== 'rank_games') {
      setDetailLoading(false)
      setGameRoles([])
      setParticipants([])
      setGameTags([])
      setGameSeasons([])
      setGameBattleLogs([])
      setGameStats(null)
      return
    }

    let cancelled = false

    async function loadDetail() {
      setDetailLoading(true)
      setRoleChoice('')

      const [rolesResult, participantsResult, tagsResult, seasonsResult, battlesResult, logsResult] =
        await Promise.all([
          withTable(supabase, 'rank_game_roles', (table) =>
            supabase.from(table).select('*').eq('game_id', selectedGame.id),
          ),
          withTable(supabase, 'rank_participants', (table) =>
            supabase.from(table).select('*').eq('game_id', selectedGame.id),
          ),
          withTable(supabase, 'rank_game_tags', (table) =>
            supabase
              .from(table)
              .select('id, tag, created_at')
              .eq('game_id', selectedGame.id)
              .order('tag', { ascending: true }),
          ),
          withTable(supabase, 'rank_game_seasons', (table) =>
            supabase
              .from(table)
              .select('*')
              .eq('game_id', selectedGame.id)
              .order('started_at', { ascending: false }),
          ),
          withTable(supabase, 'rank_battles', (table) =>
            supabase
              .from(table)
              .select('id, result, score_delta, created_at, attacker_owner_id, defender_owner_id')
              .eq('game_id', selectedGame.id)
              .order('created_at', { ascending: false })
              .limit(40),
          ),
          withTable(supabase, 'rank_battle_logs', (table) =>
            supabase
              .from(table)
              .select('id, battle_id, turn_no, prompt, ai_response, created_at')
              .eq('game_id', selectedGame.id)
              .order('created_at', { ascending: false })
              .limit(60),
          ),
        ])

      if (cancelled) return

      const participantRows = participantsResult.data || []
      const battleRows = battlesResult.data || []
      const logRows = logsResult.data || []

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
        setParticipants(participantRows)
      }

      if (tagsResult.error) {
        console.error(tagsResult.error)
        setGameTags([])
      } else {
        setGameTags(tagsResult.data || [])
      }

      if (seasonsResult.error) {
        console.error(seasonsResult.error)
        setGameSeasons([])
      } else {
        setGameSeasons(seasonsResult.data || [])
      }

      if (battlesResult.error) {
        console.error(battlesResult.error)
      }

      if (logsResult.error) {
        console.error(logsResult.error)
      }

      const battleMap = new Map(battleRows.map((row) => [row.id, row]))
      const decoratedLogs = logRows.map((log) => ({
        ...log,
        battle: battleMap.get(log.battle_id) || null,
      }))

      setGameBattleLogs(decoratedLogs)
      setGameStats(computeGameStats(participantRows, battleRows, selectedGame))
      setDetailLoading(false)
    }

    loadDetail()

    return () => {
      cancelled = true
    }
  }, [selectedGame, detailRevision, gameSourceTable])

  const roleSlots = useMemo(() => {
    const map = new Map()
    gameRoles.forEach((role) => {
      const occupied = participants.filter((p) => (p.role || '') === role.name).length
      map.set(role.name, { capacity: role.slot_count ?? 1, occupied })
    })
    return map
  }, [gameRoles, participants])

  const refreshSelectedGame = useCallback(() => {
    setDetailRevision((value) => value + 1)
  }, [])

  const addGameTag = useCallback(
    async (label) => {
      if (gameSourceTable && gameSourceTable !== 'rank_games') {
        return { ok: false, error: '이 게임은 태그 편집을 지원하지 않습니다.' }
      }
      if (!selectedGame) {
        return { ok: false, error: '게임을 먼저 선택해 주세요.' }
      }
      const trimmed = (label || '').trim()
      if (!trimmed) {
        return { ok: false, error: '태그 내용을 입력해 주세요.' }
      }
      if (gameTags.some((tag) => tag.tag === trimmed)) {
        return { ok: false, error: '이미 존재하는 태그입니다.' }
      }
      const { data, error } = await withTable(supabase, 'rank_game_tags', (table) =>
        supabase
          .from(table)
          .insert({ game_id: selectedGame.id, tag: trimmed })
          .select('id, tag, created_at')
          .single(),
      )
      if (error) {
        console.error(error)
        return { ok: false, error: error.message || '태그를 추가할 수 없습니다.' }
      }
      setGameTags((prev) => [...prev, data])
      setGameRows((prev) =>
        prev.map((row) =>
          row.id === selectedGame.id ? { ...row, tags: [...(row.tags || []), data.tag] } : row,
        ),
      )
      return { ok: true }
    },
    [gameTags, selectedGame, gameSourceTable],
  )

  const removeGameTag = useCallback(
    async (tagId) => {
      if (gameSourceTable && gameSourceTable !== 'rank_games') {
        return { ok: false, error: '이 게임은 태그 편집을 지원하지 않습니다.' }
      }
      if (!selectedGame) {
        return { ok: false, error: '게임을 먼저 선택해 주세요.' }
      }
      const existing = gameTags.find((tag) => tag.id === tagId)
      if (!existing) {
        return { ok: false, error: '태그를 찾을 수 없습니다.' }
      }
      const { error } = await withTable(supabase, 'rank_game_tags', (table) =>
        supabase.from(table).delete().eq('id', tagId),
      )
      if (error) {
        console.error(error)
        return { ok: false, error: error.message || '태그를 삭제할 수 없습니다.' }
      }
      setGameTags((prev) => prev.filter((tag) => tag.id !== tagId))
      setGameRows((prev) =>
        prev.map((row) =>
          row.id === selectedGame.id
            ? { ...row, tags: (row.tags || []).filter((value) => value !== existing.tag) }
            : row,
        ),
      )
      return { ok: true }
    },
    [gameTags, selectedGame, gameSourceTable],
  )

  const startSeason = useCallback(async () => {
    if (gameSourceTable && gameSourceTable !== 'rank_games') {
      return { ok: false, error: '시즌 기능은 아직 지원되지 않습니다.' }
    }
    if (!selectedGame) {
      return { ok: false, error: '게임을 먼저 선택해 주세요.' }
    }
    if (gameSeasons.some((season) => season.status === 'active')) {
      return { ok: false, error: '이미 진행 중인 시즌이 있습니다.' }
    }
    const seasonIndex = gameSeasons.length + 1
    const payload = {
      game_id: selectedGame.id,
      name: `시즌 ${seasonIndex}`,
      status: 'active',
      started_at: new Date().toISOString(),
    }
    const { data, error } = await withTable(supabase, 'rank_game_seasons', (table) =>
      supabase.from(table).insert(payload).select('*').single(),
    )
    if (error) {
      console.error(error)
      return { ok: false, error: error.message || '새 시즌을 시작할 수 없습니다.' }
    }
    setGameSeasons((prev) => [data, ...prev])
    return { ok: true }
  }, [gameSeasons, selectedGame, gameSourceTable])

  const finishSeason = useCallback(
    async (seasonId) => {
      if (gameSourceTable && gameSourceTable !== 'rank_games') {
        return { ok: false, error: '시즌 기능은 아직 지원되지 않습니다.' }
      }
      if (!selectedGame) {
        return { ok: false, error: '게임을 먼저 선택해 주세요.' }
      }
      const target =
        gameSeasons.find((season) => season.id === seasonId) ||
        gameSeasons.find((season) => season.status === 'active')
      if (!target) {
        return { ok: false, error: '종료할 시즌을 찾을 수 없습니다.' }
      }
      if (target.status === 'completed') {
        return { ok: false, error: '이미 종료된 시즌입니다.' }
      }
      const leaderboard = [...participants]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 10)
        .map((row, index) => ({
          rank: index + 1,
          hero_id: row.hero_id,
          hero_name: row.hero_name || row.hero_id,
          rating: row.rating ?? 0,
          battles: row.battles ?? 0,
          win_rate: row.win_rate ?? 0,
        }))

      const payload = {
        status: 'completed',
        ended_at: new Date().toISOString(),
        leaderboard,
      }

      const { data, error } = await withTable(supabase, 'rank_game_seasons', (table) =>
        supabase.from(table).update(payload).eq('id', target.id).select('*').single(),
      )
      if (error) {
        console.error(error)
        return { ok: false, error: error.message || '시즌을 종료할 수 없습니다.' }
      }
      setGameSeasons((prev) => prev.map((season) => (season.id === target.id ? data : season)))
      return { ok: true }
    },
    [gameSeasons, participants, selectedGame, gameSourceTable],
  )

  const deleteGame = useCallback(async () => {
    if (!selectedGame) {
      return { ok: false, error: '삭제할 게임을 먼저 선택해 주세요.' }
    }
    const { error } = await withTable(supabase, 'rank_games', (table) =>
      supabase.from(table).delete().eq('id', selectedGame.id),
    )
    if (error) {
      console.error(error)
      return { ok: false, error: error.message || '게임을 삭제할 수 없습니다.' }
    }
    setGameRows((prev) => prev.filter((row) => row.id !== selectedGame.id))
    setSelectedGame(null)
    setGameRoles([])
    setParticipants([])
    setGameTags([])
    setGameSeasons([])
    setGameBattleLogs([])
    setGameStats(null)
    setRoleChoice('')
    return { ok: true }
  }, [selectedGame])

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
    viewerId,
    gameTags,
    addGameTag,
    removeGameTag,
    gameSeasons,
    finishSeason,
    startSeason,
    gameStats,
    gameBattleLogs,
    refreshSelectedGame,
    deleteGame,
  }
}
