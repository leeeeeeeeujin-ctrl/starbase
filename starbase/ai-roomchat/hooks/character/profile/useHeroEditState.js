import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTable } from '../../../lib/supabaseTables'
import { ABILITY_KEYS } from '../../../utils/characterStats'

const EMPTY_EDIT_STATE = {
  name: '',
  description: '',
  ability1: '',
  ability2: '',
  ability3: '',
  ability4: '',
  background_url: '',
  bgm_url: '',
}

function toEditState(source) {
  if (!source) return { ...EMPTY_EDIT_STATE }
  return {
    name: source.name || '',
    description: source.description || '',
    ability1: source.ability1 || '',
    ability2: source.ability2 || '',
    ability3: source.ability3 || '',
    ability4: source.ability4 || '',
    background_url: source.background_url || '',
    bgm_url: source.bgm_url || '',
  }
}

export function useHeroEditState({ heroId, onRequireAuth, onMissingHero }) {
  const [loading, setLoading] = useState(true)
  const [hero, setHero] = useState(null)
  const [edit, setEdit] = useState(EMPTY_EDIT_STATE)
  const draftRef = useRef(edit)

  const applyHero = useCallback((data) => {
    setHero(data)
    const nextEdit = toEditState(data)
    setEdit(nextEdit)
    draftRef.current = nextEdit
  }, [])

  const loadHero = useCallback(async () => {
    if (!heroId) {
      setHero(null)
      const reset = { ...EMPTY_EDIT_STATE }
      setEdit(reset)
      draftRef.current = reset
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      let user = null

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        console.error('Failed to resolve cached Supabase session before loading hero:', sessionError)
      }

      if (sessionData?.session?.user) {
        user = sessionData.session.user
      }

      if (!user) {
        const {
          data: userData,
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          console.error('Failed to resolve auth session before loading hero:', userError)
        }

        user = userData?.user || null

        if (userError && !user) {
          alert('로그인 정보를 확인할 수 없습니다. 다시 시도해 주세요.')
        }
      }

      if (!user) {
        onRequireAuth?.()
        return
      }

      const { data, error } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select(
            'id,name,image_url,description,ability1,ability2,ability3,ability4,background_url,bgm_url,bgm_duration_seconds,bgm_mime,owner_id,created_at'
          )
          .eq('id', heroId)
          .single()
      )

      if (error || !data) {
        console.error('Failed to load hero details:', error)
        alert('캐릭터를 불러오지 못했습니다.')
        onMissingHero?.()
        return
      }

      applyHero(data)
    } catch (error) {
      console.error('Unexpected error while loading hero details:', error)
      alert('캐릭터 정보를 불러오는 중 문제가 발생했습니다.')
      onMissingHero?.()
    } finally {
      setLoading(false)
    }
  }, [applyHero, heroId, onMissingHero, onRequireAuth])

  useEffect(() => {
    loadHero()
  }, [loadHero])

  useEffect(() => {
    draftRef.current = edit
  }, [edit])

  const handleChangeEdit = useCallback((key, value) => {
    setEdit((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleAddAbility = useCallback(() => {
    let hasAvailable = false
    setEdit((prev) => {
      const nextKey = ABILITY_KEYS.find((key) => !(prev[key] && prev[key].trim()))
      if (!nextKey) {
        return prev
      }
      hasAvailable = true
      return { ...prev }
    })
    if (!hasAvailable) {
      alert('추가할 수 있는 빈 능력이 없습니다.')
    }
  }, [])

  const handleReverseAbilities = useCallback(() => {
    setEdit((prev) => {
      const values = ABILITY_KEYS.map((key) => prev[key] || '')
      const reversed = [...values].reverse()
      const next = { ...prev }
      ABILITY_KEYS.forEach((key, index) => {
        next[key] = reversed[index] || ''
      })
      return next
    })
  }, [])

  const handleClearAbility = useCallback((key) => {
    setEdit((prev) => ({ ...prev, [key]: '' }))
  }, [])

  return {
    loading,
    hero,
    edit,
    setHero,
    setEdit,
    applyHero,
    loadHero,
    getDraftSnapshot: useCallback(() => draftRef.current, []),
    resetDraft: useCallback(() => {
      const reset = draftRef.current || { ...EMPTY_EDIT_STATE }
      setEdit({ ...reset })
    }, []),
    onChangeEdit: handleChangeEdit,
    onAddAbility: handleAddAbility,
    onReverseAbilities: handleReverseAbilities,
    onClearAbility: handleClearAbility,
  }
}
