// components/rank/RolesEditor.js
import { useEffect, useState } from 'react'

function mkId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function RolesEditor({ roles = [], onChange }) {
  // roles: ["공격","수비"] 형태를 내부적으로 [{id,name}]로 관리
  const [list, setList] = useState(() =>
    roles.map(name => ({ id: mkId(), name }))
  )

  // 부모가 바꿨을 때만 로컬 업데이트 (왕복 금지)
  useEffect(() => {
    setList(roles.map(name => ({ id: mkId(), name })))
  }, [roles])

  function emit(next) {
    // 사용자 액션 시에만 부모로 내보냄
    onChange?.(next.map(r => r.name))
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
      {list.length === 0 && <div style={{ color:'#64748b' }}>역할이 없습니다. 아래 버튼으로 추가하세요.</div>}
      {list.map(r => (
        <div key={r.id} style={{ display:'flex', gap:8 }}>
          <input value={r.name} onChange={e => update(r.id, e.target.value)} style={{ flex:1 }} />
          <button onClick={() => remove(r.id)} style={{ padding:'6px 10px' }}>삭제</button>
        </div>
      ))}
      <button onClick={add} style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}>
        + 역할 추가
      </button>
    </div>
  )
}
