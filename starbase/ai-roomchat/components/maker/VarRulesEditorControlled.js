// components/maker/VarRulesEditorControlled.js
import { useEffect, useState } from 'react'

/** 완전 제어형 에디터: 부모 value가 바뀌면 내부도 즉시 동기화 */
export default function VarRulesEditorControlled({ value = [], onChange, title = '변수 규칙' }) {
  const [list, setList] = useState(Array.isArray(value) ? value : [])

  // 부모 -> 내부 동기화 (얕은 비교로 불필요한 리셋 최소화)
  useEffect(() => {
    const v = Array.isArray(value) ? value : []
    const same = v.length === list.length && v.every((r, i) =>
      r?.name === list[i]?.name && r?.condition === list[i]?.condition
    )
    if (!same) setList(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function push(next) {
    setList(next)
    onChange?.(next)
  }
  function add() {
    push([...(list||[]), { name:'', condition:'' }])
  }
  function update(i, patch) {
    const next = list.map((r, idx) => idx===i ? { ...r, ...patch } : r)
    push(next)
  }
  function remove(i) {
    push(list.filter((_, idx) => idx!==i))
  }

  return (
    <div style={{ display:'grid', gap:8 }}>
      <div style={{ fontWeight:700 }}>{title}</div>
      {(!list || list.length===0) && <div style={{ color:'#64748b' }}>아직 규칙이 없습니다.</div>}
      {(list||[]).map((r, i) => (
        <div key={i} style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:8, display:'grid', gap:6 }}>
          <label style={{ display:'grid', gap:4 }}>
            <span style={{ fontSize:12 }}>변수명(두번째 줄에 기록될 토큰명)</span>
            <input value={r.name} onChange={e=>update(i,{name:e.target.value})} placeholder="예: critical_hit" />
          </label>
          <label style={{ display:'grid', gap:4 }}>
            <span style={{ fontSize:12 }}>만족 조건(사람이 읽는 설명 또는 간단 규칙식)</span>
            <input value={r.condition} onChange={e=>update(i,{condition:e.target.value})} placeholder="예: 마지막 2줄에 '치명타' 포함" />
          </label>
          <button onClick={()=>remove(i)} style={{ alignSelf:'start', padding:'6px 10px' }}>삭제</button>
        </div>
      ))}
      <button onClick={add} style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}>+ 규칙 추가</button>
    </div>
  )
}
