// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import LeaderboardDrawer from '../../components/rank/LeaderboardDrawer'
import HeroPicker from '../../components/common/HeroPicker'
import { useAiHistory } from '../../lib/aiHistory'
import MyHeroStrip from '../../components/rank/MyHeroStrip'
import ParticipantCard from '../../components/rank/ParticipantCard'
import HistoryPanel from '../../components/rank/HistoryPanel'

// 브라우저 전용
const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), { ssr: false })

export default function GameRoom() {
  const router = useRouter()
  const { id } = router.query

  // ✅ 훅은 항상 같은 순서로!
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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
  const [preflight, setPreflight] = useState(true)

  // 히스토리 훅(미리 호출해두고, 렌더에서만 가드)
  const { beginSession, push, joinedText } = useAiHistory({ gameId: id })

  // 준비 플래그(렌더만 가드)
  const ready = mounted && !!id

  // 초기 로드
  useEffect(() => {
    if (!ready) return
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

      // 슬롯 요구 수
      const { data: slots } = await supabase
        .from('rank_game_slots')
        .select('slot_index,active,role')
        .eq('game_id', id)
      const req = (slots || []).filter(s => s.active && s.role).length || 0
      setRequiredSlots(req)

      // 참가자 + 히어로 매핑
      const { data: ps } = await supabase
        .from('rank_participants')
        .select('id, game_id, hero_id, owner_id, role, score, created_at')
        .eq('game_id', id)
        .order('score', { ascending: false })

      const heroIds = (ps ?? []).map(p => p.hero_id).filter(Boolean)
      const { data: hs } = heroIds.length
        ? await supabase
            .from('heroes')
            .select('id, name, image_url, description, ability1, ability2, ability3, ability4')
            .in('id', heroIds)
        : { data: [] }
      const hmap = new Map((hs || []).map(h => [h.id, h]))
      setParticipants((ps || []).map(p => ({ ...p, hero: hmap.get(p.hero_id) || null })))

      // 내 캐릭터(로컬)
      const heroId = (typeof window !== 'undefined' && localStorage.getItem('selectedHeroId')) || null
      if (heroId) {
        const { data: h } = await supabase
          .from('heroes')
          .select('id,name,image_url,description,owner_id,ability1,ability2,ability3,ability4')
          .eq('id', heroId)
          .single()
        setMyHero(h || null)
      } else {
        setMyHero(null)
      }

      setLoading(false)
    })()
    return () => { alive = false }
  }, [ready, id, router])

  const canStart = useMemo(() => participants.length >= (requiredSlots || 0), [participants.length, requiredSlots])
  const isOwner = user && game && user.id === game.owner_id
  const myEntry = useMemo(() => (myHero ? participants.find(p => p.hero_id === myHero.id) || null : null), [participants, myHero])
  const alreadyJoined = !!myEntry

  async function joinGame() {
    if (!myHero) return alert('로스터에서 캐릭터를 선택하고 다시 시도하세요.')
    if (!pickRole && roles.length) return alert('역할을 선택하세요.')
    const payload = {
      game_id: id,
      hero_id: myHero.id,
      owner_id: user.id,
      role: pickRole || roles[0],
      score: 1000
    }
    const { error } = await supabase.from('rank_participants').insert(payload, { ignoreDuplicates: true })
    if (error) return alert('참여 실패: ' + error.message)

    // 리프레시
    const { data: ps } = await supabase
      .from('rank_participants')
      .select('id, game_id, hero_id, owner_id, role, score, created_at')
      .eq('game_id', id)
      .order('score', { ascending: false })
    const heroIds = (ps ?? []).map(p => p.hero_id).filter(Boolean)
    const { data: hs } = heroIds.length
      ? await supabase
          .from('heroes')
          .select('id,name,image_url,description,ability1,ability2,ability3,ability4')
          .in('id', heroIds)
      : { data: [] }
    const hmap = new Map((hs || []).map(h => [h.id, h]))
    setParticipants((ps || []).map(p => ({ ...p, hero: hmap.get(p.hero_id) || null })))
  }

