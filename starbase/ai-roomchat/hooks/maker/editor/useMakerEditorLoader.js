'use client'

import { useEffect } from 'react'

import { supabase } from '../../../lib/supabase'

export function useMakerEditorLoader({
  setId,
  isReady,
  router,
  setLoading,
  setSetInfo,
  loadGraph,
}) {
  useEffect(() => {
    if (!setId || !isReady) return

    let active = true

    async function load() {
      setLoading(true)

      try {
        const { data: authData } = await supabase.auth.getUser()
        if (!active) return

        const user = authData?.user
        if (!user) {
          router.replace('/')
          return
        }

        const { data: setRow, error: setError } = await supabase
          .from('prompt_sets')
          .select('*')
          .eq('id', setId)
          .single()

        if (!active) return

        if (setError || !setRow) {
          alert('세트를 불러오지 못했습니다.')
          router.replace('/maker')
          return
        }

        setSetInfo(setRow)

        const [{ data: slotRows }, { data: bridgeRows }] = await Promise.all([
          supabase
            .from('prompt_slots')
            .select('*')
            .eq('set_id', setId)
            .order('slot_no', { ascending: true }),
          supabase
            .from('prompt_bridges')
            .select('*')
            .eq('from_set', setId)
            .order('priority', { ascending: false }),
        ])

        if (!active) return

        loadGraph(slotRows || [], bridgeRows || [])
      } catch (error) {
        if (!active) return
        console.error(error)
        alert('세트를 불러오지 못했습니다.')
        router.replace('/maker')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [setId, isReady, router, loadGraph, setLoading, setSetInfo])
}

//
