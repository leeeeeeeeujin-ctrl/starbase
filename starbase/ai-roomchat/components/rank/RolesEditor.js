// components/rank/RolesEditor.js
import { useEffect, useMemo, useRef, useState } from 'react'

function mkId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function normalizeRole(input, index) {
  if (!input || typeof input !== 'object') {
    return { id: mkId(), name: `역할${index + 1}`, score_delta_min: 20, score_delta_max: 40 }
  }
  const min = Number.isFinite(Number(input.score_delta_min)) ? Number(input.score_delta_min) : 20
  const max = Number.isFinite(Number(input.score_delta_max)) ? Number(input.score_delta_max) : 40
  return {
    id: mkId(),
    name: String(input.name ?? `역할${index + 1}`),
    score_delta_min: Math.max(0, min),
    score_delta_max: Math.max(Math.max(0, min), max),
  }
}

function shallowEqRoles(a = [], b = []) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ra = a[i] || {}
    const rb = b[i] || {}
    if (ra.name !== rb.name) return false
    if (Number(ra.score_delta_min) !== Number(rb.score_delta_min)) return false
    if (Number(ra.score_delta_max) !== Number(rb.score_delta_max)) return false
  }
  return true
}

export default function RolesEditor({ roles = [], onChange }) {
  const initial = useMemo(() => roles.map((role, index) => ({ ...normalizeRole(role, index), id: mkId() })), [roles])
  const [list, setList] = useState(initial)
  const lastEmittedRef = useRef(roles)

  useEffect(() => {
    if (shallowEqRoles(roles, lastEmittedRef.current)) return
    setList((prev) => {
      return roles.map((role, index) => {
        const base = normalizeRole(role, index)
        return { ...base, id: prev[index]?.id ?? mkId() }
      })
    })
  }, [roles])

  function emit(next) {
    const payload = next.map(({ id: _id, ...rest }) => ({
      name: String(rest.name || ''),
      score_delta_min: Number(rest.score_delta_min) || 0,
      score_delta_max: Number(rest.score_delta_max) || 0,
    }))
    lastEmittedRef.current = payload
    onChange?.(payload)
  }

  function addRole() {
    setList((prev) => {
      const next = [
        ...prev,
        {
          id: mkId(),
          name: `역할${prev.length + 1}`,
          score_delta_min: 20,
          score_delta_max: 40,
        },
      ]
      emit(next)
      return next
    })
  }

  function updateRole(id, patch) {
    setList((prev) => {
      const next = prev.map((role) => (role.id === id ? { ...role, ...patch } : role))
      emit(next)
      return next
    })
  }

  function removeRole(id) {
    setList((prev) => {
      const next = prev.filter((role) => role.id !== id)
      emit(next)
      return next
    })
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.length === 0 && <div style={{ color: '#64748b' }}>역할이 없습니다. 아래 버튼으로 추가하세요.</div>}

      {list.map((role) => (
        <div
          key={role.id}
          style={{
            display: 'grid',
            gap: 8,
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={role.name}
              onChange={(event) => updateRole(role.id, { name: event.target.value })}
              placeholder="역할 이름"
              style={{ flex: 1 }}
            />
            <button onClick={() => removeRole(role.id)} style={{ padding: '6px 10px' }}>
              삭제
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#475569' }}>
              점수 변화 최소값
              <input
                type="number"
                value={role.score_delta_min}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  const minValue = Number.isFinite(value) ? value : 0
                  const maxValue = Math.max(minValue, role.score_delta_max)
                  updateRole(role.id, { score_delta_min: minValue, score_delta_max: maxValue })
                }}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5f5' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#475569' }}>
              점수 변화 최대값
              <input
                type="number"
                value={role.score_delta_max}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  const maxValue = Number.isFinite(value) ? value : 40
                  const minValue = Math.min(role.score_delta_min, maxValue)
                  updateRole(role.id, { score_delta_max: maxValue, score_delta_min: minValue })
                }}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5f5' }}
              />
            </label>
          </div>
        </div>
      ))}

      <button
        onClick={addRole}
        style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 600 }}
      >
        + 역할 추가
      </button>
    </div>
  )
}
