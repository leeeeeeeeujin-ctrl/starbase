// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import dynamic from 'next/dynamic'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import HeroPicker from '../../components/common/HeroPicker'
import { useAiHistory } from '../../lib/aiHistory'
const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), { ssr: false })
const router = useRouter()
const { id: gameId } = router.query || {}
const GroupedRoster = dynamic(() => import('../../components/rank/GroupedRoster'), { ssr: false })
const ApiKeyBar = dynamic(() => import('../../components/common/ApiKeyBar'), { ssr: false })
if (!gameId) return null
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
  const [mounted, setMounted] = useState(false)

  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [roles, setRoles] = useState([])
  const [requiredSlots, setRequiredSlots] = useState(0)
  const [participants, setParticipants] = useState([])
  const [myHero, setMyHero] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickRole, setPickRole] = useState('')
  const [showLB, setShowLB] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [starting, setStarting] = useState(false)

  const { beginSession, push, joinedText, clear } = useAiHistory({ gameId })
  useEffect(() => { setMounted(true) }, [])
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
      // <-- 안전한 2단계 조회: participants 먼저, heroes는 in()으로 한 번에 조회하여 매핑
      const { data: ps, error: pErr } = await supabase
        .from('rank_participants')
        .select('id, game_id, hero_id, owner_id, role, score, created_at')
        .eq('game_id', id)
        .order('score', { ascending: false })
      if (pErr) {
        console.error('participants error', pErr)
        setParticipants([])
      } else {
        const heroIds = (ps ?? []).map(p => p.hero_id).filter(Boolean)
        const { data: hs } = heroIds.length
          ? await supabase
              .from('heroes')
              .select('id, name, image_url, description')
              .in('id', heroIds)
          : { data: [] }
        const hmap = new Map((hs || []).map(h => [h.id, h]))
        const mapped = (ps || []).map(p => ({
          ...p,
          hero: hmap.get(p.hero_id) || null
        }))
        setParticipants(mapped)
      }

      // ✅ 내 캐릭터는 선택 픽커/로컬스토리지 값으로만 결정
      const heroId = (typeof window !== 'undefined' && localStorage.getItem('selectedHeroId')) || null
      if (!heroId) { setMyHero(null); setLoading(false); return }
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
 const myEntry = useMemo(() => {
   if (!myHero) return null
   return participants.find(p => p.hero_id === myHero.id) || null
 }, [participants, myHero])
 const alreadyJoined = !!myEntry

  async function joinGame() {
    if (!myHero) return alert('로스터에서 캐릭터를 선택하고 다시 시도하세요.')
    if (!pickRole && roles.length) return alert('역할을 선택하세요.')
    const payload = {
      game_id: id,
      hero_id: myHero.id,
      owner_id: user.id,              // ★ 추가
      role: pickRole || roles[0],
      score: 1000
    }
    // ★ onConflict 키를 (game_id, owner_id)로 변경하여 같은 유저의 캐릭터 변경이 업데이트로 동작하게 함
 const { error } = await supabase
   .from('rank_participants')
   .insert(payload, { ignoreDuplicates: true })
    if (error) return alert('참여 실패: ' + error.message)

    // 1) 참가자(단일 테이블) — 서버에서 다시 불러와서 매핑
    const { data: ps, error: pErr } = await supabase
      .from('rank_participants')
      .select('id, game_id, hero_id, owner_id, role, score, created_at')
      .eq('game_id', id)
      .order('score', { ascending: false })
    if (pErr) { console.error('participants error', pErr); setParticipants([]); return }

    // 2) 히어로들 벌크 조회
    const heroIds = (ps ?? []).map(p => p.hero_id).filter(Boolean)
    const { data: hs } = heroIds.length
      ? await supabase
          .from('heroes')
          .select('id, name, image_url')  // 필요하면 ability/description 추가
          .in('id', heroIds)
      : { data: [] }
    const hmap = new Map((hs || []).map(h => [h.id, h]))

    // 3) 매핑
    const mapped = (ps || []).map(p => ({
      ...p,
      hero: hmap.get(p.hero_id) || null,
    }))
    setParticipants(mapped)
  }

async function startGame() {
  if (!canStart) return
  if (!myHero) return alert('캐릭터가 선택되어야 합니다.')
  setStarting(true)
  try {
    // 0) 히스토리 세션 생성
    await beginSession()

    // 1) 시스템 프롬프트 구성 (예: 게임 규칙/체크리스트)
    const systemPrompt = `게임 ${game?.name || ''}을 시작합니다.
    규칙: 공정한 파워 밸런스, 약자 배려 금지, ... (필요한 룰 넣기)`

    // 2) 시스템 프롬프트 push
    await push({ role: 'system', content: systemPrompt })
await beginSession()
+   await push({ role: 'system', content: `게임 ${game?.name ?? ''} 시작`, public: false })
    // 3) 안내 메시지
    alert('게임을 시작합니다! (히스토리 세션 연결 완료)')

    // (이후 SharedChatDock 같은 채팅 컴포넌트에서 joinedText() 활용)
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
         <button onClick={() => setPickerOpen(true)} style={{ padding:'8px 12px', borderRadius:8 }}>
     캐릭터 선택
   </button>
        <>
   <select
     value={alreadyJoined ? (myEntry?.role || '') : (pickRole || '')}
     onChange={e=>setPickRole(e.target.value)}
     disabled={alreadyJoined}
     style={{ padding:'8px 10px', opacity: alreadyJoined ? 0.6 : 1 }}
   >
     <option value="">{alreadyJoined ? '이미 참가됨' : '역할 선택'}</option>
     {roles.map(r => <option key={r} value={r}>{r}</option>)}
   </select>
   <button
     onClick={joinGame}
     disabled={!myHero || alreadyJoined}
     style={{
       padding:'8px 12px', borderRadius:8,
       background: (!myHero || alreadyJoined) ? '#cbd5e1' : '#2563eb',
       color:'#fff', fontWeight:700
     }}
     title={alreadyJoined ? '이미 이 캐릭터로 참가했습니다' : '참여하기'}
   >
     {alreadyJoined ? '참여 완료' : '참여하기'}
   </button>
 </>

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
      <MyHeroStrip hero={myHero} roleLabel={myEntry?.role} />

      {/* 본문: 참여자 카드들 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, minHeight:240 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
          {participants.map(p => <ParticipantCard key={p.id} p={p} />)}
          {participants.length === 0 && <div style={{ color:'#64748b' }}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>}
        </div>
      </div>

      {/* 하단: 공용 채팅 */}
      <SharedChatDock height={260} heroId={myHero?.id} />

      {/* 리더보드 드로어 */}
      {showLB && <LeaderboardDrawer gameId={id} onClose={()=>setShowLB(false)} />}
        {/* 캐릭터 픽커 모달 */}
  <HeroPicker
    open={pickerOpen}
    onClose={() => setPickerOpen(false)}
    onPick={(hero) => {
      try { localStorage.setItem('selectedHeroId', hero.id) } catch {}
      setMyHero(hero)
    }}
  />
    </div>
  )
}

function MyHeroStrip({ hero, roleLabel }) {
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
                    {roleLabel && (
            <div style={{ marginTop:2, fontSize:12, fontWeight:700, color:'#334155' }}>
              내 역할: {roleLabel}
            </div>
          )}
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
