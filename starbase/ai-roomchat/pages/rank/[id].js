// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

async function playRank({ gameId, heroIds, userApiKey }) {
  const r = await fetch('/api/rank/play', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ gameId, heroIds, userApiKey })
  })
  return r.json()
}

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'grid', placeItems:'center', zIndex:1000 }}>
      <div style={{ width:'min(560px, 92vw)', background:'#fff', borderRadius:12, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,0.25)' }}>
        {children}
        <div style={{ textAlign:'right', marginTop:10 }}>
          <button onClick={onClose} style={{ padding:'6px 10px' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

export default function RankGameDetail() {
  const router = useRouter()
  const gameId = router.query.id

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [leader, setLeader] = useState([])
  const [slots, setSlots] = useState([]) // [{slot_index, role, active}]
  const activeCount = useMemo(()=>slots.filter(s=>s.active).length, [slots])

  // 플레이 입력
  const [apiKey, setApiKey] = useState('')
  const [heroIdsCSV, setHeroIdsCSV] = useState('')
  const heroIds = useMemo(()=>heroIdsCSV.split(',').map(s=>s.trim()).filter(Boolean), [heroIdsCSV])

  // 모달
  const [openConsent, setOpenConsent] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)

  useEffect(() => {
    if (!gameId) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setUser(user)

      const [{ data: g }, { data: s }, { data: p }] = await Promise.all([
        supabase.from('rank_games').select('*').eq('id', gameId).single(),
        supabase.from('rank_game_slots').select('*').eq('game_id', gameId).order('slot_index'),
        supabase.from('rank_participants').select('owner_id').eq('game_id', gameId).eq('owner_id', user.id).limit(1)
      ])
      setGame(g || null)
      setSlots((s||[]).map(x => ({ slot_index:x.slot_index, role:x.role, active: !!x.active })))
      setIsParticipant(!!(p && p.length))

      const { data: board } = await supabase
        .from('rank_participants')
        .select('owner_id, rating, battles, likes')
        .eq('game_id', gameId)
        .order('rating', { ascending:false })
        .limit(50)
      setLeader(board || [])

      // 로컬 저장된 히어로 id 자동 복원
      const saved = localStorage.getItem('rank.lastHeroIds')
      if (saved) setHeroIdsCSV(saved)
    })()
  }, [gameId, router])

  function wantPlay() {
    if (!isParticipant) setOpenConsent(true)
    else onPlay()
  }

  async function confirmJoin() {
    if (!user) return alert('로그인이 필요합니다.')
    if (heroIds.length !== activeCount) {
      return alert(`활성 슬롯 수(${activeCount})와 히어로 개수(${heroIds.length})가 다릅니다.`)
    }
    const { error } = await supabase.from('rank_participants').upsert({
      game_id: gameId, owner_id: user.id, hero_ids: heroIds
    }, { onConflict:'game_id,owner_id' })
    if (error) return alert(error.message)
    localStorage.setItem('rank.lastHeroIds', heroIds.join(','))
    setIsParticipant(true)
    setOpenConsent(false)
    alert('참여 등록 완료! 이제 플레이할 수 있어요.')
  }

  async function onPlay() {
    if (!apiKey) return alert('OpenAI API 키를 입력하세요.')
    if (heroIds.length !== activeCount) {
      return alert(`활성 슬롯 수(${activeCount})와 히어로 개수(${heroIds.length})가 다릅니다.`)
    }
    const r = await playRank({ gameId, heroIds, userApiKey: apiKey })
    if (r.error) return alert(`플레이 실패: ${r.error}`)
    alert(`결과: ${r.outcome} (변동 ${r.delta})`)
    const { data } = await supabase
      .from('rank_participants')
      .select('owner_id, rating, battles, likes')
      .eq('game_id', gameId).order('rating', { ascending:false }).limit(50)
    setLeader(data || [])
  }

  if (!game) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ maxWidth:1100, margin:'24px auto', padding:12, display:'grid', gap:12 }}>
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
          <button onClick={()=>router.push('/rank')} style={{ padding:'6px 10px' }}>← 랭킹</button>
          <h2 style={{ margin:0 }}>{game.name}</h2>
          <span style={{ color:'#64748b' }}>{game.description}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input placeholder="OpenAI API Key (sk-…)" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
          <button onClick={wantPlay} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>
            플레이
          </button>
        </div>
      </div>

      {/* 슬롯 요약 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12 }}>
        <b>활성 슬롯 {activeCount}개</b>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
          {slots.filter(s=>s.active).map(s=>(
            <span key={s.slot_index} style={{ border:'1px solid #e5e7eb', borderRadius:999, padding:'4px 10px', background:'#eef2ff' }}>
              #{s.slot_index} {s.role || '역할'}
            </span>
          ))}
          {activeCount===0 && <span style={{ color:'#64748b' }}>활성 슬롯 없음</span>}
        </div>

        <div style={{ marginTop:12 }}>
          <label>Hero IDs (쉼표, 활성 슬롯 수만큼)
            <input value={heroIdsCSV} onChange={e=>setHeroIdsCSV(e.target.value)} placeholder="uuid1, uuid2, …" style={{ width:'100%' }} />
          </label>
        </div>
      </div>

      {/* 리더보드 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:'6px 0' }}>리더보드</h3>
          <button onClick={async()=>{
            const { data } = await supabase
              .from('rank_participants')
              .select('owner_id, rating, battles, likes')
              .eq('game_id', gameId)
              .order('rating', { ascending:false }).limit(50)
            setLeader(data || [])
          }}>새로고침</button>
        </div>
        {leader.length===0 ? <div style={{ color:'#64748b' }}>참가자가 없습니다.</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>순위</th>
                <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Owner</th>
                <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Rating</th>
                <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Battles</th>
                <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Likes</th>
              </tr>
            </thead>
            <tbody>
              {leader.map((p,i)=>(
                <tr key={p.owner_id}>
                  <td style={{ borderBottom:'1px solid #f1f5f9', padding:'6px 4px' }}>{i+1}</td>
                  <td style={{ borderBottom:'1px solid #f1f5f9', padding:'6px 4px' }}>{p.owner_id?.slice(0,8)}…</td>
                  <td style={{ borderBottom:'1px solid #f1f5f9', padding:'6px 4px' }}>{p.rating}</td>
                  <td style={{ borderBottom:'1px solid #f1f5f9', padding:'6px 4px' }}>{p.battles}</td>
                  <td style={{ borderBottom:'1px solid #f1f5f9', padding:'6px 4px' }}>{p.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 참여 동의 모달 */}
      <Modal open={openConsent} onClose={()=>setOpenConsent(false)}>
        <h3 style={{ marginTop:0 }}>참여 동의</h3>
        <p>이 게임에 참여하여 랭크 시스템에 해당 캐릭터(들)를 등록하는 데 동의하시겠습니까?</p>
        <p style={{ color:'#64748b', marginTop:-8 }}>※ 참여 시 현재 입력한 Hero IDs가 등록됩니다.</p>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
          <button onClick={()=>setOpenConsent(false)} style={{ padding:'8px 12px' }}>취소</button>
          <button onClick={confirmJoin} style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}>확인</button>
        </div>
      </Modal>
    </div>
  )
}
