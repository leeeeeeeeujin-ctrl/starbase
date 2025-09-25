// components/common/HeroPicker.js
'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { withTable } from '@/lib/supabaseTables'

export default function HeroPicker({ open, onClose, onPick }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { onClose?.(); return }
      // 내 캐릭터들 불러오기
      const { data } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id,name,image_url,description,ability1,ability2,ability3,ability4,created_at')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
      )
      if (!alive) return
      setRows(data || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [open, onClose])

  const filtered = rows.filter(h => {
    const q = keyword.trim().toLowerCase()
    if (!q) return true
    return (h.name?.toLowerCase().includes(q) || h.description?.toLowerCase().includes(q))
  })

  function confirm() {
    if (!selectedId) return
    const hero = rows.find(r => r.id === selectedId)
    if (!hero) return
    // 로컬 저장(문자열 UUID 그대로!)
    try { localStorage.setItem('selectedHeroId', hero.id) } catch {}
    onPick?.(hero)
    onClose?.()
  }

  if (!open) return null

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
      display:'grid', placeItems:'center', zIndex:1000
    }}>
      <div style={{
        width:'min(960px, 96vw)', maxHeight:'86vh', overflow:'hidden',
        borderRadius:16, background:'#fff', boxShadow:'0 20px 50px rgba(0,0,0,.25)',
        display:'grid', gridTemplateRows:'auto auto 1fr auto'
      }}>
        {/* 헤더 */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:10 }}>
          <b style={{ fontSize:18 }}>캐릭터 선택</b>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <input
              placeholder="이름/설명 검색…"
              value={keyword}
              onChange={e=>setKeyword(e.target.value)}
              style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px', width:240 }}
            />
            <button onClick={onClose} style={{ padding:'8px 10px', borderRadius:8 }}>닫기</button>
          </div>
        </div>

        {/* 보조 안내 */}
        <div style={{ padding:'8px 16px', color:'#64748b', borderBottom:'1px solid #f1f5f9' }}>
          플레이할 캐릭터를 하나 고르세요. 아래 카드 클릭 → 파란 테두리 = 선택됨.
        </div>

        {/* 리스트 */}
        <div style={{ overflow:'auto', padding:16, background:'#fafafa' }}>
          {loading ? (
            <div style={{ padding:20 }}>불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:20, color:'#64748b' }}>캐릭터가 없습니다. 먼저 캐릭터를 만들어 주세요.</div>
          ) : (
            <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))' }}>
              {filtered.map(h => {
                const picked = selectedId === h.id
                const abilities = [h.ability1, h.ability2, h.ability3, h.ability4].filter(Boolean)
                return (
                  <button
                    key={h.id}
                    onClick={()=>setSelectedId(h.id)}
                    style={{
                      textAlign:'left',
                      border:'2px solid ' + (picked ? '#2563eb' : '#e5e7eb'),
                      background:'#fff',
                      borderRadius:14, padding:12, cursor:'pointer'
                    }}
                    title="선택"
                  >
                    <div style={{ display:'flex', gap:10 }}>
                      <div style={{ width:64, height:64, borderRadius:10, overflow:'hidden', background:'#e5e7eb', flex:'0 0 auto' }}>
                        {h.image_url && <img src={h.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>
                        <div style={{ color:'#64748b', fontSize:12, marginTop:2, height:34, overflow:'hidden' }}>
                          {h.description || '설명 없음'}
                        </div>
                      </div>
                    </div>
                    {abilities.length > 0 && (
                      <ul style={{ margin:10, marginLeft:0, padding:0, listStyle:'none', display:'grid', gap:6 }}>
                        {abilities.map((a, i) => (
                          <li key={i} style={{ fontSize:12, color:'#475569', background:'#f8fafc', border:'1px solid #eef2f7', borderRadius:8, padding:'6px 8px' }}>
                            <b style={{ marginRight:6 }}>#{i+1}</b>{a}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ padding:12, borderTop:'1px solid #e5e7eb', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} style={{ padding:'10px 14px', borderRadius:8 }}>취소</button>
          <button
            onClick={confirm}
            disabled={!selectedId}
            style={{ padding:'10px 14px', borderRadius:8, background: selectedId ? '#2563eb' : '#cbd5e1', color:'#fff', fontWeight:700 }}
          >
            캐릭터 확정
          </button>
        </div>
      </div>
    </div>
  )
}

// 
