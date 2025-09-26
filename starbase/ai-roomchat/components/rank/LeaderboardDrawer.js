// components/rank/LeaderboardDrawer.js
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LeaderboardDrawer({ gameId, onClose }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!gameId) return
    let alive = true
    ;(async()=>{
      const { data } = await supabase
        .from('rank_participants')
        .select(`
          id, game_id, hero_id, role, score,
          heroes ( id, name, image_url, description )
        `)
        .eq('game_id', gameId)
        .order('score', { ascending:false })
        .limit(50)
      if (!alive) return
      const mapped = (data || []).map(p => ({
        ...p,
        hero: p.heroes ? {
          id: p.heroes.id,
          name: p.heroes.name,
          image_url: p.heroes.image_url,
          description: p.heroes.description
        } : null
      }))
      setRows(mapped)
    })()
    return () => { alive = false }
  }, [gameId])

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.35)',
      display:'grid', placeItems:'end center', zIndex:1000
    }}
      onClick={onClose}
    >
      <div
        onClick={e=>e.stopPropagation()}
        style={{
          width:'min(680px, 92vw)', maxHeight:'80vh', overflow:'auto',
          borderRadius:16, background:'#fff', padding:12, boxShadow:'0 10px 30px rgba(0,0,0,0.25)'
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <b>리더보드</b>
          <button onClick={onClose} style={{ padding:'6px 10px' }}>닫기</button>
        </div>

        <ul style={{ listStyle:'none', margin:0, padding:0, display:'grid', gap:8 }}>
          {rows.map((p, idx) => (
            <li key={p.id} style={{ border:'1px solid #eef2f7', borderRadius:12, padding:10, background:'#fafafa', display:'grid', gridTemplateColumns:'32px 44px 1fr auto', gap:8, alignItems:'center' }}>
              <div data-numeric style={{ textAlign:'center', fontWeight:700 }}>{idx+1}</div>
              <div style={{ width:44, height:44, borderRadius:10, overflow:'hidden', background:'#e5e7eb' }}>
                {p.hero?.image_url && <img src={p.hero.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.hero?.name || `#${p.hero_id}`}
                </div>
                <div style={{ fontSize:12, color:'#64748b' }}>{p.role}</div>
              </div>
              <div data-numeric style={{ fontWeight:700 }}>점수 {p.score}</div>
            </li>
          ))}
          {rows.length===0 && <li style={{ color:'#64748b' }}>참여자가 없습니다.</li>}
        </ul>
      </div>
    </div>
  )
}
