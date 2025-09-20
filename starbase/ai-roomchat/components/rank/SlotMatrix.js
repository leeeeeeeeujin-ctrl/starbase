// components/rank/SlotMatrix.js
import { useEffect, useState } from 'react'

export default function SlotMatrix({ gameId=null, value=[], onChange, roleOptions=[] }) {
  const [slots, setSlots] = useState(() => {
    const base = Array.from({length:12}, (_,i)=>({ slot_index:i+1, active:false, role:'' }))
    value.forEach(v => { const i=v.slot_index-1; if (base[i]) base[i]=v })
    return base
  })

  useEffect(() => { onChange?.(slots) }, [slots, onChange])

  function toggle(idx) {
    setSlots(arr => arr.map((s,i)=> i===idx ? { ...s, active: !s.active } : s))
  }
  function setRole(idx, role) {
    setSlots(arr => arr.map((s,i)=> i===idx ? { ...s, role } : s))
  }

  const activeCount = slots.filter(s=>s.active).length

  return (
    <div>
      <div style={{ marginBottom:6, color:'#64748b' }}>활성 슬롯: <b>{activeCount}</b> / 12</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}>
        {slots.map((s,i)=>(
          <div key={s.slot_index} style={{
            border:'1px solid #e5e7eb', borderRadius:10, padding:8,
            background: s.active ? '#eef2ff' : '#fff'
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <b>슬롯 {s.slot_index}</b>
              <label style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="checkbox" checked={s.active} onChange={()=>toggle(i)} />
                활성
              </label>
            </div>

            <label style={{ display:'grid', gap:4, marginTop:6 }}>
              <span style={{ fontSize:12, color:'#64748b' }}>역할</span>
              <select value={s.role} onChange={e=>setRole(i, e.target.value)} disabled={!s.active}>
                <option value="">선택</option>
                {roleOptions.map((r,idx)=><option key={idx} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}
