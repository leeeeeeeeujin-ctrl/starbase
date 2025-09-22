'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAiHistory } from '@/lib/aiHistory'
import { parseOutcome } from '@/lib/outcome'
import { pickSubstitute } from '@/lib/substitute'
import { runOneTurn } from '@/lib/engineRunner'
import { makeCallModel } from '@/lib/modelClient'
import { ChevronUp, ChevronDown } from '@/components/common/SharedChatDock'
import SharedChatDock from '@/components/common/SharedChatDock'

const [histOpen, setHistOpen] = useState(false)
const [userTurn, setUserTurn] = useState(false)
const [dockOpen, setDockOpen] = useState(false)

/** 상단: API Key 입력 */
function ApiKeyBar({ storageKey }){
  const [val, setVal] = useState('')
  useEffect(()=>{ setVal(localStorage.getItem(storageKey)||'') },[storageKey])
  return (
    <div style={{display:'flex',gap:8,alignItems:'center'}}>
      <input
        value={val}
        onChange={e=>{
          setVal(e.target.value)
          localStorage.setItem(storageKey, e.target.value)
        }}
        placeholder="OpenAI API Key"
        style={{flex:1, padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8}}
      />
    </div>
  )
}
// 역할별 풀 로드
async function fetchRoleBuckets(gameId) {
  const { data, error } = await supabase
    .from('rank_participants')
    .select(`
      hero_id, role, score,
      heroes:heroes ( id, name, image_url, ability1, ability2, ability3, ability4 )
    `)
    .eq('game_id', gameId)
  if (error) throw error
  const byRole = new Map()
  ;(data || []).forEach(p => {
    if (!byRole.has(p.role)) byRole.set(p.role, [])
    byRole.get(p.role).push(p)
  })
  return byRole
}

// 점수창(±step → 최대 ±maxWindow) 넓혀가며 need명 뽑기
function pickByScoreWindow(list = [], center = 1000, step = 100, maxWindow = 1000, need = 1) {
  const pool = list.slice()
  const picked = []
  for (let w = step; w <= maxWindow && picked.length < need; w += step) {
    const low = center - w, high = center + w
    const cand = pool.filter(p => {
      const s = p.score ?? 1000
      return s >= low && s <= high
    })
    while (cand.length && picked.length < need) {
      const idx = Math.floor(Math.random() * cand.length)
      picked.push(cand.splice(idx, 1)[0])
    }
  }
  // 그래도 부족하면 점수 무시하고 랜덤
  while (pool.length && picked.length < need) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked
}

// 좌우 패널용 그룹 만들기
function toGroupedByRole(rows = []) {
  const m = new Map()
  rows.forEach(p => {
    if (!m.has(p.role)) m.set(p.role, [])
    m.get(p.role).push(p)
  })
  return Array.from(m, ([role, members]) => ({ role, members }))
}

