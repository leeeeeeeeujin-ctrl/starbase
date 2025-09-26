import { useCallback, useEffect, useState } from 'react'

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

export function useHeroEditState({ heroId, onRequireAuth, onMissingHero }) {
  const [loading, setLoading] = useState(true)
  const [hero, setHero] = useState(null)
  const [edit, setEdit] = useState(EMPTY_EDIT_STATE)

  const applyHero = useCallback((data) => {
    setHero(data)
    setEdit({
      name: data?.name || '',
      description: data?.description || '',
      ability1: data?.ability1 || '',
      ability2: data?.ability2 || '',
      ability3: data?.ability3 || '',
      ability4: data?.ability4 || '',
      background_url: data?.background_url || '',
      bgm_url: data?.bgm_url || '',
    })
  }, [])

  const loadHero = useCallback(async () => {
    if (!heroId) {
      setHero(null)
      setEdit({ ...EMPTY_EDIT_STATE })
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('Failed to resolve auth session before loading hero:', authError)
      }

      if (authError || !auth?.user) {
        onRequireAuth?.()
        if (authError) {
          alert('로그인 정보를 확인할 수 없습니다. 다시 시도해 주세요.')
        }
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
    onChangeEdit: handleChangeEdit,
    onAddAbility: handleAddAbility,
    onReverseAbilities: handleReverseAbilities,
    onClearAbility: handleClearAbility,
  }
}
