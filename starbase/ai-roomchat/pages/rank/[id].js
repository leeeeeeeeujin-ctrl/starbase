// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import SharedChatDock from '../../components/common/SharedChatDock'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'

function getSelectedHeroId(router) {
  // URL로 ?heroId= 넘겨줄 수도 있게
  const q = router?.query?.heroId
  if (q) return String(q)
  if (typeof window !== 'undefined') {
    const v = localStorage.getItem('selectedHeroId')
    return v || null
  }
  return null
}

export default function GameRoom() {
  const router = useRouter()
  const { id } = router.query

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [requiredSlots, setRequiredSlots] = useState(0)
  const [participants, setParticipants] = useState([])
  const [myHero, setMyHero] = useState(null)
  const [pickRole, setPickRole] = useState('')
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

      // 게임 정보
      const { data: g, error: gErr } = await supabase.from('rank_games').select('*').eq('id', id).single()
      if (gErr || !g) { alert('게임을 찾을 수 없습니다.'); router.replace('/rank'); return }
      setGame(g)
      setRoles(Array.isArray(g.roles) && g.roles.length ? g.roles : ['공격','수비'])

      // 필요 슬롯 = 활성화된 슬롯 수(역할 지정 포함)
      const { data: slots } = await supabase
        .from('rank_game_slots')
        .select('slot_index,active,role')
        .eq('game_id', id)
      const req = (slots || []).filter(s => s.active && s.role).length || 0
      setRequiredSlots(req)

      // 참여자 리스트(리더보드/정보용)
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

      // ✅ 내 캐릭터는 오직 로스터 선택값으로 결정
      const heroId = getSelectedHeroId(router)
      if (!heroId) {
        setMyHero(null)
        setLoading(false)
        return
      }
      const { data: h } = await supabase
        .from('heroes')
        .select('id,name,image_url,description,owner_id,ability1,ability2,ability3,ability4')
        .eq('id', heroId)
        .single()
      setMyHero(h || null)

      setLoading(false)
    })()
    return () => { alive = false }
  }, [id, router])

  const canStart = useMemo(() => {
    return participants.length >= (requiredSlots || 0)
  }, [participants.length, requiredSlots])

  const isOwner = user && game && user.id === game.owner_id
  const myJoined = useMemo(() => {
    if (!myHero) return false
    return participants.some(p => p.hero_id === myHero.id)
  }, [participants, myHero])

  async function joinGame() {
    if (!myHero) return alert('로스터에서 캐릭터를 선택하고 다시 시도하세요.')
    if (!pickRole && roles.length) return alert('역할을 선택하세요.')
    const payload = { game_id: Number(id), hero_id: myHero.id, role: pickRole || roles[0], score: 1000 }
    const { error } = await supabase.from('rank_participants').upsert(payload, { onConflict: 'game_id,hero_id' })
    if (error) return alert('참여 실패: ' + error.message)

    // 갱신
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
  }

  async function startGame() {
    if (!canStart) return
    if (!myHero) return alert('캐릭터가 선택되어야 합니다.')
    setStarting(true)
    try {
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
    <div style={{ maxWidth:1200, margin:'24px auto', padding:12, display:'grid', gridTemplateRows:'auto auto auto 1fr auto', gap:12 }}>
      {/* 상단: 방 이름 + 설명 */}
      <div style={{ display:'grid', gap:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <button onClick={() => router.replace('/rank')} style={{ padding:'6px 10px' }}>← 목록</button>
          <h2 style={{ margin:0 }}>{game?.name}</h2>
          <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>
            필요 슬롯 {requiredSlots} · 참여 {participants.length}
          </span>
        </div>
        {game?.description && <div style={{ color:'#475569' }}>{game.description}</div>}
      </div>

      {/* 조작 바: 참여 / 시작 / 리더보드 / 방삭제(방장) */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {!myJoined && (
          <>
            <select value={pickRole} onChange={e=>setPickRole(e.target.value)} style={{ padding:'8px 10px' }}>
              <option value="">역할 선택</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={joinGame}
              disabled={!myHero}
              style={{ padding:'8px 12px', borderRadius:8, background: myHero ? '#2563eb' : '#cbd5e1', color:'#fff', fontWeight:700 }}
            >
              참여하기
            </button>
          </>
        )}

        <button
          onClick={startGame}
          disabled={!canStart || !myHero || starting}
          title={!canStart ? '최소 인원이 모여야 시작할 수 있습니다.' : (!myHero ? '캐릭터가 필요합니다.' : '게임 시작')}
          style={{
            padding:'8px 12px', borderRadius:8,
            background: (canStart && myHero) ? '#111827' : '#cbd5e1',
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

      {/* 내 캐릭터(이미지 + 능력 1~4) */}
      <MyHeroStrip hero={myHero} />

      {/* 본문: 참여자 카드들 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, minHeight:240 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
          {participants.map(p => <ParticipantCard key={p.id} p={p} />)}
          {participants.length === 0 && <div style={{ color:'#64748b' }}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>}
        </div>
      </div>

      {/* 하단: 공용 채팅 */}
      <SharedChatDock height={260} />

      {/* 리더보드 드로어 */}
      {showLB && <LeaderboardDrawer gameId={id} onClose={()=>setShowLB(false)} />}
    </div>
  )
}

function MyHeroStrip({ hero }) {
  if (!hero) {
    return (
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fafafa', color:'#64748b' }}>
        로스터에서 캐릭터를 선택한 뒤 입장해야 합니다. (선택값이 없어요)
      </div>
    )
  }
  const abilities = [hero.ability1, hero.ability2, hero.ability3, hero.ability4].filter(Boolean)

  return (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ width:72, height:72, borderRadius:12, overflow:'hidden', background:'#e5e7eb', flex:'0 0 auto' }}>
          {hero.image_url && <img src={hero.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:18, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {hero.name}
          </div>
          <div style={{ color:'#64748b', marginTop:4, whiteSpace:'pre-wrap' }}>
            {hero.description || '설명 없음'}
          </div>
        </div>
      </div>

      {abilities.length > 0 && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>능력</div>
          <ul style={{ margin:0, padding:0, listStyle:'none', display:'grid', gap:6, gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))' }}>
            {abilities.map((a, idx) => (
              <li key={idx} style={{ border:'1px solid #eef2f7', borderRadius:10, padding:'8px 10px', background:'#fafafa' }}>
                <span style={{ fontWeight:700, marginRight:6 }}>#{idx+1}</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
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
