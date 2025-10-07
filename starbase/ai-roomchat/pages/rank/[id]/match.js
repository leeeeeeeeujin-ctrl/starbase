'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

import { useGameRoom } from '../../../hooks/useGameRoom'

export default function RankMatchQueuePage() {
  const router = useRouter()
  const { id } = router.query
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleRequireLogin = useCallback(() => {
    router.replace('/')
  }, [router])

  const handleGameMissing = useCallback(() => {
    alert('게임을 찾을 수 없습니다.')
    router.replace('/rank')
  }, [router])

  const handleDeleted = useCallback(() => {
    router.replace('/rank')
  }, [router])

  const {
    state: { loading, game, participants = [], roles = [], myHero, user: currentUser },
    derived: { myEntry, roleOccupancy = [] },
  } = useGameRoom(id, {
    onRequireLogin: handleRequireLogin,
    onGameMissing: handleGameMissing,
    onDeleted: handleDeleted,
  })

  const ready = mounted && !loading

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>랭크 자동 매칭 준비 정보를 불러오는 중…</div>
  }

  const {
    queueTitle,
    metaDescription,
  } = useMemo(() => {
    const fallbackTitle = '랭크 자동 매칭'
    const fallbackDescription =
      '게임 정원, 점수 범위, 역할 조건을 차례로 확인하며 안정적인 자동 매칭을 준비합니다.'

    const rawName = typeof game?.name === 'string' ? game.name.trim() : ''
    const title = rawName ? `${rawName} 자동 매칭 준비` : fallbackTitle

    const descriptionSources = [
      typeof game?.match_queue_description === 'string'
        ? game.match_queue_description.trim()
        : '',
      typeof game?.description === 'string' ? game.description.trim() : '',
    ]
    const mergedDescription = descriptionSources.find((value) => value.length) || fallbackDescription
    const normalizedMetaDescription =
      mergedDescription.length > 160 ? `${mergedDescription.slice(0, 157)}…` : mergedDescription

    return {
      queueTitle: title,
      metaDescription: normalizedMetaDescription,
    }
  }, [game])

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  const [step, setStep] = useState(0)

  const steps = ['기본 정보 확인', '자리 추천 계산', '최종 점검']

  const totalCapacity = useMemo(() => {
    if (Array.isArray(roleOccupancy) && roleOccupancy.length) {
      let sum = 0
      let hasKnown = false
      roleOccupancy.forEach((entry) => {
        if (!entry) return
        const numericTotal = Number.isFinite(Number(entry.totalSlots)) ? Number(entry.totalSlots) : null
        const numericCapacity = Number.isFinite(Number(entry.capacity)) ? Number(entry.capacity) : null
        const base = numericTotal ?? numericCapacity
        if (base != null) {
          sum += base
          hasKnown = true
        }
      })
      if (hasKnown) return sum
    }

    if (Array.isArray(roles) && roles.length) {
      const computed = roles.reduce((acc, role) => {
        const raw = Number(role?.slot_count ?? role?.slotCount ?? role?.capacity)
        if (Number.isFinite(raw) && raw > 0) {
          return acc + raw
        }
        return acc
      }, 0)
      if (computed > 0) return computed
    }

    if (Array.isArray(participants) && participants.length) {
      return participants.length
    }

    return null
  }, [participants, roleOccupancy, roles])

  const myRating = useMemo(() => {
    const raw = Number(myEntry?.rating ?? myEntry?.score)
    return Number.isFinite(raw) ? raw : null
  }, [myEntry])

  const ratingWindow = useMemo(() => {
    if (myRating == null) return null
    return { min: myRating - 100, max: myRating + 100 }
  }, [myRating])

  const matchingPlan = useMemo(() => {
    if (!Array.isArray(roleOccupancy) || !roleOccupancy.length || !Array.isArray(participants)) {
      return null
    }

    const planByRole = []
    let everySeatFilled = true
    let outOfRangeCount = 0

    const viewerId = myEntry?.id ?? null

    const computeSeatLimit = (entry) => {
      if (!entry) return null
      const numericTotal = Number.isFinite(Number(entry.totalSlots)) ? Number(entry.totalSlots) : null
      const numericCapacity = Number.isFinite(Number(entry.capacity)) ? Number(entry.capacity) : null
      const resolved = numericTotal ?? numericCapacity
      return Number.isFinite(resolved) && resolved >= 0 ? resolved : null
    }

    const sortedParticipants = [...participants].map((participant) => {
      const rating = Number(participant?.rating)
      const normalizedRating = Number.isFinite(rating) ? rating : null
      const diff = normalizedRating != null && myRating != null ? Math.abs(normalizedRating - myRating) : null
      const within = ratingWindow
        ? normalizedRating != null && normalizedRating >= ratingWindow.min && normalizedRating <= ratingWindow.max
        : true
      return {
        participant,
        normalizedRating,
        diff,
        within,
        isViewer: viewerId != null && participant?.id === viewerId,
      }
    })

    sortedParticipants.sort((a, b) => {
      if (a.isViewer && !b.isViewer) return -1
      if (!a.isViewer && b.isViewer) return 1
      const aDiff = a.diff ?? Number.POSITIVE_INFINITY
      const bDiff = b.diff ?? Number.POSITIVE_INFINITY
      if (aDiff !== bDiff) return aDiff - bDiff
      if (a.normalizedRating != null && b.normalizedRating != null) {
        return b.normalizedRating - a.normalizedRating
      }
      return 0
    })

    roleOccupancy.forEach((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
      if (!name) return

      const seatLimit = computeSeatLimit(entry)
      const bucket = sortedParticipants.filter((item) => {
        const roleName = typeof item?.participant?.role === 'string' ? item.participant.role.trim() : ''
        return roleName === name
      })

      const preferred = bucket.filter((item) => item.within)
      const fallback = bucket.filter((item) => !item.within)

      const picks = []

      const viewerPick = preferred.find((item) => item.isViewer)
      if (viewerPick) {
        picks.push(viewerPick)
      }

      const tryFill = (collection) => {
        collection.forEach((item) => {
          if (seatLimit != null && picks.length >= seatLimit) return
          if (picks.includes(item)) return
          picks.push(item)
        })
      }

      preferred.sort((a, b) => {
        const aDiff = a.diff ?? Number.POSITIVE_INFINITY
        const bDiff = b.diff ?? Number.POSITIVE_INFINITY
        if (aDiff !== bDiff) return aDiff - bDiff
        return (b.normalizedRating ?? 0) - (a.normalizedRating ?? 0)
      })

      fallback.sort((a, b) => {
        const aDiff = a.diff ?? Number.POSITIVE_INFINITY
        const bDiff = b.diff ?? Number.POSITIVE_INFINITY
        if (aDiff !== bDiff) return aDiff - bDiff
        return (b.normalizedRating ?? 0) - (a.normalizedRating ?? 0)
      })

      tryFill(preferred)
      tryFill(fallback)

      const missing = seatLimit != null ? Math.max(seatLimit - picks.length, 0) : 0
      if (missing > 0) {
        everySeatFilled = false
      }

      const outOfRangeInRole = picks.filter((item) => !item.within).length
      outOfRangeCount += outOfRangeInRole

      planByRole.push({
        name,
        seatLimit,
        picks,
        missing,
        totalCandidates: bucket.length,
        outOfRange: outOfRangeInRole,
      })
    })

    return {
      roles: planByRole,
      ready: planByRole.length > 0 && everySeatFilled,
      outOfRangeCount,
    }
  }, [myEntry?.id, myRating, participants, ratingWindow, roleOccupancy])

  const renderParticipantChip = (item) => {
    if (!item?.participant) return null
    const heroName = typeof item.participant?.hero?.name === 'string' ? item.participant.hero.name.trim() : ''
    const roleName = typeof item.participant?.role === 'string' ? item.participant.role.trim() : ''
    const ratingLabel = item.normalizedRating != null ? `${item.normalizedRating}` : '점수 정보 없음'
    const diffLabel = item.diff != null ? `Δ${item.diff}` : ''
    const viewerBadge = item.isViewer ? ' (나)' : ''
    const withinBadge = item.within ? '' : ' · 범위 밖'
    const label = heroName || roleName || `참가자 ${item.participant?.id?.slice(-4) || ''}`
    return (
      <div
        key={item.participant.id}
        style={{
          background: item.isViewer ? '#1c2541' : item.within ? '#19202e' : '#3f1c1c',
          border: item.isViewer ? '1px solid #7aa2ff' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 160,
        }}
      >
        <strong style={{ color: '#f4f6fb', fontSize: 14 }}>{label}{viewerBadge}</strong>
        <span style={{ color: '#9da9c2', fontSize: 12 }}>{roleName || '역할 미정'}</span>
        <span style={{ color: '#c7d2f0', fontSize: 12 }}>
          {ratingLabel}
          {diffLabel ? ` · ${diffLabel}` : ''}
          {withinBadge}
        </span>
      </div>
    )
  }

  const renderStepContent = () => {
    if (step === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section
            style={{
              background: '#151a24',
              borderRadius: 12,
              padding: 20,
              border: '1px solid rgba(122,162,255,0.2)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: '#f4f6fb', fontSize: 20 }}>{game.name}</h2>
              <p style={{ margin: '8px 0 0', color: '#9da9c2', lineHeight: 1.5 }}>
                {typeof game.description === 'string' && game.description.trim().length
                  ? game.description
                  : '게임 설명이 아직 등록되지 않았습니다.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div
                style={{
                  flex: '1 1 180px',
                  background: '#1b2331',
                  borderRadius: 10,
                  padding: 12,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ color: '#9da9c2', fontSize: 12 }}>게임 정원</div>
                <div style={{ color: '#f4f6fb', fontSize: 18, marginTop: 4 }}>
                  {totalCapacity != null ? `${totalCapacity}명` : '정원 정보 없음'}
                </div>
              </div>
              <div
                style={{
                  flex: '1 1 180px',
                  background: '#1b2331',
                  borderRadius: 10,
                  padding: 12,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ color: '#9da9c2', fontSize: 12 }}>내 점수</div>
                <div style={{ color: '#f4f6fb', fontSize: 18, marginTop: 4 }}>
                  {myRating != null ? myRating : '점수 정보 없음'}
                </div>
              </div>
              <div
                style={{
                  flex: '1 1 180px',
                  background: '#1b2331',
                  borderRadius: 10,
                  padding: 12,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ color: '#9da9c2', fontSize: 12 }}>선택한 영웅</div>
                <div style={{ color: '#f4f6fb', fontSize: 18, marginTop: 4 }}>
                  {myHero?.name || '선택된 영웅 없음'}
                </div>
              </div>
              <div
                style={{
                  flex: '1 1 180px',
                  background: '#1b2331',
                  borderRadius: 10,
                  padding: 12,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ color: '#9da9c2', fontSize: 12 }}>배정 역할</div>
                <div style={{ color: '#f4f6fb', fontSize: 18, marginTop: 4 }}>
                  {myEntry?.role || '배정된 역할 없음'}
                </div>
              </div>
            </div>
            {ratingWindow ? (
              <div style={{ color: '#9da9c2', fontSize: 13 }}>
                추천 매칭 점수 범위: {ratingWindow.min} ~ {ratingWindow.max}
              </div>
            ) : (
              <div style={{ color: '#d4a657', fontSize: 13 }}>
                점수 정보가 없어 범위 기반 추천이 제한됩니다.
              </div>
            )}
            {!myEntry && (
              <div style={{ color: '#ff8c82', fontSize: 13 }}>
                아직 게임에 참가하지 않아 역할 기반 자동 매칭을 적용하기 어렵습니다. 메인 룸에서 역할을 먼저 확정해 주세요.
              </div>
            )}
            {currentUser?.id ? null : (
              <div style={{ color: '#ff8c82', fontSize: 13 }}>
                로그인 정보를 확인할 수 없어 매칭 진행이 중단됩니다.
              </div>
            )}
          </section>
        </div>
      )
    }

    if (step === 1) {
      if (!matchingPlan) {
        return (
          <div
            style={{
              background: '#1b2331',
              borderRadius: 12,
              padding: 20,
              color: '#f4f6fb',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            역할별 자리 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )
      }

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {matchingPlan.roles.map((rolePlan) => (
            <section
              key={rolePlan.name}
              style={{
                background: '#151a24',
                borderRadius: 12,
                padding: 20,
                border: '1px solid rgba(122,162,255,0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#f4f6fb', fontSize: 18 }}>{rolePlan.name}</h3>
                <span style={{ color: '#9da9c2', fontSize: 13 }}>
                  정원 {rolePlan.seatLimit != null ? `${rolePlan.seatLimit}명` : '정보 없음'}
                </span>
              </header>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {rolePlan.picks.length ? (
                  rolePlan.picks.map((item) => renderParticipantChip(item))
                ) : (
                  <span style={{ color: '#9da9c2', fontSize: 13 }}>추천할 참가자가 없습니다.</span>
                )}
              </div>
              <footer style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: rolePlan.missing > 0 ? '#ff8c82' : '#7aa2ff', fontSize: 13 }}>
                  {rolePlan.missing > 0
                    ? `남은 자리 ${rolePlan.missing}명`
                    : '필요 정원을 모두 채웠습니다.'}
                </span>
                {rolePlan.outOfRange > 0 && (
                  <span style={{ color: '#d4a657', fontSize: 13 }}>
                    점수 범위 밖 인원 {rolePlan.outOfRange}명 포함
                  </span>
                )}
              </footer>
            </section>
          ))}
        </div>
      )
    }

    const ready = matchingPlan?.ready
    const issues = []
    if (matchingPlan?.outOfRangeCount) {
      issues.push(`점수 범위 밖 인원 ${matchingPlan.outOfRangeCount}명`)
    }
    if (matchingPlan?.roles?.some((role) => role.missing > 0)) {
      const totalMissing = matchingPlan.roles.reduce((acc, role) => acc + role.missing, 0)
      issues.push(`남은 자리 ${totalMissing}명`)
    }

    return (
      <section
        style={{
          background: '#151a24',
          borderRadius: 12,
          padding: 24,
          border: '1px solid rgba(122,162,255,0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <h3 style={{ margin: 0, color: '#f4f6fb', fontSize: 20 }}>최종 점검</h3>
        <p style={{ margin: 0, color: '#9da9c2', lineHeight: 1.6 }}>
          역할별 추천 명단을 기반으로 자동 매칭 준비를 완료합니다. 아래 상태를 확인한 뒤 전투를 시작하세요.
        </p>
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          <div
            style={{
              background: ready ? '#1c2a3f' : '#2c1f1f',
              border: ready ? '1px solid rgba(122,162,255,0.4)' : '1px solid rgba(255,140,130,0.4)',
              borderRadius: 12,
              padding: 16,
              color: '#f4f6fb',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 15 }}>{ready ? '매칭 준비 완료' : '추가 조정 필요'}</strong>
            <span style={{ color: '#c7d2f0', fontSize: 13 }}>
              {ready
                ? '모든 역할 정원을 충족했고 점수 범위도 안정권입니다.'
                : issues.length
                ? issues.join(' · ')
                : '추천 명단이 충분하지 않아 추가 인원이 필요합니다.'}
            </span>
          </div>
          <div
            style={{
              background: '#1b2331',
              borderRadius: 12,
              padding: 16,
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ color: '#f4f6fb', fontSize: 15 }}>추천 명단 요약</strong>
            <ul style={{ margin: 0, padding: '0 0 0 18px', color: '#9da9c2', fontSize: 13, lineHeight: 1.6 }}>
              {matchingPlan?.roles?.map((role) => (
                <li key={role.name}>
                  {role.name}: {role.picks.length}명 추천{role.seatLimit != null ? ` / 정원 ${role.seatLimit}명` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!ready) {
              setStep(1)
              return
            }
            router.push(`/rank/${id}/start`).catch((err) => {
              console.warn('매칭 시작 경로 이동 실패:', err)
            })
          }}
          style={{
            marginTop: 8,
            padding: '12px 18px',
            borderRadius: 10,
            border: 'none',
            background: ready ? '#4361ee' : '#2c354a',
            color: ready ? '#f4f6fb' : '#9da9c2',
            fontSize: 15,
            cursor: ready ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s ease',
          }}
          disabled={!ready}
        >
          {ready ? '전투 시작 화면으로 이동' : '추천 명단 재검토하기'}
        </button>
      </section>
    )
  }

  const goToNextStep = () => {
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const goToPreviousStep = () => {
    setStep((prev) => Math.max(prev - 1, 0))
  }

  return (
    <>
      <Head>
        <title>{queueTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={queueTitle} />
        <meta property="og:description" content={metaDescription} />
      </Head>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', color: '#f4f6fb' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>{queueTitle}</h1>
          <p style={{ margin: '8px 0 0', color: '#9da9c2', lineHeight: 1.6 }}>
            게임 정보와 역할 정원을 검토하고 점수 범위에 맞춰 자동으로 추천 명단을 구성합니다.
          </p>
        </header>

        <nav
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          {steps.map((label, index) => {
            const isActive = index === step
            const isCompleted = index < step
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 24,
                  border: isActive ? '1px solid rgba(122,162,255,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: isActive ? '#1c2541' : isCompleted ? '#1b2331' : '#131821',
                  color: isActive ? '#f4f6fb' : '#9da9c2',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                {index + 1}. {label}
              </button>
            )
          })}
        </nav>

        <div>{renderStepContent()}</div>

        <footer
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={goToPreviousStep}
            disabled={step === 0}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
              background: step === 0 ? '#121720' : '#1b2331',
              color: step === 0 ? '#4c566c' : '#f4f6fb',
              cursor: step === 0 ? 'not-allowed' : 'pointer',
              flex: '0 0 auto',
            }}
          >
            이전 단계
          </button>
          <button
            type="button"
            onClick={goToNextStep}
            disabled={step >= steps.length - 1}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: step >= steps.length - 1 ? '#25304a' : '#4361ee',
              color: '#f4f6fb',
              cursor: step >= steps.length - 1 ? 'not-allowed' : 'pointer',
              flex: '0 0 auto',
            }}
          >
            다음 단계
          </button>
        </footer>
      </div>
    </>
  )
}
