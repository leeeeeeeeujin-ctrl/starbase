// components/rank/SlotMatrix.js
import { useEffect, useState } from 'react'

export default function SlotMatrix({ value = [], onChange, roleOptions = [] }) {
  const [slots, setSlots] = useState(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({
      slot_index: i + 1, active: false, role: ''
    }))
    value.forEach(v => {
      const idx = v.slot_index - 1
      if (base[idx]) base[idx] = v
    })
    return base
  })

  // 부모가 새 value를 내려보낼 때에만 로컬 갱신
  useEffect(() => {
    if (!value || value.length === 0) return
    setSlots(prev => {
      const base = Array.from({ length: 12 }, (_, i) => ({
        slot_index: i + 1, active: false, role: ''
      }))
      value.forEach(v => {
        const idx = v.slot_index - 1
        if (base[idx]) base[idx] = v
      })
      return base
    })
// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod
  }, [JSON.stringify(value)]) // 값이 실제로 바뀐 경우에만

  function emit(next) {
    onChange?.(next)
  }

  function toggle(idx) {
    setSlots(prev => {
      const next = prev.map((s, i) => (i === idx ? { ...s, active: !s.active } : s))
      emit(next)
      return next
    })
  }
  function setRole(idx, role) {
    setSlots(prev => {
      const next = prev.map((s, i) => (i === idx ? { ...s, role } : s))
      emit(next)
      return next
    })
  }

  const activeCount = slots.filter(s => s.active).length

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ marginBottom: 2, fontSize: 13, color: '#cbd5f5' }}>
        활성 슬롯 <span style={{ fontWeight: 700, color: '#bfdbfe' }}>{activeCount}</span> / 12
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {slots.map((s, i) => {
          const active = s.active
          return (
            <div
              key={s.slot_index}
              style={{
                display: 'grid',
                gap: 10,
                borderRadius: 16,
                padding: '14px 16px',
                border: active ? '1px solid rgba(96,165,250,0.6)' : '1px solid rgba(148,163,184,0.35)',
                background: active ? 'rgba(59,130,246,0.18)' : 'rgba(15,23,42,0.55)',
                boxShadow: active ? '0 20px 44px -36px rgba(59,130,246,0.6)' : 'none',
                transition: 'border 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
                color: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700 }}>슬롯 {s.slot_index}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: active ? '#f8fafc' : '#cbd5f5' }}>
                  <input type="checkbox" checked={s.active} onChange={() => toggle(i)} style={{ width: 16, height: 16 }} />
                  활성화
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#cbd5f5' }}>
                역할 연결
                <select
                  value={s.role}
                  onChange={e => setRole(i, e.target.value)}
                  disabled={!s.active}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(148,163,184,0.45)',
                    background: active ? 'rgba(15,23,42,0.75)' : 'rgba(15,23,42,0.45)',
                    color: '#f8fafc',
                    cursor: s.active ? 'pointer' : 'not-allowed',
                  }}
                >
                  <option value="">역할 선택</option>
                  {roleOptions.map((r, idx) => (
                    <option key={`${idx}-${r}`} value={r}>
                      {r || '역할'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
