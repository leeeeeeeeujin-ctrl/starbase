// components/rank/RolesEditor.js
import { useEffect, useRef, useState } from 'react'

function mkId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function shallowEqArr(a=[], b=[]) {
  if (a.length !== b.length) return false
  for (let i=0;i<a.length;i++) if (a[i] !== b[i]) return false
  return true
}

export default function RolesEditor({ roles = [], onChange }) {
  // 내부 상태: [{id,name}]
  const [list, setList] = useState(() => roles.map(name => ({ id: mkId(), name })))
  // 마지막으로 부모에 보낸 순수 이름 배열 (내부 변경에 의해 props로 재진입했는지 감지용)
  const lastEmittedRef = useRef(roles)

  // 외부(부모)에서 진짜로 바뀐 경우에만 동기화
  useEffect(() => {
    // 내가 방금 올린 값과 동일하면 무시
    if (shallowEqArr(roles, lastEmittedRef.current)) return
    // 기존 id 최대한 보존(인덱스 매칭)
    setList(prev => {
      const next = roles.map((name, i) => ({
        id: prev[i]?.id ?? mkId(),
        name,
      }))
      return next
    })
  }, [roles])

  function emit(nextObjs) {
    const names = nextObjs.map(r => r.name)
    lastEmittedRef.current = names
    onChange?.(names)
  }

  function add() {
    setList(prev => {
      const next = [...prev, { id: mkId(), name: `역할${prev.length + 1}` }]
      emit(next)
      return next
    })
  }
  function update(id, name) {
    setList(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, name } : r))
      emit(next)
      return next
    })
  }
  function remove(id) {
    setList(prev => {
      const next = prev.filter(r => r.id !== id)
      emit(next)
      return next
    })
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      {list.length === 0 && (
        <div style={{ color:'#64748b' }}>역할이 없습니다. 아래 버튼으로 추가하세요.</div>
      )}

      {list.map(r => (
        <div key={r.id} style={{ display:'flex', gap:8 }}>
          <input
            value={r.name}
            onChange={e => update(r.id, e.target.value)}
            style={{ flex:1 }}
          />
          <button onClick={() => remove(r.id)} style={{ padding:'6px 10px' }}>
            삭제
          </button>
        </div>
      ))}

      <button
        onClick={add}
        style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}
      >
        + 역할 추가
      </button>
    </div>
  )
}