/** 좌/우 패널: 역할별 캐릭터 카드 */
function GroupedRoster({ grouped = [], compact }){
  return (
    <div style={{ display:'grid', gap:8 }}>
      {grouped.map(g => (
        <div key={g.role} style={{ border:'1px solid #e5e7eb', borderRadius:10, padding:10 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>{g.role}</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
            {g.members.map(m => (
              <div key={m.hero_id} style={{ border:'1px solid #eee', borderRadius:8, padding:8 }}>
                {m.heroes?.image_url
                  ? <img src={m.heroes.image_url} alt=""
                         style={{ width:'100%', aspectRatio:'1/1', objectFit:'cover', borderRadius:6 }} />
                  : <div style={{ background:'#f1f5f9', height:120, borderRadius:6 }} />
                }
                <div style={{ fontWeight:600, marginTop:6 }}>{m.heroes?.name || '이름없음'}</div>
                <ul style={{ paddingLeft:16, margin:0, color:'#64748b', fontSize:12 }}>
                  {[1,2,3,4].map(i => m.heroes?.[`ability${i}`]
                    ? <li key={i}>{m.heroes[`ability${i}`]}</li>
                    : null)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StartClient(){
  const router = useRouter()
  const gameId = router.query.id

  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([]) // [{hero_id, role, heroes:{...}}]
  const [grouped, setGrouped] = useState([])
  const [preflight, setPreflight] = useState(true)
  const [starting, setStarting] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [currentSlotId, setCurrentSlotId] = useState(null)
  const [usedHeroIds, setUsedHeroIds] = useState(new Set())

  const history = useAiHistory()
  const callModel = useMemo(
    () => makeCallModel({ getKey: () => localStorage.getItem('OPENAI_API_KEY') }),
    []
  )

  // 초기 로드: 게임/참가자/그룹 + 진행중 세션 이어붙이기
  useEffect(() => { (async () => {
    if (!gameId) return
    const { data: g } = await supabase.from('rank_games').select('*').eq('id', gameId).single()
    setGame(g || null)

    const { data: rows } = await supabase
      .from('rank_participants')
      .select('hero_id, role, heroes:heroes(id,name,description,image_url,ability1,ability2,ability3,ability4)')
      .eq('game_id', gameId)
    setParticipants(rows || [])

    const byRole = new Map()
    ;(rows||[]).forEach(p => {
      if (!byRole.has(p.role)) byRole.set(p.role, [])
      byRole.get(p.role).push(p)
    })
    setGrouped(Array.from(byRole, ([role, members]) => ({ role, members })))

    // 이어하기
    const { data: sess } = await supabase
      .from('rank_sessions').select('id,status')
      .eq('game_id', gameId)
      .order('created_at', { ascending:false })
      .limit(1)
    if (sess?.length && sess[0].status === 'active') {
      setSessionId(sess[0].id)
      setPreflight(false)
      const { data: turns } = await supabase
        .from('rank_turns')
        .select('idx, role, content, public')
        .eq('session_id', sess[0].id)
        .order('idx', { ascending:true })
      await history.beginSession({ sessionId: sess[0].id, seed: turns || [] })
      setTurnIndex((turns||[]).length)
    }
  })() }, [gameId])

  // 체크리스트/규칙 기반 시스템 프롬프트
function buildSystemPromptFromChecklist(game){
  const lines = []
  if (game?.rules?.length) lines.push(game.rules)

  // 고정 규칙 (요약)
  lines.push(
    '규칙:',
    '- 프롬프트 세트에 따른 진행. 전투불능은 패배가 아닌 탈락처리.',
    '- 모델 응답의 마지막 한 줄에는 정확히 \"[캐릭터이름] (승|패|탈락)\" 만 기입.',
    '- 마지막 줄을 제외한 직전 5줄은 공백 유지.',
    '- 탈락 캐릭터 호출 시 동일 역할의 다른 캐릭터(무작위)로 대체.'
  )
  return lines.join('\n')
}


  // 세션 시작
async function handleStart() {
  if (starting) return
  setStarting(true)
  try {
    // 1) 세션 준비
    let sid = sessionId
    if (!sid) {
      const { data: srow, error: sErr } = await supabase
        .from('rank_sessions')
        .insert({ game_id: gameId })
        .select()
        .single()
      if (sErr) throw sErr
      sid = srow.id
      setSessionId(sid)
    }

    await history.beginSession({ sessionId: sid })
    await history.push({
      role: 'system',
      content: buildSystemPromptFromChecklist(game),
      public: false
    })

    // 2) ⬇︎ 여기서부터 역할군별 비슷한 점수 랜덤 매칭
    const roles = Array.isArray(game?.roles) ? game.roles : []
    const slotsPerRole = game?.slots_per_role || Object.fromEntries(roles.map(r => [r, 1]))

    // 내 점수(없으면 1000)
    const { data: { user } } = await supabase.auth.getUser()
    const myRow = (participants || []).find(p => p.owner_id === user?.id)
    const myScore = myRow?.score ?? 1000

    // 게임 전체 참가자에서 역할별 풀 구성
    const buckets = await fetchRoleBuckets(gameId)

    // 역할별로 필요한 슬롯 수만큼 뽑기
    const chosen = []
    for (const role of roles) {
      const pool = (buckets.get(role) || []).slice()
      const need = Math.max(1, Number(slotsPerRole[role] || 1))
      const got = pickByScoreWindow(pool, myScore, 100, 1000, need)
      chosen.push(...got.map(g => ({ ...g, role })))
    }

    // 같은 히어로 중복 제거
    const uniq = []
    const seen = new Set()
    for (const p of chosen) {
      if (seen.has(p.hero_id)) continue
      seen.add(p.hero_id)
      uniq.push(p)
    }

    // 화면 상태 반영
    setParticipants(uniq)                 // 중앙 엔진에서 참조
    setGrouped(toGroupedByRole(uniq))     // 좌/우 패널에서 사용

    // 3) 프리플라이트 닫기 → 본 화면 전개
    setPreflight(false)
  } catch (e) {
    console.error(e)
    alert(e.message || '시작 실패')
  } finally {
    setStarting(false)
  }
}


  function buildSlotsFromParticipants(list){
    const out = {}
    list.forEach((p, idx) => {
      const s = idx + 1
      out[`slot${s}`] = {
        name: p.heroes?.name || '',
        description: p.heroes?.description || '',
        ...Object.fromEntries(
          Array.from({length:12},(_,i)=>[`ability${i+1}`, p.heroes?.[`ability${i+1}`] || ''])
        )
      }
    })
    return out
  }

  return (
    <div style={{ maxWidth:1280, margin:'16px auto', padding:12, display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
      {/* 상단: API Key 바 */}
      <ApiKeyBar storageKey="OPENAI_API_KEY" />

      {/* 시작 전 오버레이 */}
      {preflight && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
        }}>
          <div style={{ background:'#fff', borderRadius:12, padding:16, width:'min(920px,92vw)', maxHeight:'80vh', overflow:'auto' }}>
            <h3 style={{ marginTop:0 }}>참여자 확인</h3>
            <GroupedRoster grouped={grouped} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={()=>router.replace(`/rank/${gameId}`)}>← 돌아가기</button>
              <button
                onClick={handleStart}
                disabled={starting}
                style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}
              >
                {starting ? '시작 중…' : '게임 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 본문: 좌/중앙/우 */}
      <div style={{
        display:'grid',
        gridTemplateColumns: preflight ? '1fr' : '1fr minmax(360px, 640px) 1fr',
        gap:12, transition:'all .25s ease'
      }}>
        <div>
          {!preflight && <GroupedRoster grouped={grouped.slice(0, Math.ceil(grouped.length/2))} compact />}
        </div>
{/* === 상단 히스토리 바 === */}
<div style={{ position:'sticky', top:0, zIndex:45 }}>
  <div style={{ background:'#111827', color:'#fff', padding:'8px 12px',
                display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:8 }}>
    <b>세션 히스토리</b>
    <button onClick={()=>setHistOpen(o=>!o)}
            style={{ background:'transparent', color:'#fff', border:'0', fontWeight:700 }}>
      {histOpen ? '접기' : '펼치기'}
    </button>
  </div>
  {histOpen && (
    <div style={{ background:'#0f172a', color:'#e2e8f0', padding:'10px 12px', borderRadius:8, marginTop:6, maxHeight:240, overflow:'auto' }}>
      {(history.data || []).map((t,i)=>(
        <div key={i} style={{ opacity: t.public ? 1 : .7 }}>
          <span style={{ fontWeight:700 }}>{t.role.toUpperCase()}:</span> {t.content}
        </div>
      ))}
    </div>
  )}
</div>
{/* 중앙: 게임세션 채팅(유저입력 비활성, '다음'으로만 진행) */}
<div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
  <div style={{ maxHeight: preflight ? 240 : 420, overflow:'auto' }}>
    {(history.data || []).filter(r=>r.public).map((m, idx)=>(
      <div key={idx} style={{ margin:'8px 0' }}>
        <div style={{ fontSize:12, color:'#64748b' }}>{m.role.toUpperCase()}</div>
        <div style={{ whiteSpace:'pre-wrap' }}>{m.content}</div>
      </div>
    ))}
  </div>

  {!preflight && (
    <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
      <button
        onClick={doNextTurn}
        style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700 }}
        title="프롬프트 세트를 따라 다음 턴 진행"
      >
        다음
      </button>
    </div>
  )}
</div>
{/* === 하단 공용채팅 도킹 === */}
<div style={{
  position:'fixed', left:0, right:0, bottom:0, zIndex:60,
  transform: dockOpen ? 'translateY(0)' : 'translateY(calc(100% - 40px))',
  transition:'transform .25s ease'
}}>
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                background:'#111827', color:'#fff', padding:'8px 12px', cursor:'pointer' }}
       onClick={()=>setDockOpen(o=>!o)}>
    <b>공용 채팅</b>
    {dockOpen ? <ChevronDown size={18}/> : <ChevronUp size={18}/>}
  </div>
  <div style={{ background:'#fff', borderTop:'1px solid #e5e7eb' }}>
    <SharedChatDock height={dockOpen ? 280 : 0} />
  </div>
</div>


        <div>
          {!preflight && <GroupedRoster grouped={grouped.slice(Math.ceil(grouped.length/2))} compact />}
        </div>
      </div>
    </div>
  )
}
