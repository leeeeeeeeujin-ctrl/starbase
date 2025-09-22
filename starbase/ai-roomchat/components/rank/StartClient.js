// components/rank/StartClient.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import SharedChatDock from '../common/SharedChatDock'
import {
  buildSystemPromptFromChecklist, buildSlotsFromParticipants,
  createAiHistory, evaluateBridge, makeNodePrompt, parseOutcome, shouldShowToSlot
} from '../../lib/promptEngine'

export default function StartClient() {
  const router = useRouter()
  const gameId = router.query.id

  const [loading, setLoading] = useState(true)
  const [game, setGame] = useState(null)
  const [participants, setParticipants] = useState([]) // [{role, hero_id, hero:{...}, status}]
  const [graph, setGraph] = useState({ nodes:[], edges:[] }) // 메이커 그래프(세트)
  const history = useMemo(()=>createAiHistory(), [])
  const [preflight, setPreflight] = useState(true)
  const [turn, setTurn] = useState(1)
  const visitedSlotIds = useRef(new Set())
  const [activeGlobal, setActiveGlobal] = useState([]) // 둘째 줄 변수(전역)
  const [activeLocal, setActiveLocal] = useState([])  // 둘째 줄 변수(로컬)
  const [currentNodeId, setCurrentNodeId] = useState(null) // 진행 중 노드 id
  const [starting, setStarting] = useState(false)

  // 초기 로드: 게임/참여자/세트
  useEffect(()=>{ if (!gameId) return; (async ()=>{
    const { data: g } = await supabase.from('rank_games').select('*').eq('id', gameId).single()
    setGame(g || null)

    // 참여자 + 히어로 조인(간소화)
    const { data: ps } = await supabase
      .from('rank_participants')
      .select('id, role, hero_id, status, heroes:hero_id(id,name,description,image_url,ability1,ability2,ability3,ability4)')
      .eq('game_id', gameId)
    const norm = (ps||[]).map(r=>({ role:r.role, hero_id:r.hero_id, status:r.status||'alive', hero:{
      id:r.heroes?.id, name:r.heroes?.name, description:r.heroes?.description, image_url:r.heroes?.image_url,
      ability1:r.heroes?.ability1, ability2:r.heroes?.ability2, ability3:r.heroes?.ability3, ability4:r.heroes?.ability4
    }}))
    setParticipants(norm)

    // 이 게임이 사용할 프롬프트 세트 id (rank_games.set_id 가정)
    if (g?.set_id) {
      const { data: slots } = await supabase.from('prompt_slots').select('*').eq('set_id', g.set_id).order('slot_no')
      const { data: bridges } = await supabase.from('prompt_bridges').select('*').eq('from_set', g.set_id)
      setGraph({
        nodes: (slots||[]).map(s=>({ id:String(s.id), is_start: !!s.is_start, template:s.template||'', options:s.options||{}, slot_type:s.slot_type||'ai' })),
        edges: (bridges||[]).map(b=>({ id:String(b.id), from:String(b.from_slot_id), to:String(b.to_slot_id), data:{
          trigger_words:b.trigger_words||[], conditions:b.conditions||[], priority:b.priority??0, probability:b.probability??1, fallback:!!b.fallback, action:b.action||'continue'
        }}))
      })
    } else {
      setGraph({ nodes:[], edges:[] })
    }

    setLoading(false)
  })() }, [gameId])

  // 현재 라운드용 슬롯/상태
  const slots = useMemo(()=>buildSlotsFromParticipants(participants), [participants])

  function findStartNodeId() {
    const n = graph.nodes.find(n=>n.is_start) || graph.nodes[0]
    return n ? n.id : null
  }

  function buildSystemPrompt() {
    // 게임 체크리스트 필드 예: game.rules_json
    let rules = {}
    try { rules = JSON.parse(game?.rules_json || '{}') } catch {}
    return buildSystemPromptFromChecklist(rules||{})
  }

  async function startGame() {
    if (starting) return
    setStarting(true)
    try {
      history.beginSession()
      await history.push({ role:'system', content: buildSystemPrompt(), public:false })
      setCurrentNodeId(findStartNodeId())
      setPreflight(false)
      setTurn(1)
    } finally { setStarting(false) }
  }

  async function nextStep() {
    if (!currentNodeId) {
      alert('진행할 노드가 없습니다. 시작을 눌러 주세요.')
      return
    }
    const node = graph.nodes.find(n=>n.id===currentNodeId)
    if (!node) return

    // 노드 가시성(현재는 전체에 공용으로 보여주는 시나리오이므로 필터만 참고)
    // 특정 슬롯 가시성으로 제한하고 싶으면 shouldShowToSlot(node.options, 현슬롯번호)로 분기

    // 1) 프롬프트 컴파일
    const compiled = makeNodePrompt({
      node, slots,
      historyText: history.joinedText({ onlyPublic:false, last:5 }),
      activeGlobalNames: activeGlobal, activeLocalNames: activeLocal,
      currentSlot: null
    })
    const promptText = compiled.text

    // 2) 모델 호출(여긴 스텁). 실제론 Edge Function/직접호출
    const aiText = [
      '(샘플 응답) 내용 …',
      'VAR_A VAR_B',   // ← 둘째 줄(변수)
      '', '', '',      // ← 공백 줄들
      '무승부'         // ← 마지막 줄(결론)
    ].join('\n')

    // 3) 히스토리 반영
    await history.push({ role:'system', content:`[PROMPT]\n${promptText}`, public:false })
    await history.push({ role:'assistant', content: aiText, public:true })

    // 4) 변수/결론 파싱 → 활성 변수 업데이트
    const { lastLine, variables } = parseOutcome(aiText)
    setActiveGlobal(prev => Array.from(new Set([...prev, ...variables]))) // 간단히 전역으로 누적
    setActiveLocal(variables) // 로컬은 직전 기준

    // 5) 다음 엣지 선택
    const outEdges = graph.edges
      .filter(e => e.from === String(currentNodeId))
      .sort((a,b)=> (b.data.priority||0) - (a.data.priority||0)) // 우선순위 높은 순
    let chosen = null
    for (const e of outEdges) {
      const ok = evaluateBridge(e.data, {
        turn,
        historyUserText: history.joinedText({ onlyPublic:true, last:5 }),
        historyAiText:   history.joinedText({ onlyPublic:false, last:5 }),
        visitedSlotIds: visitedSlotIds.current,
        myRole: null, // 필요 시 세팅
        participantsStatus: participants.map(p=>({ role:p.role, status:p.status||'alive' })),
        activeGlobalNames: activeGlobal,
        activeLocalNames: activeLocal
      })
      if (ok) { chosen = e; break }
    }
    // fallback 없으면 종료
    if (!chosen) { alert('진행 가능한 경로가 없습니다. 종료합니다.'); return }

    // 6) 액션 처리
    if (chosen.data.action === 'win') { alert('승리!'); return }
    if (chosen.data.action === 'lose') { alert('패배…'); return }
    // TODO: goto_set 등 확장

    // 7) 다음 노드로
    setCurrentNodeId(String(chosen.to))
    setTurn(t => t+1)
  }

  if (loading) return <div style={{ padding:16 }}>불러오는 중…</div>

  return (
    <div style={{ maxWidth:1200, margin:'16px auto', padding:12, display:'grid', gridTemplateRows:'auto 1fr', gap:12 }}>
      {/* 상단: 시작/다음 */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>router.replace(`/rank/${gameId}`)} style={{ padding:'8px 12px' }}>← 랭킹으로</button>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={startGame} disabled={!preflight || starting}
                  style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}>
            {preflight ? (starting ? '시작 중…' : '게임 시작') : '재시작'}
          </button>
          <button onClick={nextStep} disabled={preflight}
                  style={{ padding:'8px 12px', background:'#2563eb', color:'#fff', borderRadius:8 }}>
            다음
          </button>
        </div>
      </div>

      {/* 본문: 좌/중앙/우 */}
      <div style={{ display:'grid', gridTemplateColumns: preflight ? '1fr' : '1fr minmax(360px, 640px) 1fr', gap:12 }}>
        <div>
          {!preflight && <SmallRoster title="왼쪽 진영" participants={participants.filter((_,i)=>i%2===0)} />}
        </div>
        <div>
          {/* 중앙: 공유 채팅(게임 진행과 별개) */}
          <SharedChatDock height={preflight ? 320 : 380} />
          {/* 여기 위/아래로 히스토리/세션 로그 슬라이드 패널을 이후 붙이면 됨 */}
        </div>
        <div>
          {!preflight && <SmallRoster title="오른쪽 진영" participants={participants.filter((_,i)=>i%2===1)} />}
        </div>
      </div>
    </div>
  )
}

function SmallRoster({ title, participants }) {
  return (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff' }}>
      <div style={{ fontWeight:700, marginBottom:8 }}>{title}</div>
      <div style={{ display:'grid', gap:8 }}>
        {participants.map((p,idx)=>(
          <div key={idx} style={{ display:'grid', gridTemplateColumns:'56px 1fr', gap:8, alignItems:'start' }}>
            {p.hero?.image_url
              ? <img src={p.hero.image_url} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:'cover' }}/>
              : <div style={{ width:56, height:56, borderRadius:8, background:'#e5e7eb' }}/>}
            <div>
              <div style={{ fontWeight:700 }}>{p.hero?.name || '이름없음'}</div>
              <div style={{ fontSize:12, color:'#64748b' }}>{p.role || ''} · {p.status||'alive'}</div>
              <ul style={{ margin:'6px 0 0', paddingLeft:16, fontSize:13 }}>
                {['ability1','ability2','ability3','ability4'].map(k=>p.hero?.[k]).filter(Boolean).map((t,i)=><li key={i}>{t}</li>)}
              </ul>
            </div>
          </div>
        ))}
        {participants.length===0 && <div style={{ color:'#94a3b8' }}>참여자 없음</div>}
      </div>
    </div>
  )
}
