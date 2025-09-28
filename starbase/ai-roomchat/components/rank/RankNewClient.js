// components/rank/RankNewClient.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'
import PromptSetPicker from '../../components/rank/PromptSetPicker'
import SlotMatrix from '../../components/rank/SlotMatrix'
import RolesEditor from '../../components/rank/RolesEditor'
import RulesChecklist, { buildRulesPrefix } from '../../components/rank/RulesChecklist'
import { uploadGameImage } from '../../lib/rank/storage'

async function registerGame(payload) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: '로그인이 필요합니다.' }
  }

  const gameInsert = {
    owner_id: user.id,
    name: payload?.name || '새 게임',
    description: payload?.description || '',
    image_url: payload?.image_url || '',
    prompt_set_id: payload?.prompt_set_id,
    realtime_match: !!payload?.realtime_match,
    rules: payload?.rules ?? null,
    rules_prefix: payload?.rules_prefix ?? null,
  }

  const { data: game, error: gameError } = await withTable(
    supabase,
    'rank_games',
    (table) =>
      supabase
        .from(table)
        .insert(gameInsert)
        .select()
        .single()
  )

  if (gameError || !game) {
    return { ok: false, error: gameError?.message || '게임 등록에 실패했습니다.' }
  }

  if (Array.isArray(payload?.roles) && payload.roles.length) {
    const rows = payload.roles.map((role) => {
      const rawMin = Number(role?.score_delta_min)
      const rawMax = Number(role?.score_delta_max)
      const min = Number.isFinite(rawMin) ? rawMin : 20
      const max = Number.isFinite(rawMax) ? rawMax : 40

      return {
        game_id: game.id,
        name: role?.name ? String(role.name) : '역할',
        slot_count: Number.isFinite(Number(role?.slot_count)) ? Number(role.slot_count) : 1,
        active: true,
        score_delta_min: Math.max(0, min),
        score_delta_max: Math.max(Math.max(0, min), max),
      }
    })

    const { error: roleError } = await withTable(supabase, 'rank_game_roles', (table) =>
      supabase.from(table).insert(rows)
    )
    if (roleError) {
      return { ok: false, error: roleError.message || '역할을 저장하지 못했습니다.' }
    }
  }

  return { ok: true, gameId: game.id }
}

