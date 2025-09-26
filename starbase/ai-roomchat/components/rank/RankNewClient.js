// components/rank/RankNewClient.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
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

  const { data: game, error: gameError } = await supabase
    .from('rank_games')
    .insert(gameInsert)
    .select()
    .single()

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

    const { error: roleError } = await supabase.from('rank_game_roles').insert(rows)
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
  const [imgPreview, setImgPreview] = useState('')
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

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) {
        if (process.env.NODE_ENV !== 'production') {
          setUser({ id: 'dev-preview' })
        } else {
          router.replace('/')
        }
        return
      }
      setUser(user)
    })()
    return () => { alive = false }
  }, [router])

  const activeSlots = useMemo(
    () => (slotMap || []).filter(s => s.active && s.role && s.role.trim()),
    [slotMap]
  )

  const namedRoleCount = useMemo(
    () => roles.reduce((count, role) => {
      if (role?.name && role.name.trim()) {
        return count + 1
      }
      return count
    }, 0),
    [roles],
  )

  const basicInfoReady = useMemo(
    () => Boolean(name.trim() && setId),
    [name, setId],
  )

  const blockingItems = useMemo(() => {
    const issues = []
    if (!setId) {
      issues.push('프롬프트 세트 선택')
    }
    if (!activeSlots.length) {
      issues.push('슬롯 매핑')
    }
    return issues
  }, [setId, activeSlots.length])

  const progressSteps = useMemo(
    () => [
      {
        id: 'info',
        label: '기본 정보',
        description: '이름, 설명, 대표 이미지',
        complete: basicInfoReady,
      },
      {
        id: 'roles',
        label: '역할 정의',
        description: '역할과 점수 범위를 정리해요.',
        complete: namedRoleCount > 0,
      },
      {
        id: 'slots',
        label: '슬롯 매핑',
        description: '활성 슬롯에 역할을 지정하세요.',
        complete: activeSlots.length > 0,
      },
      {
        id: 'rules',
        label: '체크리스트 규칙',
        description: '균형 옵션을 확인해요.',
        complete: true,
      },
    ],
    [basicInfoReady, namedRoleCount, activeSlots.length],
  )

  const canSubmit = useMemo(
    () => Boolean(user && setId && activeSlots.length),
    [user, setId, activeSlots.length],
  )

  useEffect(() => {
    return () => {
      if (imgPreview) URL.revokeObjectURL(imgPreview)
    }
  }, [imgPreview])

  function handleImageChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      setImgFile(null)
      setImgPreview('')
      return
    }
    const nextPreview = URL.createObjectURL(file)
    if (imgPreview) URL.revokeObjectURL(imgPreview)
    setImgFile(file)
    setImgPreview(nextPreview)
  }

  function clearImage() {
    setImgFile(null)
    if (imgPreview) URL.revokeObjectURL(imgPreview)
    setImgPreview('')
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
      rules,
      rules_prefix: buildRulesPrefix(rules),
      realtime_match: realtime,
    })

    if (!res.ok) {
      return alert('게임 등록 실패: ' + (res.error || 'unknown'))
    }

    const gameId = res.gameId
    const payload = activeSlots.map(s => ({
      game_id: gameId, slot_index: s.slot_index, role: s.role, active: true,
    }))
    await supabase.from('rank_game_slots').upsert(payload, { onConflict: 'game_id,slot_index' })

    alert('등록 완료')
    router.replace(`/rank/${gameId}`)
  }

  // 렌더
  return (
    <div className="rank-new-page">
      <div className="rank-new-shell">
        <header className="rank-new-header">
          <div className="rank-new-header-text">
            <nav className="rank-new-tabs" aria-label="게임 제작 탭">
              <button type="button" className="rank-new-tab" onClick={() => router.push('/maker')}>
                게임 제작
              </button>
              <button type="button" className="rank-new-tab is-active">
                게임 등록
              </button>
            </nav>
            <h1>랭크 게임 등록</h1>
            <p>
              준비해 둔 역할 구성과 슬롯 매핑을 빠르게 검토하고, 필요한 항목을 모두 채웠는지 확인한 뒤 등록하세요.
            </p>
          </div>
          <button type="button" className="rank-new-ghost" onClick={() => router.back()}>
            ← 돌아가기
          </button>
        </header>

        <div className="rank-new-body">
          <aside className="rank-new-sidebar">
            <section className="rank-new-steps">
              <h2>진행 단계</h2>
              <ol>
                {progressSteps.map((step, index) => (
                  <li
                    key={step.id}
                    className={`rank-new-step ${step.complete ? 'is-complete' : 'is-pending'}`}
                  >
                    <span className="rank-new-step-indicator" aria-hidden="true">
                      {step.complete ? '✓' : index + 1}
                    </span>
                    <div>
                      <p className="rank-new-step-title">{step.label}</p>
                      <p className="rank-new-step-desc">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rank-new-summary">
              <h2>요약</h2>
              <dl>
                <div>
                  <dt>게임 이름</dt>
                  <dd>{name.trim() ? name : '미정'}</dd>
                </div>
                <div>
                  <dt>프롬프트 세트</dt>
                  <dd>{setId ? '선택됨' : '미선택'}</dd>
                </div>
                <div>
                  <dt>활성 슬롯</dt>
                  <dd>{activeSlots.length}개</dd>
                </div>
                <div>
                  <dt>역할 수</dt>
                  <dd>{roles.length}개</dd>
                </div>
                <div>
                  <dt>실시간 매칭</dt>
                  <dd>{realtime ? '사용' : '미사용'}</dd>
                </div>
              </dl>
              <p className="rank-new-summary-status">
                {blockingItems.length === 0
                  ? '등록 준비 완료'
                  : `미완료: ${blockingItems.join(', ')}`}
              </p>
            </section>
          </aside>

          <main className="rank-new-main">
            <section className="rank-new-section" id="info">
              <header>
                <p className="rank-new-section-label">STEP 01</p>
                <h2>기본 정보</h2>
                <p>매칭 카드에 노출되는 이름과 소개, 대표 이미지를 정리합니다.</p>
              </header>
              <div className="rank-new-field-grid">
                <label className="rank-new-field">
                  <span>게임 이름</span>
                  <input
                    placeholder="예) 별빛 리그 시즌 3"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="rank-new-field">
                  <span>설명</span>
                  <textarea
                    rows={4}
                    placeholder="참가자에게 보여줄 소개 문구를 입력하세요."
                    value={desc}
                    onChange={(event) => setDesc(event.target.value)}
                  />
                </label>
              </div>
              <div className="rank-new-upload">
                <div className="rank-new-upload-preview" aria-live="polite">
                  {imgPreview ? (
                    <img src={imgPreview} alt="선택한 게임 대표 이미지" />
                  ) : (
                    <span>대표 이미지를 업로드하면 여기에서 미리볼 수 있어요.</span>
                  )}
                </div>
                <div className="rank-new-upload-actions">
                  <label className="rank-new-upload-button">
                    <input type="file" accept="image/*" onChange={handleImageChange} />
                    이미지 선택
                  </label>
                  {imgFile ? (
                    <button type="button" className="rank-new-ghost" onClick={clearImage}>
                      선택 해제
                    </button>
                  ) : null}
                  <p className="rank-new-upload-hint">PNG 또는 JPG, 2MB 이하 권장</p>
                </div>
              </div>
              <div className="rank-new-inline">
                <label className="rank-new-field">
                  <span>프롬프트 세트</span>
                  <PromptSetPicker value={setId} onChange={setSetId} />
                </label>
                <label className="rank-new-checkbox">
                  <input
                    type="checkbox"
                    checked={realtime}
                    onChange={(event) => setRealtime(event.target.checked)}
                  />
                  실시간 매칭 사용
                </label>
              </div>
            </section>

            <section className="rank-new-section" id="roles">
              <header>
                <p className="rank-new-section-label">STEP 02</p>
                <h2>역할 정의</h2>
                <p>참가자에게 배정할 역할과 점수 범위를 정리합니다.</p>
              </header>
              <RolesEditor roles={roles} onChange={setRoles} />
            </section>

            <section className="rank-new-section" id="slots">
              <header>
                <p className="rank-new-section-label">STEP 03</p>
                <h2>슬롯 매핑</h2>
                <p>레이드 슬롯마다 어떤 역할을 사용할지 지정해 주세요.</p>
              </header>
              <SlotMatrix value={slotMap} onChange={setSlotMap} roleOptions={roles.map((role) => role.name)} />
            </section>

            <section className="rank-new-section" id="rules">
              <header>
                <p className="rank-new-section-label">STEP 04</p>
                <h2>체크리스트 규칙</h2>
                <p>균형 조정 옵션과 글자 수 제한을 확인합니다.</p>
              </header>
              <RulesChecklist value={rules} onChange={setRules} />
            </section>

            <div className="rank-new-actions">
              <button type="button" className="rank-new-ghost" onClick={() => router.back()}>
                취소
              </button>
              <button type="button" className="rank-new-primary" onClick={onSubmit} disabled={!canSubmit}>
                게임 등록
              </button>
            </div>
          </main>
        </div>
      </div>

      <style jsx>{`
        .rank-new-page {
          min-height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          padding: 48px 20px 72px;
        }
        .rank-new-shell {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          gap: 32px;
        }
        .rank-new-header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .rank-new-header-text {
          display: grid;
          gap: 12px;
          max-width: 720px;
        }
        .rank-new-header-text h1 {
          margin: 0;
          font-size: 30px;
          font-weight: 800;
        }
        .rank-new-header-text p {
          margin: 0;
          line-height: 1.6;
          color: #475569;
        }
        .rank-new-tabs {
          display: inline-flex;
          align-items: center;
          background: #e2e8f0;
          padding: 4px;
          border-radius: 999px;
          gap: 4px;
        }
        .rank-new-tab {
          border: none;
          background: transparent;
          padding: 8px 16px;
          border-radius: 999px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }
        .rank-new-tab.is-active {
          background: #fff;
          color: #0f172a;
          box-shadow: 0 6px 16px -12px rgba(15, 23, 42, 0.6);
        }
        .rank-new-ghost {
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.15);
          background: rgba(255, 255, 255, 0.9);
          color: #0f172a;
          font-weight: 600;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .rank-new-ghost:hover {
          border-color: rgba(15, 23, 42, 0.35);
          background: #fff;
        }
        .rank-new-body {
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 280px) minmax(0, 1fr);
          align-items: flex-start;
        }
        .rank-new-sidebar {
          display: grid;
          gap: 20px;
          position: sticky;
          top: 96px;
        }
        .rank-new-steps,
        .rank-new-summary {
          background: #fff;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 24px;
          display: grid;
          gap: 20px;
          box-shadow: 0 24px 35px -28px rgba(15, 23, 42, 0.25);
        }
        .rank-new-steps h2,
        .rank-new-summary h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }
        .rank-new-steps ol {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 14px;
        }
        .rank-new-step {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid transparent;
          background: rgba(241, 245, 249, 0.6);
        }
        .rank-new-step.is-complete {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(16, 185, 129, 0.12);
        }
        .rank-new-step-indicator {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #1e293b;
        }
        .rank-new-step.is-complete .rank-new-step-indicator {
          background: #16a34a;
          color: #fff;
        }
        .rank-new-step-title {
          margin: 0;
          font-weight: 600;
          color: #0f172a;
        }
        .rank-new-step-desc {
          margin: 4px 0 0;
          font-size: 13px;
          color: #475569;
        }
        .rank-new-summary dl {
          margin: 0;
          display: grid;
          gap: 12px;
        }
        .rank-new-summary dl div {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }
        .rank-new-summary dt {
          color: #475569;
        }
        .rank-new-summary dd {
          margin: 0;
          font-weight: 600;
          color: #0f172a;
        }
        .rank-new-summary-status {
          margin: 0;
          font-size: 13px;
          color: #2563eb;
        }
        .rank-new-main {
          display: grid;
          gap: 28px;
        }
        .rank-new-section {
          background: #fff;
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          padding: 28px;
          display: grid;
          gap: 20px;
          box-shadow: 0 24px 36px -28px rgba(15, 23, 42, 0.2);
        }
        .rank-new-section header {
          display: grid;
          gap: 6px;
        }
        .rank-new-section h2 {
          margin: 0;
          font-size: 24px;
        }
        .rank-new-section p {
          margin: 0;
          color: #475569;
          line-height: 1.6;
        }
        .rank-new-section-label {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          color: #2563eb;
        }
        .rank-new-field-grid {
          display: grid;
          gap: 16px;
        }
        .rank-new-field {
          display: grid;
          gap: 8px;
          font-size: 14px;
          color: #1e293b;
        }
        .rank-new-field span {
          font-weight: 600;
        }
        .rank-new-field input,
        .rank-new-field textarea {
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.6);
          padding: 12px;
          font-size: 14px;
          color: #0f172a;
          background: rgba(248, 250, 252, 0.9);
        }
        .rank-new-field textarea {
          resize: vertical;
          min-height: 120px;
        }
        .rank-new-upload {
          display: grid;
          gap: 16px;
        }
        .rank-new-upload-preview {
          min-height: 160px;
          border-radius: 16px;
          border: 1px dashed rgba(99, 102, 241, 0.4);
          background: rgba(224, 231, 255, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          color: #4338ca;
          text-align: center;
          padding: 12px;
        }
        .rank-new-upload-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .rank-new-upload-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }
        .rank-new-upload-button {
          position: relative;
          overflow: hidden;
          padding: 10px 18px;
          border-radius: 999px;
          background: linear-gradient(135deg, #4338ca, #6366f1);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .rank-new-upload-button input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .rank-new-upload-hint {
          margin: 0 0 0 auto;
          font-size: 12px;
          color: #6366f1;
        }
        .rank-new-inline {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
        }
        .rank-new-inline .rank-new-field {
          flex: 1 1 220px;
        }
        .rank-new-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(226, 232, 240, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.5);
          font-weight: 600;
          color: #334155;
        }
        .rank-new-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          padding-top: 8px;
        }
        .rank-new-primary {
          padding: 12px 22px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          color: white;
          font-weight: 700;
          font-size: 15px;
          box-shadow: 0 18px 30px -18px rgba(37, 99, 235, 0.85);
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }
        .rank-new-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }
        .rank-new-primary:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 38px -18px rgba(37, 99, 235, 0.95);
        }
        @media (max-width: 1023px) {
          .rank-new-body {
            grid-template-columns: minmax(0, 1fr);
          }
          .rank-new-sidebar {
            position: static;
            order: 2;
          }
          .rank-new-main {
            order: 1;
          }
        }
        @media (max-width: 639px) {
          .rank-new-page {
            padding: 32px 16px 56px;
          }
          .rank-new-section {
            padding: 22px;
          }
          .rank-new-header-text h1 {
            font-size: 26px;
          }
          .rank-new-tabs {
            width: 100%;
            justify-content: space-between;
          }
          .rank-new-actions {
            flex-direction: column;
          }
          .rank-new-actions button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
