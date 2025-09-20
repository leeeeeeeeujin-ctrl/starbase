// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import SharedChatDock from '../../components/common/SharedChatDock'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'

export default function GameRoom() {
  const router = useRouter()
  const { id } = router.query

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])              // rank_games.roles(text[]) or fallback
  const [requiredSlots, setRequiredSlots] = useState(0)
  const [participants, setParticipants] = useState([]) // [{id, hero_id, role, score, hero: {name,image_url,description}}]
  const [myHero, setMyHero] = useState(null)          // 현재 접속중 캐릭터(로스터에서 고른 값/로컬 저장)
  const [myJoined, setMyJoined] = useState(false)
  const [pickRole, setPickRole] = useState('')        // 참여 시 선택할 역할
  const [showLB, setShowLB] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [starting, setStarting] = useState(false)

  // 초기 로드
  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { router.replace('/'); return }
      setUser(user)

      // 게임 기본 정보
      const { data: g } = await supabase.from('rank_games')
        .select('*').eq('id', id).single()
      if (!g) { alert('게임을 찾을 수 없습니다.'); router.replace('/rank'); return }
      setGame(g)
      setRoles(Array.isArray(g.roles) && g.roles.length ? g.roles : ['공격','수비'])

      // 활성 슬롯 수 (필요 최소 인원)
      const { data: slots } = await supabase
        .from('rank_game_slots')
        .select('slot_index,active,role')
        .eq('game_id', id)
      const req = (slots || []).filter(s => s.active && s.role).length || 0
      setRequiredSlots(req)

      // 참여자 목록 + 캐릭터 요약 join
      const { data: ps } = await supabase
        .from('rank_participants')
        .select(`
          id, game_id, hero_id, role, score, created_at,
          heroes ( id, name, image_url, description )
        `)
        .eq('game_id', id)
        .order('score', { ascending: false })
      const mapped = (ps || []).map(p => ({
        ...p,
        hero: p.heroes ? {
          id: p.heroes.id,
          name: p.heroes.name,
          image_url: p.heroes.image_url,
          description: p.heroes.description
        } : null
      }))
      setParticipants(mapped)

      // 현재 내 캐릭터(로컬 우선)
      const localHeroId = typeof window !== 'undefined' ? localStorage.getItem('selectedHeroId') : null
      if (localHeroId) {
        const { data: h } = await supabase.from('heroes')
          .select('id,name,image_url,description,owner_id')
          .eq('id', Number(localHeroId)).single()
        if (h) setMyHero(h)
      } else {
        // 없으면 내 소유 첫 캐릭터 사용
        const { data: first } = await supabase.from('heroes')
          .select('id,name,image_url,description,owner_id')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
        if (first && first.length) setMyHero(first[0])
      }

      setLoading(false)
    })()
    return () => { alive = false }
  }, [id, router])

  // 내가 이미 참여했는지
  useEffect(() => {
    if (!user || !participants.length) { setMyJoined(false); return }
    const mine = participants.some(p => p.hero && p.hero.owner_id === user.id) // 동일 소유자 기준
    setMyJoined(mine)
  }, [participants, user])

  const canStart = useMemo(() => {
    // 최소 인원 충족 여부
    return participants.length >= (requiredSlots || 0)
  }, [participants.length, requiredSlots])

  const isOwner = user && game && user.id === game.owner_id

  async function joinGame() {
    if (!myHero) return alert('참여할 캐릭터가 없습니다. (로스터에서 선택 후 다시 시도)')
    if (!pickRole && roles.length) return alert('역할을 선택하세요.')
    const payload = { game_id: Number(id), hero_id: myHero.id, role: pickRole || roles[0], score: 1000 }
    const { error } = await supabase.from('rank_participants')
      .upsert(payload, { onConflict: 'game_id,hero_id' })
    if (error) return alert('참여 실패: ' + error.message)
    // 갱신
    const { data: ps } = await supabase
      .from('rank_participants')
      .select(`
        id, game_id, hero_id, role, score, created_at,
        heroes ( id, name, image_url, description, owner_id )
      `)
      .eq('game_id', id)
      .order('score', { ascending: false })
    const mapped = (ps || []).map(p => ({
      ...p,
      hero: p.heroes ? {
        id: p.heroes.id,
        name: p.heroes.name,
        image_url: p.heroes.image_url,
        description: p.heroes.description,
        owner_id: p.heroes.owner_id
      } : null
    }))
    setParticipants(mapped)
  }

  async function startGame() {
    if (!canStart) return
    setStarting(true)
    try {
      // 여기서는 “출발선만” 확인. 실제 매치/진행 로직은 이후 엔진과 연결.
      alert('게임을 시작합니다! (엔진 연결 전: 출발선 체크 통과)')
    } finally {
      setStarting(false)
    }
  }

  async function deleteRoom() {
    if (!isOwner) return
    if (!confirm('이 게임을 삭제하시겠습니까? (참여/로그 포함)')) return
    setDeleting(true)
    try {
      // 순서: 참여/슬롯/로그 → 게임
      await supabase.from('battle_logs').delete().eq('game_id', id)
      await supabase.from('rank_participants').delete().eq('game_id', id)
      await supabase.from('rank_game_slots').delete().eq('game_id', id)
      await supabase.from('rank_games').delete().eq('id', id)
      alert('삭제 완료')
      router.replace('/rank')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:12, display:'grid', gridTemplateRows:'auto auto 1fr auto', gap:12 }}>
      {/* 상단 바 */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <button onClick={() => router.replace('/rank')} style={{ padding:'6px 10px' }}>← 목록</button>
        <h2 style={{ margin:0 }}>{game?.name}</h2>
        <span style={{ color:'#64748b' }}>{game?.description || ''}</span>
        <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>
          필요 슬롯 {requiredSlots} · 참여 {participants.length}
        </span>
      </div>

      {/* 조작 바: 참여 / 시작 / 리더보드 / 방삭제(방장) */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {!myJoined && (
          <>
            <select value={pickRole} onChange={e=>setPickRole(e.target.value)} style={{ padding:'8px 10px' }}>
              <option value="">역할 선택</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={joinGame} style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}>
              참여하기
            </button>
          </>
        )}

        <button
          onClick={startGame}
          disabled={!canStart || starting}
          title={!canStart ? '최소 인원이 모여야 시작할 수 있습니다.' : '게임 시작'}
          style={{
            padding:'8px 12px', borderRadius:8,
            background: canStart ? '#111827' : '#cbd5e1',
            color:'#fff', fontWeight:700
          }}
        >
          {starting ? '시작 중…' : '게임 시작'}
        </button>

        <button onClick={() => setShowLB(true)} style={{ padding:'8px 12px', borderRadius:8 }}>
          리더보드
        </button>

        {isOwner && (
          <button
            onClick={deleteRoom}
            disabled={deleting}
            style={{ padding:'8px 12px', borderRadius:8, background:'#ef4444', color:'#fff', marginLeft:'auto' }}
          >
            {deleting ? '삭제 중…' : '방 삭제(방장)'}
          </button>
        )}
      </div>

      {/* 본문: 참여자 타일 + 미니 정보 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, minHeight:240 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
          {participants.map(p => (
            <ParticipantCard key={p.id} p={p} />
          ))}
          {participants.length === 0 && (
            <div style={{ color:'#64748b' }}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>
          )}
        </div>
      </div>

      {/* 하단: 공용 채팅 */}
      <SharedChatDock height={260} />

      {/* 리더보드 드로어 */}
      {showLB && (
        <LeaderboardDrawer gameId={id} onClose={()=>setShowLB(false)} />
      )}
    </div>
  )
}

function ParticipantCard({ p }) {
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
          <div style={{ fontSize:12, color:'#64748b' }}>{p.role} · 점수 {p.score}</div>
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
