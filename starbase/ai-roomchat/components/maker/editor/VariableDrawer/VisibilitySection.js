import { useMemo } from 'react'

function VisibilitySection({ visibility, onChange, onToggleInvisible, slotSuggestions = [] }) {
  const resolved = visibility || { invisible: false, visible_slots: [] }
  const isInvisible = !!resolved.invisible

  const visibleSet = useMemo(() => {
    const values = Array.isArray(resolved.visible_slots) ? resolved.visible_slots : []
    const set = new Set()
    values.forEach((value) => {
      const numeric = Number(value)
      if (Number.isFinite(numeric)) {
        set.add(numeric)
      }
    })
    return set
  }, [resolved.visible_slots])

  const slotLabelMap = useMemo(() => {
    const map = new Map()
    slotSuggestions.forEach((item) => {
      if (!item?.token) return
      const match = /^slot(\d+)$/i.exec(String(item.token))
      if (!match) return
      const numeric = Number(match[1])
      if (!Number.isFinite(numeric)) return
      map.set(numeric, item.label || `슬롯 ${numeric}`)
    })
    return map
  }, [slotSuggestions])

  const availableSlots = useMemo(() => {
    const set = new Set()
    slotLabelMap.forEach((_, key) => set.add(key))
    for (let i = 1; i <= 12; i += 1) {
      set.add(i)
    }
    return Array.from(set)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
  }, [slotLabelMap])

  const toggleSlot = (slotNo) => {
    if (typeof onChange !== 'function') return
    onChange((current) => {
      const baseList = Array.isArray(current?.visible_slots) ? current.visible_slots : []
      const nextSet = new Set(
        baseList.map((value) => Number(value)).filter((value) => Number.isFinite(value)),
      )
      if (nextSet.has(slotNo)) {
        nextSet.delete(slotNo)
      } else {
        nextSet.add(slotNo)
      }
      return {
        invisible: current?.invisible ?? true,
        visible_slots: Array.from(nextSet).sort((a, b) => a - b),
      }
    })
  }

  const selectAll = () => {
    if (typeof onChange !== 'function') return
    onChange(() => ({
      invisible: true,
      visible_slots: [...availableSlots],
    }))
  }

  const clearAll = () => {
    if (typeof onChange !== 'function') return
    onChange(() => ({
      invisible: true,
      visible_slots: [],
    }))
  }

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 16,
        display: 'grid',
        gap: 12,
        background: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: '#0f172a' }}>가시성 설정</span>
        <button
          type="button"
          onClick={() => onToggleInvisible?.()}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: '1px solid #cbd5f5',
            background: isInvisible ? '#1d4ed8' : '#e2e8f0',
            color: isInvisible ? '#fff' : '#1f2937',
            fontWeight: 600,
          }}
        >
          {isInvisible ? '숨김 해제' : '숨김 모드로 전환'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        {isInvisible
          ? '선택한 슬롯만 이 노드의 응답을 확인할 수 있습니다. 아래에서 허용할 슬롯을 골라 주세요.'
          : '현재 이 노드는 모든 슬롯에 노출됩니다. 특정 슬롯에게만 보여주고 싶다면 숨김 모드를 활성화하세요.'}
      </p>
      {isInvisible && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={selectAll}
              style={{ padding: '6px 12px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}
            >
              모두 허용
            </button>
            <button
              type="button"
              onClick={clearAll}
              style={{ padding: '6px 12px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
            >
              모두 차단
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {availableSlots.map((slotNo) => {
              const active = visibleSet.has(slotNo)
              const label = slotLabelMap.get(slotNo) || `슬롯 ${slotNo}`
              return (
                <button
                  key={slotNo}
                  type="button"
                  onClick={() => toggleSlot(slotNo)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 12,
                    border: active ? '1px solid #2563eb' : '1px solid #cbd5f5',
                    background: active ? '#dbeafe' : '#fff',
                    color: active ? '#1d4ed8' : '#1f2937',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default VisibilitySection

//
