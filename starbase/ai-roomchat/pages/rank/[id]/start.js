// 파일: pages/rank/[id]/start.js
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../../lib/supabase'
import { useAiHistory } from '../../../lib/aiHistory'
import { pickOpponents } from '@/lib/matchmaking'

// SSR에서 깨지는 걸 막기 위해 채팅은 CSR 전용
const SharedChatDock = dynamic(() => import('../../../components/common/SharedChatDock'), { ssr: false })
const [match, setMatch] = useState({}) // role -> participants[]
const [myScore, setMyScore] = useState(1000) // 내 현재 점수(실제 필드로 대체)

// 간단 요약 카드
function MiniHero({ h }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'48px 1fr', gap:8, padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:8 }}>
      {h.image_url
        ? <img src={h.image_url} alt="" style={{ width:48, height:48, objectFit:'cover', borderRadius:6 }} />
        : <div style={{ width:48, height:48, background:'#eceff1', borderRadius:6 }} />}
      <div>
        <div style={{ fontWeight:700 }}>{h.name}</div>
        <div style={{ fontSize:12, color:'#64748b' }}>{h.role || '역할 없음'}</div>
      </div>
    </div>
  )
}

// 좌/우에 배치할 그룹 뷰
function GroupedRoster({ grouped, compact=false }) {
  return (
    <div style={{ display:'grid', gap:8 }}>
      {grouped.map((g, i) => (
        <div key={i} style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:10, background:'#fff' }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>{g.role || '역할'}</div>
          <div style={{ display:'grid', gap:8 }}>
            {g.members.map(m => <MiniHero key={m.id} h={m} />)}
          </div>
        </div>
      ))}
      {grouped.length===0 && <div style={{ color:'#94a3b8' }}>참여자가 없습니다.</div>}
    </div>
  )
}

export default function RankGameStart() {
  const router = useRouter()
  const { id: gameId } = router.query

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [preflight, setPreflight] = useState(true)

  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([]) // { id, hero_id, role, hero:{...} } 형태로 매핑

  // 히스토리 훅
  const { beginSession, push, joinedText } = useAiHistory({ gameId })

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (!gameId || !mounted) return; bootstrap() }, [gameId, mounted])

  async function bootstrap() {
    setLoading(true)
    try {
      // 게임 정보
      const g = await supabase.from('rank_games').select('*').eq('id', gameId).single()
      setGame(g.data || null)

      // 참여자 + 히어로 조인
      const parts = await supabase
        .from('rank_participants')
        .select('id, role, hero_id, heroes:hero_id (id, name, image_url, description, ability1, ability2, ability3, ability4)')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })

      const rows = (parts.data || []).map(p => ({
        id: p.id,
        role: p.role,
        hero_id: p.hero_id,
        ...p.heroes // 평탄화: id/name/image_url/description/ability1..4
      }))
      setParticipants(rows)
    } finally {
      setLoading(false)
    }
  }

  // 역할별 그룹
  const grouped = useMemo(() => {
    const map = new Map()
    for (const p of participants) {
      const key = p.role || '기타'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return Array.from(map.entries()).map(([role, members]) => ({ role, members }))
  }, [participants])

  async function handleStart() {
    if (starting) return
    if (!participants.length) { alert('참여자가 없습니다.'); return }
    setStarting(true)
    try {
      // 1) 활성 슬롯 구성 가져오기(예시)
   const roles = Array.isArray(game?.roles) ? game.roles : []         // 예: ["공격","수비"]
   const slotsPerRole = game?.slots_per_role || Object.fromEntries(roles.map(r => [r, 1]))
   // 2) 비슷한 점수대에서 역할별 랜덤 픽
   const myHero = participants.find(p => p.owner_id === (await supabase.auth.getUser()).data?.user?.id)
   const got = await pickOpponents({
     gameId, myHeroId: myHero?.hero_id, myScore,
     roles, slotsPerRole, step: 100, maxWindow: 1000
   })
   setMatch(got)
      await beginSession() // DB 세션 생성
      setPreflight(false)  // 레이아웃 전환

      // 시스템 안내(비공개) + 화면용 안내(공개)
      await push({ role:'system', content:`게임 "${game?.name ?? ''}" 세션 시작. 관찰자 시점/강약 판정 중심.`, public:false, turnNo:0 })
      await push({ role:'assistant', content:'전투 세션이 시작되었습니다. 메시지를 입력하면 진행합니다.', public:true })
    } finally {
      setStarting(false)
    }
  }

  if (!mounted) return null
  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ maxWidth:1200, margin:'16px auto', padding:12, display:'grid', gridTemplateRows:'auto 1fr', gap:12 }}>
      {/* 헤더: 방 이름/설명 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:18 }}>{game?.name || '게임'}</div>
          <div style={{ color:'#64748b', marginTop:4 }}>{game?.description || '설명 없음'}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => router.replace(`/rank/${gameId}`)} style={{ padding:'8px 12px' }}>← 돌아가기</button>
        </div>
      </div>

      {/* 프리플라이트(참여자 확인) 오버레이 */}
      {preflight && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
        }}>
          <div style={{ background:'#fff', borderRadius:12, padding:16, width:'min(920px, 92vw)', maxHeight:'80vh', overflow:'auto' }}>
            <h3 style={{ marginTop:0, marginBottom:12 }}>참여자 확인</h3>
            <GroupedRoster grouped={
   Object.entries(match).map(([role, members]) => ({ role, members: members.map(m => ({
     ...m.heroes, role, hero_id: m.hero_id, id: m.id
   })) }))
 } />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={()=>router.replace(`/rank/${gameId}`)} style={{ padding:'8px 12px' }}>← 돌아가기</button>
              <button onClick={handleStart} disabled={starting} style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}>
                {starting ? '시작 중…' : '게임 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 본게임 레이아웃: 좌/중앙/우 */}
      <div style={{
        display:'grid',
        gridTemplateColumns: preflight ? '1fr' : '1fr minmax(360px, 640px) 1fr',
        gap:12, transition:'all .25s ease'
      }}>
        <div>{!preflight && <GroupedRoster grouped={grouped.slice(0, Math.ceil(grouped.length/2))} />}</div>

        <div>
          {/* 중앙: 공용 채팅 + 히스토리 기록 */}
          <SharedChatDock
            height={preflight ? 320 : 480}
            onUserSend={async (text) => {
              await push({ role:'user', content:text, public:true })

              // TODO: 프롬프트 세트/브릿지 엔진 실행 → is_public:false로 push({role:'engine', ...})

              // 스텁 응답
              const ai = `(${new Date().toLocaleTimeString()}) [AI] “${text.slice(0,40)}…” 에 대한 응답 (스텁)`
              await push({ role:'assistant', content:ai, public:true })
              return true
            }}
          />
        </div>

        <div>{!preflight && <GroupedRoster grouped={grouped.slice(Math.ceil(grouped.length/2))} />}</div>
      </div>
    </div>
  )
}
