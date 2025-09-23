'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import { sanitizeVariableRules } from '../../lib/variableRules'

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), {
  ssr: false,
})

export default function MakerIndex() {
  const router = useRouter()

  const [hydrated, setHydrated] = useState(false)
  const [userId, setUserId] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return

    let active = true

    async function initialize() {
      setLoading(true)
      setErrorMessage('')

      const { data: authData } = await supabase.auth.getUser()
      if (!active) return

      const user = authData?.user
      if (!user) {
        router.replace('/')
        return
      }

      setUserId(user.id)

      try {
        const list = await fetchPromptSets(user.id)
        if (!active) return
        setRows(list)
      } catch (err) {
        if (!active) return
        setRows([])
        setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    initialize()

    return () => {
      active = false
    }
  }, [hydrated, router])

  const listHeader = useMemo(() => {
    if (loading) return '세트를 불러오는 중입니다.'
    if (rows.length === 0) return '아직 등록된 프롬프트 세트가 없습니다.'
    return `총 ${rows.length}개 세트`
  }, [loading, rows])

  if (!hydrated) {
    return null
  }

  async function refreshList(owner = userId) {
    if (!owner) return

    setLoading(true)
    setErrorMessage('')

    try {
      const list = await fetchPromptSets(owner)
      setRows(list)
    } catch (err) {
      setRows([])
      setErrorMessage(err instanceof Error ? err.message : '세트를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function createSet() {
    const { data } = await supabase.auth.getUser()
    const user = data?.user
    if (!user) {
      alert('로그인이 필요합니다.')
      return
    }

    const { data: inserted, error } = await supabase
      .from('prompt_sets')
      .insert({ name: '새 세트', owner_id: user.id })
      .select()
      .single()

    if (error || !inserted) {
      alert(error?.message || '세트를 생성하지 못했습니다.')
      return
    }

    router.push(`/maker/${inserted.id}`)
  }

  async function removeSet(id) {
    if (!confirm('세트를 삭제할까요? (프롬프트/브릿지 포함)')) {
      return
    }

    const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  function beginRename(row) {
    setEditingId(row.id)
    setEditingName(row.name ?? '')
  }

  function cancelRename() {
    setEditingId(null)
    setEditingName('')
    setSavingRename(false)
  }

  async function submitRename(event) {
    event.preventDefault()
    if (!editingId) return

    const nextName = editingName.trim()
    if (!nextName) {
      alert('세트 이름을 입력하세요.')
      return
    }

    setSavingRename(true)

    const { error } = await supabase
      .from('prompt_sets')
      .update({ name: nextName })
      .eq('id', editingId)

    setSavingRename(false)

    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.map((row) => (row.id === editingId ? { ...row, name: nextName } : row)))
    cancelRename()
  }

  async function exportSet(id) {
    const [setResult, slotsResult, bridgesResult] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', id).order('slot_no'),
      supabase.from('prompt_bridges').select('*').eq('from_set', id),
    ])

    if (setResult.error) {
      alert(setResult.error.message)
      return
    }

    if (!setResult.data) {
      alert('세트를 찾지 못했습니다.')
      return
    }

    const payload = {
      set: setResult.data,
      slots: (slotsResult.data || []).map((slot) => ({
        ...slot,
        var_rules_global: sanitizeVariableRules(slot?.var_rules_global),
        var_rules_local: sanitizeVariableRules(slot?.var_rules_local),
      })),
      bridges: bridgesResult.data || [],
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `promptset-${setResult.data.name || 'export'}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  async function importSet(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const payload = JSON.parse(text)

      const { data } = await supabase.auth.getUser()
      const user = data?.user
      if (!user) {
        alert('로그인이 필요합니다.')
        return
      }

      const { data: insertedSet, error: insertError } = await supabase
        .from('prompt_sets')
        .insert({ name: payload?.set?.name || '가져온 세트', owner_id: user.id })
        .select()
        .single()

      if (insertError || !insertedSet) {
        throw new Error(insertError?.message || '세트를 생성하지 못했습니다.')
      }

      const slotIdMap = new Map()
      const slotIndexByOldId = new Map()

      const normalizeSlotNo = (value, fallback) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value
        }
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (trimmed) {
            const parsed = Number(trimmed)
            if (Number.isFinite(parsed)) {
              return parsed
            }
          }
        }
        return fallback
      }

      const makeSlotNoKey = (value) => {
        if (value === null || value === undefined) return null
        if (typeof value === 'number' && Number.isFinite(value)) {
          return `slot_no:${value}`
        }
        if (typeof value === 'string') {
          const trimmed = value.trim()
          if (!trimmed) return null
          const parsed = Number(trimmed)
          if (Number.isFinite(parsed)) {
            return `slot_no:${parsed}`
          }
          return `slot_no:${trimmed}`
        }
        return null
      }

      const sortKeysDeep = (input) => {
        if (Array.isArray(input)) {
          return input.map((value) => sortKeysDeep(value))
        }
        if (input && typeof input === 'object') {
          return Object.keys(input)
            .sort()
            .reduce((acc, key) => {
              acc[key] = sortKeysDeep(input[key])
              return acc
            }, {})
        }
        return input
      }

      const buildFingerprint = (row) =>
        JSON.stringify(
          sortKeysDeep({
            slot_no: row.slot_no ?? null,
            slot_type: row.slot_type ?? null,
            slot_pick: row.slot_pick ?? null,
            template: row.template ?? '',
            is_start: !!row.is_start,
            invisible: !!row.invisible,
            canvas_x: row.canvas_x ?? null,
            canvas_y: row.canvas_y ?? null,
            var_rules_global: row.var_rules_global ?? null,
            var_rules_local: row.var_rules_local ?? null,
          }),
        )

      if (Array.isArray(payload?.slots) && payload.slots.length) {
        const slotEntries = payload.slots.map((slot, index) => {
          const normalizedGlobal = sanitizeVariableRules(slot?.var_rules_global ?? slot?.varRulesGlobal)
          const normalizedLocal = sanitizeVariableRules(slot?.var_rules_local ?? slot?.varRulesLocal)
          const canvasX =
            typeof slot?.canvas_x === 'number'
              ? slot.canvas_x
              : typeof slot?.position?.x === 'number'
              ? slot.position.x
              : null
          const canvasY =
            typeof slot?.canvas_y === 'number'
              ? slot.canvas_y
              : typeof slot?.position?.y === 'number'
              ? slot.position.y
              : null
          const rawSlotNo = slot?.slot_no ?? slot?.slotNo
          const slotNo = normalizeSlotNo(rawSlotNo, index + 1)
          const row = {
            set_id: insertedSet.id,
            slot_no: slotNo,
            slot_type: slot.slot_type ?? 'ai',
            slot_pick: slot.slot_pick ?? '1',
            template: slot.template ?? '',
            is_start: !!slot.is_start,
            invisible: !!slot.invisible,
            canvas_x: canvasX,
            canvas_y: canvasY,
            var_rules_global: normalizedGlobal,
            var_rules_local: normalizedLocal,
          }

          if (slot?.id !== undefined && slot?.id !== null) {
            slotIndexByOldId.set(slot.id, index)
            if (typeof slot.id === 'number' || typeof slot.id === 'string') {
              slotIndexByOldId.set(String(slot.id), index)
            }
          }

          return {
            originalSlot: slot,
            originalIndex: index,
            slotNo,
            slotNoKey: makeSlotNoKey(rawSlotNo) ?? makeSlotNoKey(slotNo),
            fingerprint: buildFingerprint(row),
            row,
          }
        })

        const { data: insertedSlots, error: slotError } = await supabase
          .from('prompt_slots')
          .insert(slotEntries.map((entry) => entry.row))
          .select()

        if (slotError) {
          throw new Error(slotError.message)
        }

        const insertedByFingerprint = new Map()
        const insertedBySlotNo = new Map()

        insertedSlots?.forEach((insertedSlot) => {
          const fingerprint = buildFingerprint({
            slot_no: insertedSlot.slot_no,
            slot_type: insertedSlot.slot_type,
            slot_pick: insertedSlot.slot_pick,
            template: insertedSlot.template,
            is_start: insertedSlot.is_start,
            invisible: insertedSlot.invisible,
            canvas_x: insertedSlot.canvas_x,
            canvas_y: insertedSlot.canvas_y,
            var_rules_global: sanitizeVariableRules(insertedSlot.var_rules_global),
            var_rules_local: sanitizeVariableRules(insertedSlot.var_rules_local),
          })
          if (fingerprint) {
            const list = insertedByFingerprint.get(fingerprint) || []
            list.push(insertedSlot)
            insertedByFingerprint.set(fingerprint, list)
          }

          const numericSlotNo = normalizeSlotNo(insertedSlot.slot_no, null)
          if (numericSlotNo != null) {
            const list = insertedBySlotNo.get(numericSlotNo) || []
            list.push(insertedSlot)
            insertedBySlotNo.set(numericSlotNo, list)
          }
        })

        slotEntries.forEach((entry) => {
          const { originalSlot, originalIndex, slotNo, slotNoKey, fingerprint } = entry
          let insertedSlot = null

          const fingerprintMatches = insertedByFingerprint.get(fingerprint)
          if (fingerprintMatches?.length) {
            insertedSlot = fingerprintMatches.shift()
          }

          if (!insertedSlot) {
            const slotNoMatches = insertedBySlotNo.get(slotNo)
            if (slotNoMatches?.length) {
              insertedSlot = slotNoMatches.shift()
            }
          }

          if (!insertedSlot) {
            return
          }

          if (originalSlot?.id) {
            slotIdMap.set(originalSlot.id, insertedSlot.id)
            if (typeof originalSlot.id === 'number' || typeof originalSlot.id === 'string') {
              slotIdMap.set(String(originalSlot.id), insertedSlot.id)
            }
          }

          if (slotNoKey) {
            slotIdMap.set(slotNoKey, insertedSlot.id)
          }

          const fallbackSlotNoKey = makeSlotNoKey(slotNo)
          if (fallbackSlotNoKey) {
            slotIdMap.set(fallbackSlotNoKey, insertedSlot.id)
          }

          slotIdMap.set(`index:${originalIndex}`, insertedSlot.id)
        })
      }

      if (Array.isArray(payload?.bridges) && payload.bridges.length) {
        const resolveByIndex = (index) => {
          if (typeof index !== 'number' || index < 0) return null
          const mappedByIndex = slotIdMap.get(`index:${index}`)
          if (mappedByIndex) {
            return mappedByIndex
          }
          const fallbackSlot = payload.slots?.[index]
          const slotNoKey = makeSlotNoKey(fallbackSlot?.slot_no ?? fallbackSlot?.slotNo)
          if (slotNoKey && slotIdMap.has(slotNoKey)) {
            return slotIdMap.get(slotNoKey)
          }
          return null
        }

        const remapSlotId = (oldId) => {
          if (!oldId) return null

          if (slotIdMap.has(oldId)) {
            return slotIdMap.get(oldId)
          }

          const normalizedKey = typeof oldId === 'string' || typeof oldId === 'number' ? String(oldId) : null
          const slotIndex =
            slotIndexByOldId.get(oldId) ?? (normalizedKey != null ? slotIndexByOldId.get(normalizedKey) : undefined)

          const mappedFromIndex = resolveByIndex(slotIndex)
          if (mappedFromIndex) {
            return mappedFromIndex
          }

          const slotNoKeyFromId = makeSlotNoKey(oldId)
          if (slotNoKeyFromId && slotIdMap.has(slotNoKeyFromId)) {
            return slotIdMap.get(slotNoKeyFromId)
          }

          if (typeof oldId === 'number') {
            const fallbackByIndex = resolveByIndex(oldId)
            if (fallbackByIndex) {
              return fallbackByIndex
            }
          }

          return null
        }

        const bridgeRows = payload.bridges.map((bridge) => ({
          from_set: insertedSet.id,
          from_slot_id: remapSlotId(bridge.from_slot_id),
          to_slot_id: remapSlotId(bridge.to_slot_id),
          trigger_words: bridge.trigger_words ?? [],
          conditions: bridge.conditions ?? [],
          priority: bridge.priority ?? 0,
          probability: bridge.probability ?? 1,
          fallback: !!bridge.fallback,
          action: bridge.action ?? 'continue',
        }))

        if (bridgeRows.length) {
          const { error: bridgeError } = await supabase.from('prompt_bridges').insert(bridgeRows)
          if (bridgeError) {
            throw new Error(bridgeError.message)
          }
        }
      }

      await refreshList(user.id)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.')
    } finally {
      event.target.value = ''
    }
  }

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/rank')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* ...생략... */}
    </div>
  )
}

async function fetchPromptSets(ownerId) {
  const { data, error } = await supabase
    .from('prompt_sets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data || []
}

function formatTimestamp(value) {
  if (!value) {
    return '기록 없음'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '기록 없음'
  }

  return date.toLocaleString()
}
