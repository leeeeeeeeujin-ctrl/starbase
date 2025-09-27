'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import { normaliseHero } from '../../services/heroes'

const DEFAULT_HERO_NAME = '이름 없는 영웅'

function normaliseAppearance(row, gamesById) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const game = gamesById.get(row.game_id) || null

  return {
    id: row.id || null,
    slotNo: row.slot_no ?? null,
    gameId: row.game_id || null,
    gameName: game?.name || '비공개 게임',
    gameCover: game?.cover_path || null,
    gameDescription: game?.description || '',
    gameCreatedAt: game?.created_at || null,
  }
}

export function useCharacterProfile(heroId) {
  const mountedRef = useRef(true)
  const [state, setState] = useState({
    loading: true,
    error: '',
    unauthorized: false,
    missingHero: false,
    hero: null,
    appearances: [],
  })

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!mountedRef.current) return

    if (!heroId) {
      setState({
        loading: false,
        error: '',
        unauthorized: false,
        missingHero: true,
        hero: null,
        appearances: [],
      })
      return
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: '',
      unauthorized: false,
      missingHero: false,
    }))

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError

      let user = sessionData?.session?.user || null

      if (!user) {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        user = userData?.user || null
      }

      if (!user) {
        if (!mountedRef.current) return
        setState({
          loading: false,
          error: '',
          unauthorized: true,
          missingHero: false,
          hero: null,
          appearances: [],
        })
        return
      }

      const {
        data: heroRow,
        error: heroError,
      } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select(
            [
              'id',
              'owner_id',
              'name',
              'description',
              'ability1',
              'ability2',
              'ability3',
              'ability4',
              'image_url',
              'background_url',
              'bgm_url',
              'bgm_duration_seconds',
              'bgm_mime',
              'created_at',
              'updated_at',
            ].join(','),
          )
          .eq('id', heroId)
          .maybeSingle(),
      )

      if (heroError && heroError.code !== 'PGRST116') {
        throw heroError
      }

      if (!heroRow) {
        if (!mountedRef.current) return
        setState({
          loading: false,
          error: '',
          unauthorized: false,
          missingHero: true,
          hero: null,
          appearances: [],
        })
        return
      }

      if (heroRow.owner_id && heroRow.owner_id !== user.id) {
        if (!mountedRef.current) return
        setState({
          loading: false,
          error: '',
          unauthorized: false,
          missingHero: true,
          hero: null,
          appearances: [],
        })
        return
      }

      const hero = normaliseHero(heroRow)

      const {
        data: slotRows,
        error: slotsError,
      } = await withTable(supabase, 'game_slots', (table) =>
        supabase
          .from(table)
          .select('id,game_id,slot_no')
          .eq('hero_id', heroId)
          .order('id', { ascending: false })
          .limit(12),
      )

      if (slotsError && slotsError.code !== 'PGRST116') {
        throw slotsError
      }

      const gameIds = Array.from(
        new Set((slotRows || []).map((row) => row.game_id).filter(Boolean)),
      )

      let gamesById = new Map()

      if (gameIds.length) {
        const {
          data: games,
          error: gamesError,
        } = await withTable(supabase, 'games', (table) =>
          supabase
            .from(table)
            .select('id,name,cover_path,description,created_at')
            .in('id', gameIds),
        )

        if (gamesError && gamesError.code !== 'PGRST116') {
          throw gamesError
        }

        gamesById = new Map((games || []).map((row) => [row.id, row]))
      }

      const appearances = (slotRows || [])
        .map((row) => normaliseAppearance(row, gamesById))
        .filter(Boolean)

      if (!mountedRef.current) return

      setState({
        loading: false,
        error: '',
        unauthorized: false,
        missingHero: false,
        hero: {
          ...hero,
          name:
            typeof hero?.name === 'string' && hero.name.trim()
              ? hero.name.trim()
              : DEFAULT_HERO_NAME,
        },
        appearances,
      })
    } catch (error) {
      console.error('Failed to load character profile:', error)
      if (!mountedRef.current) return
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || '캐릭터 정보를 불러오지 못했습니다.',
        unauthorized: false,
        missingHero: false,
      }))
    }
  }, [heroId])

  useEffect(() => {
    load()
    return () => {
      // invalidate pending promises by bumping mountedRef when unmounted via cleanup above
    }
  }, [load])

  return {
    loading: state.loading,
    error: state.error,
    unauthorized: state.unauthorized,
    missingHero: state.missingHero,
    hero: state.hero,
    appearances: state.appearances,
    reload: load,
  }
}