export default function RankNewClient() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  // 기본 정보
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [imgFile, setImgFile] = useState(null)
  const [setId, setSetId] = useState('')
  const [realtime, setRealtime] = useState(false)

  // 역할/슬롯
  const [roles, setRoles] = useState([
    { name: '공격', score_delta_min: 20, score_delta_max: 40 },
    { name: '수비', score_delta_min: 20, score_delta_max: 40 },
  ])
  const [slotMap, setSlotMap] = useState([])

  // 규칙
  const [rules, setRules] = useState({
    nerf_insight: false,
    ban_kindness: false,
    nerf_peace: false,
    nerf_ultimate_injection: true,
    fair_power_balance: true,
    char_limit: 0,
  })
  const [brawlEnabled, setBrawlEnabled] = useState(false)
  const [brawlRule, setBrawlRule] = useState('banish-on-loss')
  const [endCondition, setEndCondition] = useState('')
  const [showBrawlHelp, setShowBrawlHelp] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { router.replace('/'); return }
      setUser(user)
    })()
    return () => { alive = false }
  }, [router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const storedBackground = window.localStorage.getItem('selectedHeroBackgroundUrl') || ''
      setBackgroundImage(storedBackground)
    } catch (error) {
      console.error('Failed to hydrate register background:', error)
    }
  }, [])

  const activeSlots = useMemo(
    () => (slotMap || []).filter(s => s.active && s.role && s.role.trim()),
    [slotMap]
  )

  const registerChecklist = useMemo(
    () => [
      '대표 이미지와 설명을 준비했나요?',
      '실시간, 혹은 싱글 플레이 여부를 생각했나요?',
      '프롬프트 세트를 충분히 준비했나요?',
      '역할 이름을 헷갈리진 않았나요?',
    ],
    [],
  )

  const registerGuides = useMemo(
    () => [
      { key: 'maker', label: '프롬프트 세트 관리', href: '/maker' },
      { key: 'register', label: '게임 등록 화면 열기', href: '/rank/new' },
    ],
    [],
  )

  const handleToggleBrawl = () => {
    setBrawlEnabled((prev) => {
      const next = !prev
      if (!next) {
        setShowBrawlHelp(false)
      }
      return next
    })
  }

  async function onSubmit() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!setId) return alert('프롬프트 세트를 선택하세요.')
    if (activeSlots.length === 0) return alert('최소 1개의 슬롯을 활성화하고 역할을 지정하세요.')

    let image_url = ''
    if (imgFile) {
      try {
        const up = await uploadGameImage(imgFile)
        image_url = up.url
      } catch (e) {
        return alert('이미지 업로드 실패: ' + (e?.message || e))
      }
    }

    const compiledRules = {
      ...rules,
      brawl_rule: 'banish-on-loss',
      end_condition_variable: null,
    }

    if (brawlEnabled) {
      compiledRules.brawl_rule = brawlRule
      compiledRules.end_condition_variable = endCondition.trim() || null
    }

    const res = await registerGame({
      name: name || '새 게임',
      description: desc || '',
      image_url,
      prompt_set_id: setId,
      roles: roles.map((role) => ({
        name: role?.name || '역할',
        slot_count: 1,
        score_delta_min: Number.isFinite(Number(role?.score_delta_min)) ? Number(role.score_delta_min) : 20,
        score_delta_max: Number.isFinite(Number(role?.score_delta_max)) ? Number(role.score_delta_max) : 40,
      })),
      rules: compiledRules,
      rules_prefix: buildRulesPrefix(compiledRules),
      realtime_match: realtime,
    })

    if (!res.ok) {
      return alert('게임 등록 실패: ' + (res.error || 'unknown'))
    }

    const gameId = res.gameId
    const payload = activeSlots.map(s => ({
      game_id: gameId, slot_index: s.slot_index, role: s.role, active: true,
    }))
    const { error: slotError } = await withTable(supabase, 'rank_game_slots', (table) =>
      supabase.from(table).upsert(payload, { onConflict: 'game_id,slot_index' })
    )

    if (slotError) {
      return alert('슬롯 저장 실패: ' + (slotError.message || slotError))
    }

    alert('등록 완료')
    router.replace(`/rank/${gameId}`)
  }

  const pageStyle = backgroundImage
    ? {
        minHeight: '100vh',
        backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.96) 100%), url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        display: 'flex',
        flexDirection: 'column',
      }
    : {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 28%, #0f172a 100%)',
        display: 'flex',
        flexDirection: 'column',
      }

  const cardStyle = {
    background: 'rgba(15,23,42,0.78)',
    borderRadius: 24,
    padding: '24px 28px',
    boxShadow: '0 32px 68px -48px rgba(15, 23, 42, 0.8)',
    color: '#e2e8f0',
    display: 'grid',
    gap: 18,
  }

  const togglePillStyle = (active) => ({
    padding: '8px 18px',
    borderRadius: 999,
    border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.45)',
    background: active ? 'rgba(96,165,250,0.25)' : 'rgba(15,23,42,0.55)',
    color: active ? '#0f172a' : '#f8fafc',
    fontWeight: 700,
    letterSpacing: 0.5,
    cursor: 'pointer',
  })

  const optionButtonStyle = (active) => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.45)',
    background: active ? 'rgba(96,165,250,0.25)' : 'rgba(15,23,42,0.55)',
    color: '#f8fafc',
    fontWeight: 600,
  })

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.45)',
    background: 'rgba(15,23,42,0.55)',
    color: '#f8fafc',
  }

  const labelStyle = { display: 'grid', gap: 6, fontSize: 13 }
  const infoTextStyle = { margin: 0, fontSize: 14, lineHeight: 1.6, color: '#cbd5f5' }
  const overviewColumns = {
    display: 'grid',
    gap: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  }

  return (
    <div style={pageStyle}>
      <div
        style={{
          flex: '1 1 auto',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 16px 120px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1040,
            display: 'grid',
            gap: 20,
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              color: '#f8fafc',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 28 }}>게임 등록</h2>
            <button
              onClick={() => router.back()}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.45)',
                background: 'rgba(15,23,42,0.55)',
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            >
              ← 뒤로
            </button>
          </header>

          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>등록 개요</p>
                <p style={infoTextStyle}>
                  아래 카드에서 슬롯, 규칙, 모드를 채워 넣으세요. 모든 항목은 언제든지 수정할 수 있습니다.
                </p>
              </div>
            </div>
            <div style={overviewColumns}>
              <div style={{ display: 'grid', gap: 8, background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '16px 18px' }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>등록 체크리스트</p>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13, color: '#cbd5f5' }}>
                  {registerChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={{ display: 'grid', gap: 10, background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '16px 18px' }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>등록 가이드</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {registerGuides.map((guide) => (
                    <Link
                      key={guide.key}
                      href={guide.href}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 999,
                        border: '1px solid rgba(148,163,184,0.45)',
                        color: '#e2e8f0',
                        fontSize: 13,
                      }}
                    >
                      {guide.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>역할 정의</p>
            <p style={infoTextStyle}>게임에서 사용할 역할과 기본 점수 범위를 정리하세요.</p>
            <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '12px 14px' }}>
              <RolesEditor roles={roles} onChange={setRoles} />
            </div>
          </section>

          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>기본 정보</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={labelStyle}>
                <span style={{ color: '#cbd5f5' }}>게임 이름</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 별빛 난투 시즌1" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                <span style={{ color: '#cbd5f5' }}>설명</span>
                <textarea
                  placeholder="게임 소개와 매칭 규칙을 간단히 적어 주세요."
                  rows={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </label>
              <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '12px 14px' }}>
                <PromptSetPicker value={setId} onChange={setSetId} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5f5' }}>
                <input
                  type="checkbox"
                  checked={realtime}
                  onChange={(event) => setRealtime(event.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                실시간 매칭 사용
              </label>
              <label style={labelStyle}>
                <span style={{ color: '#cbd5f5' }}>표지 이미지</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImgFile(event.target.files?.[0] || null)}
                  style={{
                    padding: '8px 0',
                    color: '#f8fafc',
                  }}
                />
                {imgFile ? (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{imgFile.name}</span>
                ) : (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>이미지를 선택하지 않으면 기본 배경이 사용됩니다.</span>
                )}
              </label>
            </div>
          </section>

          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>슬롯 매핑</p>
            <p style={infoTextStyle}>역할과 슬롯을 연결해 실제 매칭 시 사용할 구성을 지정하세요.</p>
            <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '12px 14px' }}>
              <SlotMatrix value={slotMap} onChange={setSlotMap} roleOptions={roles.map((role) => role.name)} />
            </div>
          </section>

          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>체크리스트 · 세부 규칙</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: '16px 18px',
                  borderRadius: 18,
                  border: '1px solid rgba(96,165,250,0.35)',
                  background: 'rgba(30,64,175,0.28)',
                  boxShadow: '0 16px 36px -28px rgba(37, 99, 235, 0.65)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4, minWidth: 240 }}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>난투 옵션</p>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#dbeafe' }}>
                      해당 옵션에 체크하면 전투중 패배한 인원을 대체해 새 인원이 난입합니다. 승리해도 게임이 끝나지 않으며, 게임이 끝나는 조건, 즉 변수를 지정해야 합니다.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowBrawlHelp((prev) => !prev)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid rgba(148,163,184,0.45)',
                        background: 'rgba(15,23,42,0.55)',
                        color: '#f8fafc',
                        fontWeight: 700,
                      }}
                    >
                      ?
                    </button>
                    <button type="button" style={togglePillStyle(brawlEnabled)} onClick={handleToggleBrawl}>
                      {brawlEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
                {showBrawlHelp ? (
                  <div
                    style={{
                      background: 'rgba(15,23,42,0.55)',
                      borderRadius: 14,
                      padding: '12px 14px',
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: '#e2e8f0',
                    }}
                  >
                    해당 옵션에 체크하면 전투중 패배한 인원을 대체해 새 인원이 난입합니다. 승리해도 게임이 끝나지 않으며, 게임이 끝나는 조건, 즉 변수를 지정해야 합니다.
                  </div>
                ) : null}
                {brawlEnabled ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        style={optionButtonStyle(brawlRule === 'instant-elimination')}
                        onClick={() => setBrawlRule('instant-elimination')}
                      >
                        탈락자 즉시패배
                      </button>
                      <button
                        type="button"
                        style={optionButtonStyle(brawlRule === 'banish-on-loss')}
                        onClick={() => setBrawlRule('banish-on-loss')}
                      >
                        패배시 추방
                      </button>
                    </div>
                    <label style={labelStyle}>
                      <span style={{ color: '#dbeafe' }}>게임 종료 조건 변수</span>
                      <input
                        type="text"
                        value={endCondition}
                        onChange={(event) => setEndCondition(event.target.value)}
                        placeholder="예: remainingTeams <= 1"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 12, color: '#bfdbfe' }}>
                        등록 폼의 끝에서 두 번째 줄에 위치한 변수 칸과 연결됩니다. 조건을 만족할 때까지 게임은 종료되지 않으며, 종료 시 승리 횟수에 따라 점수가 정산됩니다.
                      </span>
                    </label>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5' }}>
                    해당 옵션에 체크하면 전투중 패배한 인원을 대체해 새 인원이 난입합니다. 승리해도 게임이 끝나지 않으며, 게임이 끝나는 조건, 즉 변수를 지정해야 합니다.
                  </p>
                )}
              </div>
              <div style={{ background: 'rgba(15,23,42,0.45)', borderRadius: 16, padding: '12px 14px' }}>
                <RulesChecklist value={rules} onChange={setRules} />
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onSubmit}
              style={{
                padding: '12px 20px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                color: '#fff',
                fontWeight: 700,
                boxShadow: '0 24px 60px -32px rgba(37, 99, 235, 0.65)',
              }}
            >
              등록
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
