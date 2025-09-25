// pages/rank/index.js
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

async function registerGame(payload) {
  const r = await fetch('/api/rank/register-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return r.json()
}

async function playRank({ gameId, heroIds, userApiKey }) {
  const r = await fetch('/api/rank/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, heroIds, userApiKey })
  })
  return r.json()
}

export default function RankHome() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  // --- 공통 상태 ---
  const [games, setGames] = useState([])
  const [participants, setParticipants] = useState([]) // for leaderboard

  // --- 게임 등록 폼 ---
  const [gName, setGName] = useState('테스트 게임')
  const [gDesc, setGDesc] = useState('MVP 테스트용')
  const [gImage, setGImage] = useState('')
  const [gPromptSetId, setGPromptSetId] = useState('') // maker에서 만든 prompt_set_id 입력
  const [roles, setRoles] = useState([
    { name: '공격', slot_count: 2 },
    { name: '수비', slot_count: 1 },
    { name: '서포트', slot_count: 1 },
  ])
  const totalSlots = useMemo(() => roles.reduce((s, r) => s + (Number(r.slot_count) || 0), 0), [roles])

  // --- 참가 등록 폼 ---
  const [selGameId, setSelGameId] = useState('')
  const [heroIdsCSV, setHeroIdsCSV] = useState('') // 슬롯 수만큼 heroes.id 쉼표로
  const heroIds = useMemo(() => heroIdsCSV.split(',').map(s => s.trim()).filter(Boolean), [heroIdsCSV])

  // --- 플레이 폼 ---
  const [playGameId, setPlayGameId] = useState('')
  const [playHeroIdsCSV, setPlayHeroIdsCSV] = useState('')
  const [userApiKey, setUserApiKey] = useState('')
  const playHeroIds = useMemo(() => playHeroIdsCSV.split(',').map(s => s.trim()).filter(Boolean), [playHeroIdsCSV])
  const [playResult, setPlayResult] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user || null)
      await refreshLists()
    })()
  }, [])

  async function refreshLists() {
    const { data: gameRows } = await supabase
      .from('rank_games')
      .select('id,name,description,created_at')
      .order('created_at', { ascending: false })
    setGames(gameRows || [])

    // 간단 리더보드(최신 게임 기준)
    const gameId = gameRows?.[0]?.id
    if (gameId) {
      const { data: partRows } = await supabase
        .from('rank_participants')
        .select('owner_id, rating, battles, likes')
        .eq('game_id', gameId)
        .order('rating', { ascending: false })
        .limit(50)
      setParticipants(partRows || [])
      if (!selGameId) setSelGameId(gameId)
      if (!playGameId) setPlayGameId(gameId)
    }
  }

  // --- 게임 등록 ---
  async function onCreateGame() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!gPromptSetId) return alert('prompt_set_id를 입력하세요.')
    const res = await registerGame({
      name: gName, description: gDesc, image_url: gImage,
      prompt_set_id: gPromptSetId,
      roles: roles.map(r => ({ name: r.name || '역할', slot_count: Number(r.slot_count) || 1 }))
    })
    if (res.ok) {
      alert('게임 등록 완료')
      setGName('테스트 게임')
      setGDesc('MVP 테스트용')
      setGImage('')
      setGPromptSetId('')
      await refreshLists()
    } else {
      alert('등록 실패: ' + (res.error || 'unknown'))
    }
  }

  // --- 참가 등록(upsert) ---
  async function onJoin() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!selGameId) return alert('게임을 선택하세요.')
    if (!heroIds.length) return alert('히어로 ID들을 입력하세요.')
    // upsert rank_participants (game_id,owner_id unique)
    const { error } = await supabase.from('rank_participants').upsert({
      game_id: selGameId,
      owner_id: user.id,
      hero_ids: heroIds
    }, { onConflict: 'game_id,owner_id' })
    if (error) alert(error.message)
    else { alert('참가/팩 저장 완료'); await refreshLists() }
  }

  // --- 플레이 ---
  async function onPlay() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!playGameId) return alert('게임 선택')
    if (!playHeroIds.length) return alert('히어로 ID들을 입력')
    if (!userApiKey) return alert('OpenAI API 키를 입력')

    setPlayResult('요청 중…')
    const r = await playRank({ gameId: playGameId, heroIds: playHeroIds, userApiKey })
    setPlayResult(JSON.stringify(r, null, 2))
    if (r.ok) await refreshLists()
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 980, margin: '40px auto', padding: 16 }}>
        <h2>랭킹 허브</h2>
        <p>랭킹 기능을 사용하려면 로그인하세요.</p>
        <Link href="/">
          <a style={{ padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8 }}>홈으로</a>
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 12, display: 'grid', gap: 16 }}>
      <header style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'space-between' }}>
        <h2 style={{ margin:0 }}>랭킹 허브</h2>
        <div style={{ display:'flex', gap:8 }}>
          <Link href="/roster"><a style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:8 }}>로스터</a></Link>
          <Link href="/maker"><a style={{ padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:8 }}>게임 제작</a></Link>
        </div>
      </header>

      {/* 게임 등록 패널 */}
      <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <h3 style={{ margin:'4px 0' }}>게임 등록</h3>
          <div style={{ color:'#64748b' }}>슬롯 합계: <b>{totalSlots}</b></div>
        </div>
        <div style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr', alignItems:'end' }}>
          <label>이름<input value={gName} onChange={e=>setGName(e.target.value)} style={{ width:'100%' }}/></label>
          <label>이미지 URL<input value={gImage} onChange={e=>setGImage(e.target.value)} style={{ width:'100%' }}/></label>
          <label style={{ gridColumn:'1 / span 2' }}>설명<textarea value={gDesc} onChange={e=>setGDesc(e.target.value)} rows={2} style={{ width:'100%' }}/></label>
          <label style={{ gridColumn:'1 / span 2' }}>프롬프트 세트 ID<input value={gPromptSetId} onChange={e=>setGPromptSetId(e.target.value)} style={{ width:'100%' }}/></label>
        </div>

        <div style={{ marginTop:8 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>역할 / 슬롯 수</div>
          <div style={{ display:'grid', gap:6 }}>
            {roles.map((r, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr auto', gap:8 }}>
                <input value={r.name} onChange={e=>{
                  const v=[...roles]; v[i]={...v[i], name:e.target.value}; setRoles(v)
                }} placeholder="역할명" />
                <input type="number" min="1" max="12" value={r.slot_count}
                  onChange={e=>{
                    const v=[...roles]; v[i]={...v[i], slot_count: e.target.value}; setRoles(v)
                  }} />
                <button onClick={()=>{
                  const v=[...roles]; v.splice(i,1); setRoles(v)
                }}>삭제</button>
              </div>
            ))}
          </div>
          <button onClick={()=>setRoles(r=>[...r, { name:'새 역할', slot_count:1 }])} style={{ marginTop:8 }}>
            + 역할 추가
          </button>
        </div>

        <div style={{ marginTop:12 }}>
          <button onClick={onCreateGame} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>
            게임 등록
          </button>
        </div>
      </section>

      {/* 참가 등록 패널 */}
      <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12 }}>
        <h3 style={{ margin:'4px 0' }}>참가 등록(내 캐릭터 팩)</h3>
        <div style={{ display:'grid', gap:8 }}>
          <label>게임
            <select value={selGameId} onChange={e=>setSelGameId(e.target.value)} style={{ width:'100%' }}>
              <option value="">선택</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>Hero IDs (쉼표 구분, 슬롯 합계만큼)
            <input value={heroIdsCSV} onChange={e=>setHeroIdsCSV(e.target.value)} placeholder="uuid1, uuid2, ..." style={{ width:'100%' }}/>
          </label>
          <button onClick={onJoin} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff' }}>
            참가/팩 저장
          </button>
        </div>
      </section>

      {/* 플레이 패널 */}
      <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12 }}>
        <h3 style={{ margin:'4px 0' }}>플레이(테스트 호출)</h3>
        <div style={{ display:'grid', gap:8 }}>
          <label>게임
            <select value={playGameId} onChange={e=>setPlayGameId(e.target.value)} style={{ width:'100%' }}>
              <option value="">선택</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>Hero IDs (쉼표 구분, 슬롯 합계만큼)
            <input value={playHeroIdsCSV} onChange={e=>setPlayHeroIdsCSV(e.target.value)} placeholder="uuid1, uuid2, ..." style={{ width:'100%' }}/>
          </label>
          <label>OpenAI API Key
            <input value={userApiKey} onChange={e=>setUserApiKey(e.target.value)} placeholder="sk-..." style={{ width:'100%' }}/>
          </label>
          <button onClick={onPlay} style={{ padding:'8px 12px', borderRadius:8, background:'#111827', color:'#fff' }}>
            플레이
          </button>
          <pre style={{ background:'#0b1020', color:'#e0e7ff', padding:12, borderRadius:8, overflow:'auto' }}>{playResult}</pre>
        </div>
      </section>

      {/* 리더보드(최신 게임 기준) */}
      <section style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <h3 style={{ margin:'4px 0' }}>리더보드 (최신 게임)</h3>
          <button onClick={refreshLists} style={{ padding:'6px 10px' }}>새로고침</button>
        </div>
        {participants.length === 0 ? (
          <div style={{ color:'#64748b' }}>참가자가 없습니다.</div>
        ) : (
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
              {participants.map((p, i) => (
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
      </section>
    </div>
  )
}
