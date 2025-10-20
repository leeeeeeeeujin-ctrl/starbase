'use client'

import { useEffect } from 'react'

import { supabase } from '../../../lib/supabase'
import { withTableQuery } from '../../../lib/supabaseTables'
import { analyzeVariableRuleSource, VARIABLE_RULES_VERSION } from '../../../lib/variableRules'

function buildVersionAlert(slotRows = []) {
  const details = []

  slotRows.forEach((slot, index) => {
    const slotLabel = slot?.slot_no != null ? `#${slot.slot_no}` : `#${index + 1}`

    const globalInfo = analyzeVariableRuleSource(slot?.var_rules_global)
    if (globalInfo.hadEntries && (globalInfo.legacyStructure || globalInfo.version !== VARIABLE_RULES_VERSION)) {
      const sourceLabel = globalInfo.version != null ? `v${globalInfo.version}` : '레거시'
      details.push(`${slotLabel} 전역 규칙 ${sourceLabel} → v${VARIABLE_RULES_VERSION}`)
    }

    const localInfo = analyzeVariableRuleSource(slot?.var_rules_local)
    if (localInfo.hadEntries && (localInfo.legacyStructure || localInfo.version !== VARIABLE_RULES_VERSION)) {
      const sourceLabel = localInfo.version != null ? `v${localInfo.version}` : '레거시'
      details.push(`${slotLabel} 로컬 규칙 ${sourceLabel} → v${VARIABLE_RULES_VERSION}`)
    }
  })

  if (!details.length) {
    return null
  }

  const uniqueDetails = Array.from(new Set(details))
  return {
    summary: `변수 규칙 ${uniqueDetails.length}건이 최신 버전(${VARIABLE_RULES_VERSION})과 다릅니다. 저장을 누르면 자동으로 최신 버전으로 갱신됩니다.`,
    details: uniqueDetails,
  }
}

export function useMakerEditorLoader({
  setId,
  isReady,
  router,
  setLoading,
  setSetInfo,
  loadGraph,
  onVersionDrift,
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

        const { data: setRow, error: setError } = await withTableQuery(
          supabase,
          'prompt_sets',
          (from) => from.select('*').eq('id', setId).single(),
        )

        if (!active) return

        if (setError || !setRow) {
          alert('세트를 불러오지 못했습니다.')
          router.replace('/maker')
          return
        }

        setSetInfo(setRow)

        const [{ data: slotRows }, { data: bridgeRows }] = await Promise.all([
          withTableQuery(supabase, 'prompt_slots', (from) =>
            from.select('*').eq('set_id', setId).order('slot_no', { ascending: true }),
          ),
          withTableQuery(supabase, 'prompt_bridges', (from) =>
            from.select('*').eq('from_set', setId).order('priority', { ascending: false }),
          ),
        ])

        if (!active) return

        if (typeof onVersionDrift === 'function') {
          onVersionDrift(buildVersionAlert(slotRows || []))
        }

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
  }, [setId, isReady, router, loadGraph, setLoading, setSetInfo, onVersionDrift])
}

//
