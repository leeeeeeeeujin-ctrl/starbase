// components/rank/StartClient.js
// 클라이언트 전용
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAiHistory } from '@/lib/aiHistory'
import { pickOpponents } from '@/lib/matchmaking'

// 공용 채팅: CSR만
const SharedChatDock = dynamic(() => import('@/components/common/SharedChatDock'), { ssr: false })

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

function GroupedRoster({ grouped }) {
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

export default function StartClient() {
  const router = useRouter()
  const { id: gameId } = router.query

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [preflight, setPreflight] = useState(true)

  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([]) // 평탄화된 참여자
  const [myScore, setMyScore] = useState(1000)
  const [match, setMatch] = useState({})               // role -> participants[]

  const { beginSession, push } = useAiHistory({ gameId })

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (!mounted || !gameId) return; bootstrap() }, [mounted, gameId])

  async function bootstrap() {
    setLoading(true)
    try {
      // 게임 정보
      const g = await supabase.from('rank_games').select('*').eq('id', gameId).single()
      setGame(g.data || null)

      // 참여자(히어로 조인 + owner_id 포함)
      const parts = await supabase
        .from('rank_participants')
        .select(`
          id, role, hero_id, owner_id, score, created_at,
          heroes:hero_id (id, name, image_url, description, ability1, ability2, ability3, ability4)
        `)
        .eq('game_id', gameId)
        .order('created_at', { ascending: true })

      const rows = (parts.data || []).map(p => ({
        id: p.id,
        role: p.role,
        owner_id: p.owner_id,
        hero_id: p.hero_id,
        score: p.score ?? 1000,
        ...p.heroes
      }))
      setParticipants(rows)

      // 내 점수(참여 등록된 경우)
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        const me = rows.find(r => r.owner_id === user.id)
        if (me?.score != null) setMyScore(Number(me.score))
      }
    } finally {
      setLoading(false)
    }
  }

  const groupedFromMatch = useMemo(() => {
    const arr = []
    for (const [role, members] of Object.entries(match)) {
      arr.push({
        role,
        members: members.map(m => ({
          id: m.id, role,
          ...m.heroes, // id,name,image_url,description,ability1..4
        }))
      })
    }
    return arr
  }, [match])

  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
   const roles = Array.isArray(game?.roles) ? game.roles : []
const slotsPerRole = game?.slots_per_role || Object.fromEntries(roles.map(r => [r, 1]))

const { data: { user } } = await supabase.auth.getUser()
const my = participants.find(p => p.owner_id === user?.id)
if (!my) { alert('내 참가자를 찾을 수 없습니다.'); setStarting(false); return }

const got = await pickOpponents({
  gameId,
  myHeroId: my.hero_id,
  myScore,
  roles,            // 비어 있어도 OK (함수 내에서 보완)
  slotsPerRole,
  step: 100,
  maxWindow: 1000
})
setMatch(got)

      // 세션 시작 + 오버레이 닫기 + 첫 공지
      await beginSession()
      setPreflight(false)
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
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:18 }}>{game?.name || '게임'}</div>
          <div style={{ color:'#64748b', marginTop:4 }}>{game?.description || '설명 없음'}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => router.replace(`/rank/${gameId}`)} style={{ padding:'8px 12px' }}>← 돌아가기</button>
        </div>
      </div>

      {/* 프리플라이트 */}
      {preflight && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
        }}>
          <div style={{ background:'#fff', borderRadius:12, padding:16, width:'min(920px, 92vw)', maxHeight:'80vh', overflow:'auto' }}>
            <h3 style={{ marginTop:0, marginBottom:12 }}>참여자 확인</h3>
            <GroupedRoster grouped={groupedFromMatch} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={()=>router.replace(`/rank/${gameId}`)} style={{ padding:'8px 12px' }}>← 돌아가기</button>
              <button onClick={handleStart} disabled={starting} style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}>
                {starting ? '시작 중…' : '게임 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 본게임 레이아웃 */}
      <div style={{
        display:'grid',
        gridTemplateColumns: preflight ? '1fr' : '1fr minmax(360px, 640px) 1fr',
        gap:12, transition:'all .25s ease'
      }}>
        <div>{!preflight && <GroupedRoster grouped={groupedFromMatch.slice(0, Math.ceil(groupedFromMatch.length/2))} />}</div>

     <div>
          {!preflight && (
           <SharedChatDock
              height={480}
              onUserSend={async (text) => {
                await push({ role:'user', content:text, public:true })
                const ai = `(${new Date().toLocaleTimeString()}) [AI] “${text.slice(0,40)}…” 에 대한 응답 (스텁)`
                await push({ role:'assistant', content:ai, public:true })
                return true
              }}
            />
          )}
        </div>

        <div>{!preflight && <GroupedRoster grouped={groupedFromMatch.slice(Math.ceil(groupedFromMatch.length/2))} />}</div>
      </div>
    </div>
  )
}
