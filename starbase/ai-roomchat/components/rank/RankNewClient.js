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
          <div className="rank-new-heading">
            <p className="rank-new-eyebrow">랭크 게임 운영</p>
            <h1>새 게임 등록</h1>
            <p className="rank-new-subtitle">
              기본 정보와 슬롯 구성을 정리하고 규칙을 확인해 주세요. 필요한 요소를 모두 채우면 우측 요약에서 검토한 뒤 등록할 수 있습니다.
            </p>
          </div>
          <button type="button" className="rank-new-ghost" onClick={() => router.back()}>
            취소하고 돌아가기
          </button>
        </header>

        <div className="rank-new-layout">
          <div className="rank-new-main">
            <section className="rank-new-card">
              <div className="rank-new-card-head">
                <h2>기본 정보</h2>
                <p>매칭 카드에 노출되는 이름과 설명, 대표 이미지를 준비합니다.</p>
              </div>
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
              <div className="rank-new-upload">
                <div className="rank-new-upload-preview">
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

            <section className="rank-new-card">
              <div className="rank-new-card-head">
                <h2>역할 정의</h2>
                <p>참가자에게 배정할 역할과 점수 범위를 정리합니다.</p>
              </div>
              <RolesEditor roles={roles} onChange={setRoles} />
            </section>

            <section className="rank-new-card">
              <div className="rank-new-card-head">
                <h2>슬롯 매핑</h2>
                <p>레이드 슬롯마다 어떤 역할을 사용할지 지정해 주세요.</p>
              </div>
              <SlotMatrix value={slotMap} onChange={setSlotMap} roleOptions={roles.map((role) => role.name)} />
            </section>

            <section className="rank-new-card">
              <div className="rank-new-card-head">
                <h2>체크리스트 규칙</h2>
                <p>균형 조정 옵션과 글자 수 제한을 마무리로 확인합니다.</p>
              </div>
              <RulesChecklist value={rules} onChange={setRules} />
            </section>
          </div>

          <aside className="rank-new-aside">
            <div className="rank-new-summary">
              <h3>요약</h3>
              <dl>
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
                <div>
                  <dt>프롬프트 세트</dt>
                  <dd>{setId ? '선택 완료' : '미선택'}</dd>
                </div>
              </dl>
            </div>

            <div className="rank-new-footer">
              <button type="button" className="rank-new-ghost" onClick={() => router.back()}>
                취소
              </button>
              <button type="button" className="rank-new-primary" onClick={onSubmit}>
                게임 등록
              </button>
            </div>
          </aside>
        </div>
      </div>

      <style jsx>{`
        .rank-new-page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #f8fafc 0%, #e2e8f0 45%, #cbd5f5 100%);
          padding: 56px 20px 72px;
          color: #0f172a;
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
        .rank-new-heading h1 {
          margin: 6px 0;
          font-size: 32px;
          font-weight: 800;
        }
        .rank-new-eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          margin: 0;
        }
        .rank-new-subtitle {
          max-width: 540px;
          line-height: 1.6;
          color: #475569;
          margin: 0;
          font-size: 15px;
        }
        .rank-new-ghost {
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.2);
          background: rgba(255, 255, 255, 0.6);
          color: #0f172a;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .rank-new-ghost:hover {
          border-color: rgba(15, 23, 42, 0.35);
          background: rgba(255, 255, 255, 0.85);
        }
        .rank-new-layout {
          display: grid;
          gap: 28px;
          grid-template-columns: minmax(0, 1fr);
        }
        .rank-new-main {
          display: grid;
          gap: 28px;
        }
        .rank-new-card {
          background: rgba(255, 255, 255, 0.9);
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          box-shadow: 0 25px 45px -20px rgba(15, 23, 42, 0.25);
          padding: 28px;
          display: grid;
          gap: 20px;
        }
        .rank-new-card-head h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }
        .rank-new-card-head p {
          margin: 6px 0 0;
          font-size: 14px;
          color: #475569;
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
          padding: 10px 12px;
          font-size: 14px;
          color: #0f172a;
          background: rgba(255, 255, 255, 0.9);
        }
        .rank-new-field textarea {
          resize: vertical;
          min-height: 100px;
        }
        .rank-new-upload {
          display: grid;
          gap: 16px;
        }
        .rank-new-upload-preview {
          min-height: 140px;
          border-radius: 16px;
          border: 1px dashed rgba(99, 102, 241, 0.5);
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
          font-size: 12px;
          color: #6366f1;
          margin: 0 0 0 auto;
        }
        .rank-new-inline {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: flex-end;
        }
        .rank-new-inline .rank-new-field {
          flex: 1 1 240px;
        }
        .rank-new-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(226, 232, 240, 0.6);
          border: 1px solid rgba(148, 163, 184, 0.5);
          font-weight: 600;
          color: #334155;
        }
        .rank-new-aside {
          display: grid;
          gap: 20px;
          position: sticky;
          top: 32px;
          height: fit-content;
        }
        .rank-new-summary {
          background: rgba(15, 23, 42, 0.86);
          color: #e2e8f0;
          border-radius: 20px;
          padding: 24px;
          display: grid;
          gap: 16px;
          box-shadow: 0 25px 45px -20px rgba(15, 23, 42, 0.55);
        }
        .rank-new-summary h3 {
          margin: 0;
          font-size: 18px;
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
          opacity: 0.7;
        }
        .rank-new-summary dd {
          margin: 0;
          font-weight: 600;
        }
        .rank-new-footer {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        .rank-new-primary {
          padding: 12px 22px;
          border-radius: 999px;
          border: none;
          background: linear-gradient(135deg, #0ea5e9, #2563eb);
          color: white;
          font-weight: 700;
          font-size: 15px;
          box-shadow: 0 18px 35px -18px rgba(37, 99, 235, 0.9);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .rank-new-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 40px -18px rgba(37, 99, 235, 0.95);
        }
        @media (min-width: 1024px) {
          .rank-new-layout {
            grid-template-columns: minmax(0, 3fr) minmax(240px, 1fr);
          }
          .rank-new-aside {
            position: sticky;
            top: 120px;
          }
        }
        @media (max-width: 639px) {
          .rank-new-page {
            padding: 32px 16px 56px;
          }
          .rank-new-card {
            padding: 20px;
          }
          .rank-new-upload-preview {
            min-height: 120px;
          }
          .rank-new-footer {
            justify-content: stretch;
          }
          .rank-new-footer button {
            flex: 1 1 0;
          }
        }
      `}</style>
    </div>
  )
}
