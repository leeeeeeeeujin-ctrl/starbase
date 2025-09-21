// components/rank/StartClient.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { pickOpponents } from '@/lib/matchmaking'
import StartScaffold from '@/components/rank/StartScaffold'

function groupByRole(list) {
  const map = new Map()
  for (const p of list || []) {
    if (!map.has(p.role)) map.set(p.role, [])
    map.get(p.role).push(p)
  }
  return Array.from(map.entries()).map(([role, members]) => ({ role, members }))
}

export default function StartClient({ gameId, onExit }) {
  const [mounted, setMounted] = useState(false)
  const [preflight, setPreflight] = useState(true)     // 시작 전 오버레이 표시
  const [starting, setStarting] = useState(false)
  const [game, setGame] = useState(null)
  const [me, setMe] = useState(null)                   // 내 참가(내 캐릭)
  const [participants, setParticipants] = useState([]) // 나 + 매칭된 상대
  const grouped = useMemo(() => groupByRole(participants), [participants])

  // CSR 보장
  useEffect(() => { setMounted(true) }, [])

  // 최초 로드
  useEffect(() => {
    if (!mounted || !gameId) return
    bootstrap().catch(err => {
      console.error(err)
      alert(err.message || '초기화 실패')
      onExit?.()
    })
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

    // 2) 내 참가(이미 등록된 캐릭)
    const { data: my, error: myErr } = await supabase
      .from('rank_participants')
      .select('id, hero_id, role, score, heroes ( name, image_url, description, ability1, ability2, ability3, ability4 )')
      .eq('game_id', gameId)
      .eq('owner_id', uid)
      .limit(1)
      .maybeSingle()
    if (myErr || !my) throw new Error('참여자가 없습니다. 게임 상세에서 먼저 참여 등록하세요.')
    setMe(my)

    // 3) 역할/슬롯 세팅
    const roles = Array.isArray(g.roles) ? g.roles : []
    const slotsPerRole = g.slots_per_role || Object.fromEntries(roles.map(r => [r, 1]))
    const myScore = my.score ?? 1000

    // 4) 매칭(가까운 점수대에서 역할별로 채움)
    const picked = await pickOpponents({
      gameId,
      myHeroId: my.hero_id,
      myScore,
      roles,
      slotsPerRole,
      step: 100,
      maxWindow: 800
    })

    // 5) 참여자 배열 확정(나 + 상대들)
    const all = [{ ...my, role: my.role }, ...picked]
    setParticipants(all)

    // (선택) 여기서 세션 미리 만들려면 아래 주석 해제
    // await ensureActiveSession()
  }

  // 필요 시 세션 미리 생성하는 보조 함수(지금은 미사용, 엔진 연결 때 쓰면 됨)
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
      if (sErr) throw sErr
    }
  }

  // “게임 시작” 버튼
  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
      // 최소 동작: 오버레이 닫고 본편 패널 보여주기
      setPreflight(false)

      // (다음 단계)
      // - aiHistory.beginSession()
      // - 시스템 프롬프트 push
      // - 중앙 영역에 엔진 UI 주입(유저 입력→스텁→모델 응답)
    } finally {
      setStarting(false)
    }
  }

  if (!mounted) return null

  return (
    <div style={{ maxWidth: 1200, margin: '16px auto', padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>{game?.name || '게임'}</h2>
          <span style={{ color: '#64748b' }}>{game?.description}</span>
        </div>
        <button onClick={onExit} style={{ padding: '6px 10px' }}>← 나가기</button>
      </div>

      <StartScaffold
        preflight={preflight}
        grouped={grouped}
        starting={starting}
        onStart={handleStart}
        onExit={onExit}
        center={
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12, padding: 12, background: '#fff', minHeight: 320
          }}>
            <div style={{ color: '#64748b' }}>
              게임 시작을 누르면 본편 UI가 펼쳐집니다.
              {/* 다음 단계에서 여기 중앙에 엔진/히스토리 채팅 UI를 주입 */}
            </div>
            {me && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>내 캐릭터</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {me.heroes?.image_url
                      ? <img src={me.heroes.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 8, background: '#e5e7eb' }} />}
                    <div style={{ fontWeight: 600 }}>{me.heroes?.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({me.role})</span></div>
                  </div>
                  <div style={{ color: '#64748b', fontSize: 13 }}>{me.heroes?.description}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#334155' }}>
                    {['ability1', 'ability2', 'ability3', 'ability4'].map(k => me.heroes?.[k] ? <li key={k}>{me.heroes[k]}</li> : null)}
                  </ul>
                </div>
              </div>
            )}
          </div>
        }
      />
    </div>
  )
}
