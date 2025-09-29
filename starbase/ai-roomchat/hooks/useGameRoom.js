// hooks/useGameRoom.js
import { useCallback, useEffect, useMemo, useState } from 'react'

import { withTable } from '@/lib/supabaseTables'

import { supabase } from '../lib/supabase'

async function fetchParticipantsWithHeroes(gameId) {
  const {
    data: participantsData,
    error: participantError,
  } = await withTable(supabase, 'rank_participants', (table) =>
    supabase
      .from(table)
      .select(
        'id, game_id, hero_id, owner_id, role, score, rating, battles, win_rate, created_at'
      )
      .eq('game_id', gameId)
      .order('score', { ascending: false })
  )

  if (participantError) throw participantError

  const participants = participantsData || []
  const heroIds = participants.map((p) => p.hero_id).filter(Boolean)

  if (!heroIds.length) {
    return participants.map((p) => ({ ...p, hero: null }))
  }

  const { data: heroesData, error: heroError } = await withTable(
    supabase,
    'heroes',
    (table) =>
      supabase
        .from(table)
        .select(
          'id, name, image_url, background_url, description, owner_id, ability1, ability2, ability3, ability4, bgm_url, bgm_duration_seconds'
        )
        .in('id', heroIds)
  )

  if (heroError) throw heroError

  const heroesById = new Map((heroesData || []).map((hero) => [hero.id, hero]))

  return participants.map((participant) => ({
    ...participant,
    hero: heroesById.get(participant.hero_id) || null,
  }))
}

async function resolveStoredHero() {
  if (typeof window === 'undefined') return null
  const heroId = window.localStorage.getItem('selectedHeroId')
  if (!heroId) return null

  const { data, error } = await withTable(supabase, 'heroes', (table) =>
    supabase
      .from(table)
      .select(
        'id, name, image_url, background_url, description, owner_id, ability1, ability2, ability3, ability4, bgm_url, bgm_duration_seconds'
      )
      .eq('id', heroId)
      .maybeSingle()
  )

  if (error) return null
  return data || null
}

async function fetchRecentBattles(gameId) {
  const { data, error } = await withTable(supabase, 'rank_battles', (table) =>
    supabase
      .from(table)
      .select(
        'id, game_id, attacker_owner_id, attacker_hero_ids, defender_owner_id, defender_hero_ids, result, score_delta, created_at'
      )
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(40)
  )

  if (error) throw error
  return data || []
}

export function useGameRoom(
  gameId,
  {
    onRequireLogin,
    onGameMissing,
    onDeleted,
  } = {}
) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [participants, setParticipants] = useState([])
  const [myHero, setMyHero] = useState(null)
  const [recentBattles, setRecentBattles] = useState([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!gameId) return
    let alive = true

    const bootstrap = async () => {
      setLoading(true)
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (!alive) return
        if (authError) throw authError
        const currentUser = authData?.user || null
        if (!currentUser) {
          onRequireLogin?.()
          setLoading(false)
          return
        }
        setUser(currentUser)

        const { data: gameData, error: gameError } = await withTable(
          supabase,
          'rank_games',
          (table) =>
            supabase
              .from(table)
              .select('*')
              .eq('id', gameId)
              .maybeSingle()
        )

        if (!alive) return
        if (gameError || !gameData) {
          onGameMissing?.()
          setLoading(false)
          return
        }

        setGame(gameData)
        setRoles(
          Array.isArray(gameData.roles) && gameData.roles.length
            ? gameData.roles
            : ['공격', '수비']
        )

        const mappedParticipants = await fetchParticipantsWithHeroes(gameId)
        if (!alive) return
        setParticipants(mappedParticipants)

        try {
          const battles = await fetchRecentBattles(gameId)
          if (!alive) return
          setRecentBattles(battles)
        } catch (battleError) {
          console.warn('최근 전투 기록을 불러오지 못했습니다:', battleError)
        }

        const storedHero = await resolveStoredHero()
        if (!alive) return
        setMyHero(storedHero)
      } catch (err) {
        console.error('게임 방 초기화 실패:', err)
      } finally {
        if (alive) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      alive = false
    }
  }, [gameId, onGameMissing, onRequireLogin])

  const refreshParticipants = useCallback(async () => {
    if (!gameId) return
    try {
      const mapped = await fetchParticipantsWithHeroes(gameId)
      setParticipants(mapped)
    } catch (err) {
      console.error('참가자 갱신 실패:', err)
    }
  }, [gameId])

  const refreshBattles = useCallback(async () => {
    if (!gameId) return
    try {
      const battles = await fetchRecentBattles(gameId)
      setRecentBattles(battles)
    } catch (err) {
      console.error('전투 기록 갱신 실패:', err)
    }
  }, [gameId])

  const selectHero = useCallback((hero) => {
    try {
      if (hero) {
        window.localStorage.setItem('selectedHeroId', hero.id)
      } else {
        window.localStorage.removeItem('selectedHeroId')
      }
    } catch (err) {
      console.warn('로컬 저장 실패:', err)
    }
    setMyHero(hero || null)
  }, [])

  const joinGame = useCallback(
    async (roleOverride) => {
      if (!gameId || !user) {
        alert('로그인이 필요합니다.')
        return { ok: false }
      }
      if (!myHero) {
        alert('로스터에서 캐릭터를 선택하고 다시 시도하세요.')
        return { ok: false }
      }
      const roleToUse = roleOverride || roles[0]
      if (!roleToUse) {
        alert('역할을 선택하세요.')
        return { ok: false }
      }

      const payload = {
        game_id: gameId,
        hero_id: myHero.id,
        owner_id: user.id,
        role: roleToUse,
        score: 1000,
      }

      const { error } = await withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).insert(payload, { ignoreDuplicates: true })
      )

      if (error) {
        alert('참여 실패: ' + error.message)
        return { ok: false, error }
      }

      await refreshParticipants()
      await refreshBattles()
      return { ok: true }
    },
    [gameId, myHero, refreshBattles, refreshParticipants, roles, user]
  )

  const deleteRoom = useCallback(async () => {
    if (!gameId || !user || !game) return { ok: false }
    if (user.id !== game.owner_id) return { ok: false }

    setDeleting(true)
    try {
      await withTable(supabase, 'rank_battle_logs', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_participants', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_game_slots', (table) =>
        supabase.from(table).delete().eq('game_id', gameId)
      )
      await withTable(supabase, 'rank_games', (table) =>
        supabase.from(table).delete().eq('id', gameId)
      )
      onDeleted?.()
      return { ok: true }
    } catch (err) {
      console.error('방 삭제 실패:', err)
      alert('방 삭제 실패: ' + (err.message || err))
      return { ok: false, error: err }
    } finally {
      setDeleting(false)
    }
  }, [gameId, game, onDeleted, user])

  const myEntry = useMemo(() => {
    if (!myHero) return null
    return participants.find((participant) => participant.hero_id === myHero.id) || null
  }, [participants, myHero])

  const canStart = useMemo(() => participants.length > 1, [participants.length])

  const isOwner = useMemo(() => {
    if (!user || !game) return false
    return user.id === game.owner_id
  }, [game, user])

  const alreadyJoined = !!myEntry

  return {
    state: {
      loading,
      user,
      game,
      roles,
      participants,
      myHero,
      recentBattles,
      deleting,
    },
    derived: {
      canStart,
      isOwner,
      alreadyJoined,
      myEntry,
    },
    actions: {
      selectHero,
      joinGame,
      deleteRoom,
      refreshParticipants,
      refreshBattles,
    },
  }
}

// 