async function startGame() {
  if (!canStart) return
  if (!myHero) return alert('캐릭터가 선택되어야 합니다.')
  setStarting(true)
  try {
    // 1) 세션 시작
    await beginSession()

    // 2) 프리플라이트 닫기(레이아웃 전환)
    setPreflight(false)

    // 3) 시스템 프롬프트(비공개) + 시작 알림(공개)
    await push({
      role: 'system',
      content: `게임 ${game?.name ?? ''} 시작. 제3자 관찰자 시점, 강약 중심, 체크리스트 준수.`,
      public: false,
      turnNo: 0  // 시스템은 0으로 표기(선택)
    })
    await push({
      role: 'assistant',
      content: '전투 세션이 시작되었습니다. 준비가 되면 메시지를 입력하세요.',
      public: true  // 중앙 채팅에 보이게
      // turn_no는 자동 증가
    })
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

  // ✅ 훅은 이미 다 호출됨. 아래는 “렌더 가드”만.
  if (!ready || loading) {
    return <div style={{ padding:20 }}>불러오는 중…</div>
  }

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

      {/* 조작 바 */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={() => setPickerOpen(true)} style={{ padding:'8px 12px', borderRadius:8 }}>캐릭터 선택</button>

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
            style={{ padding:'8px 12px', borderRadius:8, background: (!myHero || alreadyJoined) ? '#cbd5e1' : '#2563eb', color:'#fff', fontWeight:700 }}
            title={alreadyJoined ? '이미 이 캐릭터로 참가했습니다' : '참여하기'}
          >
            {alreadyJoined ? '참여 완료' : '참여하기'}
          </button>
        </>

        <button
          onClick={startGame}
          disabled={!canStart || !myHero || starting}
          title={!canStart ? '최소 인원이 모여야 시작할 수 있습니다.' : (!myHero ? '캐릭터가 필요합니다.' : '게임 시작')}
          style={{ padding:'8px 12px', borderRadius:8, background: (canStart && myHero) ? '#111827' : '#cbd5e1', color:'#fff', fontWeight:700 }}
        >
          {starting ? '시작 중…' : '게임 시작'}
        </button>

        <button onClick={() => setShowLB(true)} style={{ padding:'8px 12px', borderRadius:8 }}>리더보드</button>

        {isOwner && (
          <button onClick={deleteRoom} disabled={deleting} style={{ padding:'8px 12px', borderRadius:8, background:'#ef4444', color:'#fff', marginLeft:'auto' }}>
            {deleting ? '삭제 중…' : '방 삭제(방장)'}
          </button>
        )}
      </div>

      {/* 내 캐릭터 */}
      <MyHeroStrip hero={myHero} roleLabel={myEntry?.role} />

      {/* 본문: 참여자 카드들 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12, minHeight:240 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
          {participants.map(p => <ParticipantCard key={p.id} p={p} />)}
          {participants.length === 0 && <div style={{ color:'#64748b' }}>아직 참여자가 없습니다. 먼저 참여해보세요.</div>}
        </div>
      </div>

      {/* 히스토리(공개 로그만) + 하단 공용 채팅 */}
      <HistoryPanel text={joinedText({ onlyPublic:true, last:20 })} />
      <SharedChatDock
  height={260}
  heroId={myHero?.id}
  onUserSend={async (text) => {
    // 1) 유저 발화 → 공개 로그로 저장
    await push({ role: 'user', content: text, public: true })

    // 2) (선택) 프롬프트 세트 자동주입/브릿지 처리는 비공개 로그로 남길 수 있음
    // await push({ role: 'engine', content: compiledPrompt, public: false })

    // 3) 모델 응답(지금은 스텁)
    const ai = `(${new Date().toLocaleTimeString()}) [AI] “${text.slice(0,40)}…” 에 대한 응답 (스텁)`
    await push({ role: 'assistant', content: ai, public: true })
    return true
  }}
/>


      {/* 리더보드 드로어 */}
      {showLB && <LeaderboardDrawer gameId={id} onClose={()=>setShowLB(false)} />}

      {/* 캐릭터 픽커 */}
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
