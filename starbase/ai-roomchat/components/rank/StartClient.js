// components/rank/StartClient.js
// 요구사항 요약
// - 게임 정보 로드 → 내 참가자(캐릭터) 확인 → 역할/슬롯 기준으로 상대 매칭
// - 시작 전 오버레이(Preflight)에서 구성 확인 후 "게임 시작" 누르면 본 화면 전개
// - 중앙은 나중에 엔진/히스토리 UI를 꽂아갈 수 있도록 center 슬롯 제공
// - pages/rank/[id]/start.js 에서는 <StartClient gameId={id} onExit={...} /> 로 사용

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { pickOpponents } from '@/lib/matchmaking'          // 역할별/점수대 매칭 유틸
import StartScaffold from '@/components/rank/StartScaffold' // 좌우(참여자), 중앙(center), 오버레이를 잡아주는 레이아웃
import SharedChatDock from '@/components/common/SharedChatDock'

function groupByRole(list) {
  const map = new Map()
  for (const p of list || []) {
    if (!map.has(p.role)) map.set(p.role, [])
    map.get(p.role).push(p)
  }
  return Array.from(map.entries()).map(([role, members]) => ({ role, members }))
}

export default function StartClient({ gameId, onExit }) {
  const [mounted, setMounted] = useState(false)       // CSR 보장
  const [loading, setLoading] = useState(true)
  const [preflight, setPreflight] = useState(true)    // 시작 전 오버레이 on/off
  const [starting, setStarting] = useState(false)

  const [game, setGame] = useState(null)              // rank_games row
  const [me, setMe] = useState(null)                  // 내 참가 정보(heroes join 포함)
  const [participants, setParticipants] = useState([]) // 나 + 매칭된 상대들

  const grouped = useMemo(() => groupByRole(participants), [participants])

  // CSR 전용
  useEffect(() => { setMounted(true) }, [])

  // 최초 부트스트랩
  useEffect(() => {
    if (!mounted || !gameId) return
    ;(async () => {
      try {
        setLoading(true)
        await bootstrap()
      } catch (e) {
        console.error(e)
        alert(e.message || '초기화 실패')
        onExit?.()
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, gameId])

  async function bootstrap() {
    // 1) 게임/유저
    const [{ data: g, error: gErr }, { data: uRes }] = await Promise.all([
      supabase.from('rank_games').select('*').eq('id', gameId).single(),
      supabase.auth.getUser()
    ])
    if (gErr || !g) throw new Error('게임을 찾을 수 없습니다.')
    setGame(g)
    const uid = uRes?.user?.id
    if (!uid) throw new Error('로그인이 필요합니다.')

    // 2) 내 참가(이미 등록된 캐릭) 조회
    const { data: my, error: myErr } = await supabase
      .from('rank_participants')
      .select(`
        id, game_id, owner_id, hero_id, role, score,
        heroes ( name, image_url, description, ability1, ability2, ability3, ability4 )
      `)
      .eq('game_id', gameId)
      .eq('owner_id', uid)
      .limit(1)
      .maybeSingle()

    if (myErr || !my) {
      throw new Error('참여자가 없습니다. 게임 상세에서 먼저 참여 등록하세요.')
    }
    setMe(my)

    // 3) 역할/슬롯 기준 설정
    const roles = Array.isArray(g.roles) ? g.roles : []
    const slotsPerRole = g.slots_per_role || Object.fromEntries(roles.map(r => [r, 1]))
    const myScore = my.score ?? 1000

    // 4) 매칭(가까운 점수대에서 역할별 랜덤 픽)
    const picked = await pickOpponents({
      gameId,
      myHeroId: my.hero_id,
      myScore,
      roles,
      slotsPerRole,
      step: 100,
      maxWindow: 800
    })

    // 5) 참여자 확정(나 + 상대들)
    const all = [{ ...my }, ...picked]
    setParticipants(all)
  }

  // “게임 시작” → 오버레이 닫기(엔진은 이후 단계에서 center 슬롯에 꽂음)
  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
      setPreflight(false)
      // 이후 단계:
      // - 세션 생성(ensureActiveSession)
      // - aiHistory.beginSession()
      // - 시스템 프롬프트 push
      // - 중앙 영역에 엔진/히스토리 UI 주입
    } finally {
      setStarting(false)
    }
  }

  // (선택) 세션 미리 생성하고 싶으면 사용
  async function ensureActiveSession() {
    const { data: existing } = await supabase
      .from('rank_sessions')
      .select('id, status')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!existing || existing.length === 0 || existing[0].status !== 'active') {
      const { error: sErr } = await supabase
        .from('rank_sessions')
        .insert({ game_id: gameId }) // owner_id는 트리거로 자동 주입
        .select()
        .single()
      if (sErr) throw sErr
    }
  }

  if (!mounted) return null
  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: '16px auto', padding: 12 }}>
        불러오는 중…
      </div>
    )
  }

  // 중앙 영역(엔진/히스토리 들어올 자리). 지금은 안내 + 공용 채팅만.
  const center = (
    <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, background:'#fff', minHeight:360 }}>
      <div style={{ color:'#64748b', marginBottom:10 }}>
        게임 시작을 누르면 본편 UI가 펼쳐집니다. (중앙 영역은 이후 엔진/히스토리 연결 예정)
      </div>

      {me && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>내 캐릭터</div>
          <div style={{ display:'grid', gap:6 }}>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {me.heroes?.image_url
                ? <img src={me.heroes.image_url} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover' }} />
                : <div style={{ width:44, height:44, borderRadius:8, background:'#e5e7eb' }} />}
              <div style={{ fontWeight:600 }}>
                {me.heroes?.name} <span style={{ color:'#94a3b8', fontWeight:400 }}>({me.role})</span>
              </div>
            </div>
            <div style={{ color:'#64748b', fontSize:13 }}>{me.heroes?.description}</div>
            <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:'#334155' }}>
              {['ability1','ability2','ability3','ability4'].map(k => me.heroes?.[k] ? <li key={k}>{me.heroes[k]}</li> : null)}
            </ul>
          </div>
        </div>
      )}

      {/* 공용 채팅(로비와 공유) */}
      <SharedChatDock height={320} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '16px auto', padding: 12 }}>
      {/* 헤더: 제목/설명 + 나가기 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ display:'flex', gap:10, alignItems:'baseline' }}>
          <h2 style={{ margin:0 }}>{game?.name || '게임'}</h2>
          <span style={{ color:'#64748b' }}>{game?.description}</span>
        </div>
        <button onClick={onExit} style={{ padding:'6px 10px' }}>← 나가기</button>
      </div>

      {/* 레이아웃 + 오버레이는 StartScaffold에 위임 */}
      <StartScaffold
        preflight={preflight}
        grouped={grouped}
        starting={starting}
        onStart={handleStart}
        onExit={onExit}
        center={center}
      />
    </div>
  )
}
