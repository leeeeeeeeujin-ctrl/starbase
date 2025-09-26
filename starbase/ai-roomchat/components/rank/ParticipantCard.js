// components/rank/ParticipantCard.js
import { useState } from 'react'

export default function ParticipantCard({ p }) {
  const [open, setOpen] = useState(false)
  const hero = p.hero
  return (
    <div style={{ border:'1px solid #eef2f7', borderRadius:12, padding:10, background:'#fafafa' }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ width:44, height:44, borderRadius:10, overflow:'hidden', background:'#e5e7eb' }}>
          {hero?.image_url && <img src={hero.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {hero?.name || `#${p.hero_id}`}
          </div>
          <div data-numeric style={{ fontSize:12, color:'#64748b' }}>{p.role} · 점수 {p.score}</div>
        </div>
        <button onClick={()=>setOpen(o=>!o)} style={{ padding:'6px 10px' }}>{open ? '접기' : '보기'}</button>
      </div>
      {open && (
        <div style={{ marginTop:8, fontSize:13, color:'#475569', whiteSpace:'pre-wrap' }}>
          {hero?.description || '설명 없음'}
        </div>
      )}
    </div>
  )
}
