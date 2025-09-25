'use client'

import { supabase } from '../supabase'
import { sanitizeVariableRules } from '../variableRules'

export function sortPromptSets(rows = []) {
  const copy = Array.isArray(rows) ? rows.slice() : []
  copy.sort((a, b) => {
    const left = new Date(a?.updated_at || a?.created_at || 0).getTime()
    const right = new Date(b?.updated_at || b?.created_at || 0).getTime()
    return right - left
  })
  return copy
}

export async function fetchPromptSets(ownerId) {
  if (!ownerId) return []

  const { data, error } = await supabase
    .from('prompt_sets')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return sortPromptSets(data)
}

export async function renamePromptSet(id, nextName) {
  const trimmed = nextName.trim()
  if (!trimmed) {
    throw new Error('세트 이름을 입력하세요.')
  }

  const { error } = await supabase
    .from('prompt_sets')
    .update({ name: trimmed })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  return trimmed
}

export async function deletePromptSet(id) {
  const { error } = await supabase.from('prompt_sets').delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function createPromptSet(ownerId) {
  if (!ownerId) {
    throw new Error('로그인이 필요합니다.')
  }

  const { data: inserted, error } = await supabase
    .from('prompt_sets')
    .insert({ name: '새 세트', owner_id: ownerId })
    .select()
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || '세트를 생성하지 못했습니다.')
  }

  return inserted
}

export async function readPromptSetBundle(id) {
  const [setResult, slotsResult, bridgesResult] = await Promise.all([
    supabase.from('prompt_sets').select('*').eq('id', id).single(),
    supabase.from('prompt_slots').select('*').eq('set_id', id).order('slot_no'),
    supabase.from('prompt_bridges').select('*').eq('from_set', id),
  ])

  if (setResult.error) {
    throw new Error(setResult.error.message)
  }
  if (!setResult.data) {
    throw new Error('세트를 찾지 못했습니다.')
  }

  return {
    set: setResult.data,
    slots: (slotsResult.data || []).map((slot) => ({
      ...slot,
      var_rules_global: sanitizeVariableRules(slot?.var_rules_global),
      var_rules_local: sanitizeVariableRules(slot?.var_rules_local),
    })),
    bridges: bridgesResult.data || [],
  }
}

export async function insertPromptSetBundle(userId, payload) {
  if (!userId) {
    throw new Error('로그인이 필요합니다.')
  }

  const { data: insertedSet, error: setError } = await supabase
    .from('prompt_sets')
    .insert({ name: payload?.set?.name || '가져온 세트', owner_id: userId })
    .select()
    .single()

  if (setError || !insertedSet) {
    throw new Error(setError?.message || '세트를 생성하지 못했습니다.')
  }

  const slotIdMap = new Map()

  if (Array.isArray(payload?.slots) && payload.slots.length) {
    const slotRows = payload.slots.map((slot, index) => {
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

      const slotNo = slot.slot_no ?? slot.slotNo ?? index + 1
      const identifier = slot.id ?? slot.slot_id ?? `slot_no:${slotNo}`

      return {
        set_id: insertedSet.id,
        slot_no: slotNo,
        slot_type: slot.slot_type ?? slot.slotType ?? 'ai',
        slot_pick: slot.slot_pick ?? slot.slotPick ?? '1',
        template: slot.template ?? '',
        is_start: !!(slot.is_start ?? slot.isStart),
        invisible: !!slot.invisible,
        visible_slots: Array.isArray(slot?.visible_slots ?? slot?.visibleSlots)
          ? (slot.visible_slots ?? slot.visibleSlots)
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value))
          : [],
        canvas_x: canvasX,
        canvas_y: canvasY,
        var_rules_global: normalizedGlobal,
        var_rules_local: normalizedLocal,
        identifier,
      }
    })

    const { data: insertedSlots, error: slotError } = await supabase
      .from('prompt_slots')
      .insert(slotRows.map(({ identifier, ...rest }) => rest))
      .select()

    if (slotError) {
      throw new Error(slotError.message)
    }

    insertedSlots?.forEach((row, index) => {
      const source = slotRows[index].identifier
      slotIdMap.set(source, row.id)
      if (typeof slotRows[index].slot_no === 'number') {
        slotIdMap.set(`slot_no:${slotRows[index].slot_no}`, row.id)
      }
    })
  }

  if (Array.isArray(payload?.bridges) && payload.bridges.length) {
    const remapSlotId = (oldId) => {
      if (!oldId) return null
      if (slotIdMap.has(oldId)) {
        return slotIdMap.get(oldId)
      }
      const fallbackSlot = payload.slots?.find((slot) => slot.id === oldId)
      if (fallbackSlot?.slot_no != null) {
        return slotIdMap.get(`slot_no:${fallbackSlot.slot_no}`) ?? null
      }
      return null
    }

    const bridgeRows = payload.bridges
      .map((bridge) => ({
        from_set: insertedSet.id,
        from_slot_id: remapSlotId(bridge.from_slot_id ?? bridge.fromSlotId),
        to_slot_id: remapSlotId(bridge.to_slot_id ?? bridge.toSlotId),
        trigger_words: bridge.trigger_words ?? bridge.triggerWords ?? [],
        conditions: bridge.conditions ?? [],
        priority: bridge.priority ?? 0,
        probability: bridge.probability ?? 1,
        fallback: !!bridge.fallback,
        action: bridge.action ?? 'continue',
      }))
      .filter((row) => row.from_slot_id && row.to_slot_id)

    if (bridgeRows.length) {
      const { error: bridgeError } = await supabase.from('prompt_bridges').insert(bridgeRows)
      if (bridgeError) {
        throw new Error(bridgeError.message)
      }
    }
  }

  return insertedSet
}
