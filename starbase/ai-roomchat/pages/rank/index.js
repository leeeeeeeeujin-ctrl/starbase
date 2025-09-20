import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PromptSetPicker from '../../components/rank/PromptSetPicker'
import SlotMatrix from '../../components/rank/SlotMatrix'
import SharedChatDock from '../../components/common/SharedChatDock'
import { uploadGameImage } from '../../lib/rank/storage'

async function registerGame(payload) {
  const r = await fetch('/api/rank/register-game', {
    method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
  })
  return r.json()
}
async function playRank({ gameId, heroIds, userApiKey }) {
  const r = await fetch('/api/rank/play', {
    method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ gameId, heroIds, userApiKey })
  })
  return r.json()
}

export default function RankHub() {
  const [user, setUser] = useState(null)
  const [games, setGames] = useState([])
  const [activeGameId, setActiveGameId] = useState('')
  const [leader, setLeader] = useState([])

  // 등록 폼
  const [gName, setGName] = useState('')
  const [gDesc, setGDesc] = useState('')
  const [gImgFile, setGImgFile] = useState(null)
  const [gSetId, setGSetId] = useState('')
  const [slotMap, setSlotMap] = useState([]) // [{slot_index,active,role}]

  // 참여/플레이
  const [heroIdsCSV, setHeroIdsCSV] = useState('')
  const [userApiKey, setUserApiKey] = useState('')
  const heroIds = useMemo(()=>heroIdsCSV.split(',').map(s=>s.trim()).filter(Boolean), [heroIdsCSV])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user || null)
      await refresh()
    })()
  }, [])

  async function refresh() {
    const { data: gameRows } = await supabase.from('rank_games').select('id,name,description,created_at').order('created_at', { ascending:false })
    setGames(gameRows || [])
    if (gameRows?.length && !activeGameId) setActiveGameId(gameRows[0].id)
  }

  useEffect(() => {
    if (!activeGameId) { setLeader([]); return }
    ;(async () => {
      const { data } = await supabase
        .from('rank_participants')
        .select('owner_id, rating, battles, likes')
        .eq('game_id', activeGameId)
        .order('rating', { ascending:false })
        .limit(50)
      setLeader(data || [])
    })()
  }, [activeGameId])

  async function onCreateGame() {
    if (!user) return alert('로그인 필요')
    if (!gSetId) return alert('프롬프트 세트를 선택하세요.')
    const activeSlots = (slotMap || []).filter(s => s.active && s.role.trim())
    if (activeSlots.length === 0) return alert('최소 1개의 슬롯을 활성화하고 역할을 지정하세요.')

    let image_url = ''
    if (gImgFile) {
      try { const up = await uploadGameImage(gImgFile); image_url = up.url } catch (e) { return alert('이미지 업로드 실패: '+ (e?.message || e)) }
    }
    const res = await registerGame({
      name: gName || '새 게임',
      description: gDesc || '',
      image_url,
      prompt_set_id: gSetId,
      roles: activeSlots.map(s => ({ name: s.role, slot_count: 1 })),
    })
    if (!res.ok) return alert('게임 등록 실패: ' + (res.error || 'unknown'))
    const gameId = res.gameId

    const payload = activeSlots.map(s => ({ game_id: gameId, slot_index: s.slot_index, role: s.role, active: true }))
    if (payload.length) await supabase.from('rank_game_slots').upsert(payload, { onConflict:'game_id,slot_index' })

    setGName(''); setGDesc(''); setGImgFile(null); setGSetId(''); setSlotMap([])
    await refresh()
    setActiveGameId(gameId)
    alert('게임 등록 완료')
  }

  async function onJoin() {
    if (!user) return alert('로그인 필요')
    if (!activeGameId) return alert('게임을 선택하세요.')
    if (!heroIds.length) return alert('히어로 ID들을 입력하세요.')
    const { error } = await supabase.from('rank_participants').upsert({
      game_id: activeGameId, owner_id: user.id, hero_ids: heroIds
    }, { onConflict: 'game_id,owner_id' })
    if (error) alert(error.message); else alert('참가/팩 저장 완료')
  }

  async function onPlay() {
    if (!user) return alert('로그인 필요')
    if (!activeGameId) return alert('게임을 선택하세요.')
    if (!heroIds.length) return alert('히어로 ID들을 입력하세요.')
    if (!userApiKey) return alert('OpenAI API 키를 입력하세요.')
    const r = await playRank({ gameId: activeGameId, heroIds, userApiKey })
    if (r.error) alert(`플레이 실패: ${r.error}`); else alert(`결과: ${r.outcome} (${r.delta})`)
    const { data } = await supabase
      .from('rank_participants')
      .select('owner_id, rating, battles, likes')
      .eq('game_id', activeGameId).order('rating', { ascending:false }).limit(50)
    setLeader(data || [])
  }

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:12, display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
      {/* 상단 바 */}
      <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h2 style={{ margin:0 }}>랭킹</h2>
          <select value={activeGameId} onChange={e=>setActiveGameId(e.target.value)}>
            <option value="">게임 선택</option>
            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {activeGameId && (
            <button onClick={onJoin} title="현재 게임에 참가(내 팩 저장)" style={{ padding:'6px 10px' }}>
              참여
            </button>
          )}
        </div>

        {/* 우상단 등록 박스 */}
        <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:10, background:'#fff', width:420 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>게임 등록</div>
          <div style={{ display:'grid', gap:6 }}>
            <input placeholder="게임 이름" value={gName} onChange={e=>setGName(e.target.value)} />
            <textarea placeholder="설명" rows={2} value={gDesc} onChange={e=>setGDesc(e.target.value)} />
            <PromptSetPicker value={gSetId} onChange={setGSetId} />
            <label>이미지(선택)
              <input type="file" accept="image/*" onChange={e=>setGImgFile(e.target.files?.[0] || null)} />
            </label>
            <div>
              <div style={{ fontSize:12, color:'#475569', marginBottom:4 }}>슬롯 활성화/역할 지정</div>
              <SlotMatrix value={slotMap} onChange={setSlotMap} />
            </div>
            <button onClick={onCreateGame} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>
              등록
            </button>
          </div>
        </div>
      </div>

      {/* 중앙: 랭킹 + 우측 참여/플레이 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:12, minHeight:0 }}>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, overflow:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <h3 style={{ margin:'6px 0' }}>게임 랭킹</h3>
            <button onClick={async()=>{
              const { data } = await supabase
                .from('rank_participants')
                .select('owner_id, rating, battles, likes')
                .eq('game_id', activeGameId)
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

        <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12 }}>
          <h3 style={{ margin:'6px 0' }}>참여/플레이</h3>
          <label>Hero IDs (쉼표, 활성 슬롯 수 만큼)
            <input value={heroIdsCSV} onChange={e=>setHeroIdsCSV(e.target.value)} placeholder="uuid1, uuid2, …" style={{ width:'100%' }} />
          </label>
          <label style={{ marginTop:8 }}>OpenAI API Key
            <input value={userApiKey} onChange={e=>setUserApiKey(e.target.value)} placeholder="sk-..." style={{ width:'100%' }} />
          </label>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={onJoin} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff' }}>참가 저장</button>
            <button onClick={onPlay} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>플레이</button>
          </div>
        </div>
      </div>

      {/* 하단: 공유 채팅 */}
      <SharedChatDock height={320} />
    </div>
  )
}
