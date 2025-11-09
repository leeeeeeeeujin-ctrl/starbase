'use client';

import { supabase } from '../../../lib/supabase';
import { withTableQuery } from '../../../lib/supabaseTables';
import { sanitizeVariableRules } from '../../../lib/variableRules';

export async function exportSet() {
  const match = (typeof window !== 'undefined' ? window.location.pathname : '').match(
    /\/maker\/([^/]+)/
  );
  const setId = match?.[1];
  if (!setId) {
    alert('세트 ID를 파싱하지 못했습니다.');
    return;
  }

  const [setRow, slots, bridges] = await Promise.all([
    withTableQuery(supabase, 'prompt_sets', from => from.select('*').eq('id', setId).single()),
    withTableQuery(supabase, 'prompt_slots', from =>
      from.select('*').eq('set_id', setId).order('slot_no')
    ),
    withTableQuery(supabase, 'prompt_bridges', from => from.select('*').eq('from_set', setId)),
  ]);

  const payload = {
    set: setRow.data,
    slots: (slots.data || []).map(slot => ({
      ...slot,
      var_rules_global: sanitizeVariableRules(slot?.var_rules_global),
      var_rules_local: sanitizeVariableRules(slot?.var_rules_local),
    })),
    bridges: bridges.data || [],
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `promptset-${setRow.data?.name || 'export'}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export async function importSet(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }

    const { data: insertedSet, error: setError } = await withTableQuery(
      supabase,
      'prompt_sets',
      from =>
        from
          .insert({ name: payload?.set?.name || '가져온 세트', owner_id: user.id })
          .select()
          .single()
    );

    if (setError || !insertedSet) {
      throw new Error(setError?.message || '세트를 생성하지 못했습니다.');
    }

    const slotIdMap = new Map();

    if (Array.isArray(payload?.slots) && payload.slots.length) {
      const slotRows = payload.slots.map((slot, index) => {
        const normalizedGlobal = sanitizeVariableRules(
          slot?.var_rules_global ?? slot?.varRulesGlobal
        );
        const normalizedLocal = sanitizeVariableRules(slot?.var_rules_local ?? slot?.varRulesLocal);
        const canvasX =
          typeof slot?.canvas_x === 'number'
            ? slot.canvas_x
            : typeof slot?.position?.x === 'number'
              ? slot.position.x
              : null;
        const canvasY =
          typeof slot?.canvas_y === 'number'
            ? slot.canvas_y
            : typeof slot?.position?.y === 'number'
              ? slot.position.y
              : null;

        const slotNo = slot.slot_no ?? slot.slotNo ?? index + 1;
        const identifier = slot.id ?? slot.slot_id ?? `slot_no:${slotNo}`;

        return {
          set_id: insertedSet.id,
          slot_no: slotNo,
          slot_type: slot.slot_type ?? slot.slotType ?? 'ai',
          slot_pick: slot.slot_pick ?? slot.slotPick ?? '1',
          template: slot.template ?? '',
          is_start: !!(slot.is_start ?? slot.isStart),
          invisible: !!slot.invisible,
          visible_slots: slot.visible_slots ?? slot.visibleSlots ?? null,
          var_rules_global: normalizedGlobal,
          var_rules_local: normalizedLocal,
          canvas_x: canvasX,
          canvas_y: canvasY,
          identifier,
        };
      });

      const { data: insertedSlots, error: slotError } = await withTableQuery(
        supabase,
        'prompt_slots',
        from => from.insert(slotRows.map(({ identifier, ...rest }) => rest)).select()
      );

      if (slotError) {
        throw new Error(slotError.message);
      }

      insertedSlots.forEach((row, index) => {
        const source = slotRows[index].identifier;
        slotIdMap.set(source, row.id);
        if (typeof slotRows[index].slot_no === 'number') {
          slotIdMap.set(`slot_no:${slotRows[index].slot_no}`, row.id);
        }
      });
    }

    if (Array.isArray(payload?.bridges) && payload.bridges.length) {
      const remapSlotId = oldId => {
        if (!oldId) return null;
        if (slotIdMap.has(oldId)) {
          return slotIdMap.get(oldId);
        }
        const fallbackSlot = payload.slots?.find(slot => slot.id === oldId);
        if (fallbackSlot?.slot_no != null) {
          return slotIdMap.get(`slot_no:${fallbackSlot.slot_no}`) ?? null;
        }
        return null;
      };

      const bridgeRows = payload.bridges
        .map(bridge => ({
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
        .filter(row => row.from_slot_id && row.to_slot_id);

      if (bridgeRows.length) {
        const { error: bridgeError } = await withTableQuery(supabase, 'prompt_bridges', from =>
          from.insert(bridgeRows)
        );
        if (bridgeError) {
          throw new Error(bridgeError.message);
        }
      }
    }

    window.location.assign(`/maker/${insertedSet.id}`);
  } catch (err) {
    console.error(err);
    alert(err instanceof Error ? err.message : 'JSON을 불러오지 못했습니다.');
  } finally {
    event.target.value = '';
  }
}

//
