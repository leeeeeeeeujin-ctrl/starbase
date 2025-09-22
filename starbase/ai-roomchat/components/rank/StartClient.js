'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabase'
import { useAiHistory } from '@/lib/aiHistory'
import { parseOutcome } from '@/lib/outcome'
import { pickSubstitute } from '@/lib/substitute'
import { runOneTurn } from '@/lib/engineRunner'
import { makeCallModel } from '@/lib/modelClient'
import SharedChatDock from '@/components/common/SharedChatDock'

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
  function buildSystemPromptFromChecklist(g){
    const lines = []
    if (g?.rules?.length) lines.push(g.rules)
    lines.push('규칙: 결과는 마지막 한 줄에만 캐릭터명과 승/패/탈락 중 하나로 기입')
    lines.push('이전 5줄은 공란 유지')
    return lines.join('\n')
  }

  // 세션 시작
  async function handleStart(){
    if (starting) return
    setStarting(true)
    try {
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
        role:'system',
        content: buildSystemPromptFromChecklist(game),
        public: false
      })
      setPreflight(false)
    } catch(e){
      console.error(e)
      alert(e.message || '시작 실패')
    } finally {
      setStarting(false)
    }
  }

  // 한 턴 진행
  async function doNextTurn(){
    // 슬롯 템플릿/브릿지: 추후 메이커 연결. 지금은 템플릿 비움.
    const template = ''
    const slotsPayload = buildSlotsFromParticipants(participants)

    const res = await runOneTurn({
      template,
      slots: slotsPayload,
      historyText: history.joinedText({ onlyPublic:false, last:50 }),
      callModel
    })

    // 공개 로그(모델 응답)
    await history.push({ role:'assistant', content: res.aiText, public:true })

    // 승/패/탈락 판정
    const judged = parseOutcome({ aiText: res.aiText, participants })
    let endNow = false

    if (judged.length) {
      const losers = judged.filter(j => j.result==='lose').map(j=>j.hero_id)
      if (losers.length) {
        setUsedHeroIds(prev => new Set([...prev, ...losers]))
        // 간단 치환: 같은 역할 풀에서 아직 안 쓴 캐릭터 하나
        const byRole = new Map()
        participants.forEach(p => {
          if (!byRole.has(p.role)) byRole.set(p.role, [])
          byRole.get(p.role).push(p)
        })
        const replaced = participants.map(p => {
          if (losers.includes(p.hero_id)) {
            const sub = pickSubstitute({ pool: byRole.get(p.role)||[], usedHeroIds: new Set(losers) })
            return sub || p
          }
          return p
        })
        setParticipants(replaced)
      }
      if (judged.some(j => j.result==='win' || j.result==='lose')) endNow = true
    }

    setTurnIndex(t=>t+1)

    // 종료 처리 (브릿지/다음 슬롯 미연결 시에도 종료)
    if (endNow || res.action==='win' || res.action==='lose' || !res.nextSlotId) {
      try {
        if (!sessionId) throw new Error('세션 없음')
        const results = judged.length
          ? { participants: judged }
          : { participants: participants.map(p=>({ hero_id:p.hero_id, role:p.role, result:'draw' })) }

        const { error: rpcErr } = await supabase.rpc('rank_apply_result_multi', {
          p_session_id: sessionId,
          p_results: results
        })
        if (rpcErr) throw rpcErr
        alert('세션 종료 및 점수 반영 완료')
      } catch(e){
        console.error(e)
        alert('결과 반영 실패: ' + (e.message || e))
      }
      return
    }

    setCurrentSlotId(res.nextSlotId)
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

        <div>
          {/* 중앙: 공용 채팅 (유저 입력=메인 턴 트리거) */}
          <SharedChatDock
            height={preflight ? 320 : 480}
            onUserSend={async (text) => {
              await history.push({ role:'user', content:text, public:true })
              await doNextTurn()
              return true
            }}
          />
          {!preflight && (
            <div style={{ marginTop:8, display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button
                onClick={doNextTurn}
                style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff' }}
              >
                다음
              </button>
            </div>
          )}
        </div>

        <div>
          {!preflight && <GroupedRoster grouped={grouped.slice(Math.ceil(grouped.length/2))} compact />}
        </div>
      </div>
    </div>
  )
}
