// pages/rank/[id].js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

// ---------- 작은 유틸 ----------
function cls(...xs){ return xs.filter(Boolean).join(' ') }
function nowIso(){ return new Date().toISOString() }

// ---------- 메인 페이지 ----------
export default function RankGamePage() {
  const router = useRouter()
  const { id } = router.query // game_id (uuid)

  const [me, setMe] = useState(null)                // supabase user
  const [game, setGame] = useState(null)            // {id,name,description,roles, ...}
  const [myHeroes, setMyHeroes] = useState([])      // 내가 가진 히어로들
  const [pickHeroId, setPickHeroId] = useState('')  // 선택한 히어로 id
  const [pickRole, setPickRole] = useState('')      // 선택한 역할명
  const [participants, setParticipants] = useState([]) // [{ id, owner_id, hero_id, role, score, created_at, hero:{...} }]
  const [loading, setLoading] = useState(true)

  // 초기 로드
  useEffect(() => {
    if (!id) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }
      setMe(user)

      // 게임 로드
      const { data: g } = await supabase
        .from('rank_games')
        .select('id,name,description,roles,created_at')
        .eq('id', id)
        .single()
      setGame(g || null)

      // 내 히어로들
      const { data: hs } = await supabase
        .from('heroes')
        .select('id,name,image_url')
        .eq('owner_id', user.id)
        .order('created_at', { ascending:false })
      setMyHeroes(hs || [])
      setPickHeroId(hs && hs.length ? hs[0].id : '')

      // 참가자 불러오기(2-스텝 조회)
      await refreshParticipants(id)

      setLoading(false)
    })()
  }, [id, router])

  // 참가자 2-스텝 조회 (임베드 400 방지)
  async function refreshParticipants(gameId) {
    const { data: ps, error: pErr } = await supabase
      .from('rank_participants')
      .select('id, game_id, owner_id, hero_id, role, score, created_at')
      .eq('game_id', gameId)
      .order('score', { ascending:false })
    if (pErr) {
      console.error('participants error', pErr)
      setParticipants([])
      return
    }
    const heroIds = (ps ?? []).map(p => p.hero_id).filter(Boolean)
    const { data: hs } = heroIds.length
      ? await supabase
          .from('heroes')
          .select('id,name,image_url')
          .in('id', heroIds)
      : { data: [] }
    const hmap = new Map((hs || []).map(h => [h.id, h]))
    setParticipants((ps || []).map(p => ({ ...p, hero: hmap.get(p.hero_id) || null })))
  }

  const myHero = useMemo(() => myHeroes.find(h => h.id === pickHeroId) || null, [myHeroes, pickHeroId])
  const roles = useMemo(() => Array.isArray(game?.roles) ? game.roles : [], [game])

  // 참여 (캐릭 교체 포함)
  async function joinGame() {
    if (!me) { alert('로그인이 필요합니다'); return }
    if (!myHero?.id) { alert('참여할 캐릭터를 선택하세요'); return }

    const roleName = pickRole || (roles[0] || '')
    const payload = {
      game_id: id,               // uuid 문자열 그대로
      owner_id: me.id,           // ★ onConflict 키에 들어갈 값
      hero_id: myHero.id,        // 교체되면 업데이트됨
      role: roleName,            // text
      score: 1000                // 초기점수(임시)
    }

    // Upsert 충돌키: (game_id, owner_id)  ← 캐릭터 교체 시 update 동작
    const { data, error } = await supabase
      .from('rank_participants')
      .upsert(payload, { onConflict: ['game_id','owner_id'] })
      .select()
      .single()

    if (error) {
      alert('참여 실패: ' + error.message)
      return
    }

    // ✅ 낙관적 업데이트 (즉시 반영)
    setParticipants(prev => {
      // 같은 owner 레코드는 하나만 유지
      const others = prev.filter(p => p.owner_id !== me.id)
      const meRow = {
        id: data?.id || 'local-'+Date.now(),
        game_id: id,
        owner_id: me.id,
        hero_id: myHero.id,
        role: roleName,
        score: data?.score ?? 1000,
        created_at: data?.created_at || nowIso(),
        hero: { ...myHero }
      }
      return [meRow, ...others]
    })
    alert('참여 완료!')

    // 서버 재조회로 최종 동기화
    await refreshParticipants(id)
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>
  if (!game) return (
    <div style={{ padding:20 }}>
      존재하지 않는 게임입니다. <Link href="/rank"><a>← 랭킹으로</a></Link>
    </div>
  )

  return (
    <div style={{ maxWidth:1200, margin:'24px auto', padding:'0 12px', display:'grid', gap:16 }}>
      {/* 헤더 */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <Link href="/rank"><a className={cls('')} style={{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8 }}>← 목록</a></Link>
        <div style={{ fontSize:20, fontWeight:800 }}>{game.name}</div>
        <div style={{ color:'#64748b' }}>{game.description || '설명 없음'}</div>
      </div>

      {/* 참여 폼 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:12, display:'grid', gap:12, background:'#fff' }}>
        <div style={{ fontWeight:700 }}>내 캐릭터로 참여</div>

        {/* 캐릭터 선택 */}
        <div style={{ display:'grid', gap:8 }}>
          <label style={{ fontSize:12, color:'#6b7280' }}>캐릭터</label>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:10 }}>
            {myHeroes.map(h => (
              <button
                key={h.id}
                onClick={()=>setPickHeroId(h.id)}
                style={{
                  textAlign:'left',
                  border:'2px solid ' + (pickHeroId===h.id ? '#2563eb' : '#e5e7eb'),
                  borderRadius:12, padding:10, background:'#fff', cursor:'pointer'
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {h.image_url
                    ? <img src={h.image_url} alt="" style={{ width:40, height:40, objectFit:'cover', borderRadius:'50%' }}/>
                    : <div style={{ width:40, height:40, borderRadius:'50%', background:'#e5e7eb' }}/>}
                  <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>
                </div>
              </button>
            ))}
            {myHeroes.length===0 && <div style={{ color:'#94a3b8' }}>로스터에 캐릭터가 없습니다.</div>}
          </div>
        </div>

        {/* 역할 선택 */}
        <div style={{ display:'grid', gap:6 }}>
          <label style={{ fontSize:12, color:'#6b7280' }}>역할</label>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {roles.length === 0 && <div style={{ color:'#94a3b8' }}>이 게임은 역할이 정의되지 않았습니다.</div>}
            {roles.map(r => (
              <button
                key={r}
                onClick={()=>setPickRole(r)}
                className="role-pill"
                style={{
                  padding:'6px 10px',
                  borderRadius:999,
                  border:'1px solid ' + (pickRole===r ? '#2563eb' : '#e5e7eb'),
                  background: pickRole===r ? '#2563eb' : '#fff',
                  color: pickRole===r ? '#fff' : '#111827',
                  fontWeight:600, cursor:'pointer'
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button
            onClick={joinGame}
            style={{ padding:'10px 14px', borderRadius:10, background:'#111827', color:'#fff', fontWeight:800 }}
          >
            참여 / 캐릭터 변경
          </button>
        </div>
      </div>

      {/* 참가자 리스트 */}
      <div style={{ border:'1px solid #e5e7eb', borderRadius:12, background:'#fff', padding:12 }}>
        <div style={{ fontWeight:700, marginBottom:10 }}>참가자</div>
        {participants.length === 0 && (
          <div style={{ color:'#94a3b8' }}>아직 참가자가 없습니다.</div>
        )}
        <ul style={{ listStyle:'none', padding:0, margin:0, display:'grid', gap:8 }}>
          {participants.map(p => (
            <li key={p.id} style={{ border:'1px solid #f1f5f9', borderRadius:10, padding:10, display:'flex', alignItems:'center', gap:10 }}>
              {p.hero?.image_url
                ? <img src={p.hero.image_url} alt="" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }} />
                : <div style={{ width:36, height:36, borderRadius:'50%', background:'#e5e7eb' }}/>}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.hero?.name || '(이름 없음)'}
                </div>
                <div style={{ fontSize:12, color:'#6b7280' }}>
                  역할: {p.role || '-'} · 점수: {p.score ?? '-'}
                </div>
              </div>
              <div style={{ fontSize:12, color:'#94a3b8' }}>{new Date(p.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
