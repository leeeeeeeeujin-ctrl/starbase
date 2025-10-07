'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

import { useGameRoom } from '../../../hooks/useGameRoom'

const uniqueList = (list) => Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)))

const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')

const toFiniteNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export default function RankMatchQueuePage() {
  const router = useRouter()
  const { id } = router.query || {}
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState(0)

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
  const steps = ['기본 정보 검증', '역할별 추천 점검', '최종 안전 확인']

  useEffect(() => {
    if (!ready) {
      return
    }
    setStep((prev) => {
      if (Number.isInteger(prev) && prev >= 0 && prev < steps.length) {
        return prev
      }
      return 0
    })
  }, [ready, steps.length])

  if (!ready) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>랭크 자동 매칭 준비 정보를 불러오는 중…</div>
  }

  if (!game) {
    return <div style={{ padding: 24, color: '#f4f6fb' }}>게임 정보를 찾을 수 없습니다.</div>
  }

  const {
    normalizedParticipants,
    participantDiagnostics,
    viewerParticipant,
    participantsWithoutRole,
  } = useMemo(() => {
    if (!Array.isArray(participants) || !participants.length) {
      return {
        normalizedParticipants: [],
        participantDiagnostics: [],
        viewerParticipant: null,
        participantsWithoutRole: [],
      }
    }

    const normalized = []
    const diagnostics = []
    const seenIds = new Set()
    const seenOwners = new Map()
    let duplicateIdCount = 0
    let duplicateOwnerCount = 0
    let missingRoleCount = 0
    let missingRatingCount = 0

    participants.forEach((raw, index) => {
      const rawId = raw?.id
      const normalizedId = toTrimmedString(rawId) || (typeof rawId === 'number' ? String(rawId) : '')
      const ownerId = raw?.owner_id != null ? String(raw.owner_id) : null
      const fallbackKey = normalizedId || (ownerId ? `owner:${ownerId}` : `idx:${index}`)

      if (normalizedId) {
        if (seenIds.has(normalizedId)) {
          duplicateIdCount += 1
        } else {
          seenIds.add(normalizedId)
        }
      }

      if (ownerId) {
        if (seenOwners.has(ownerId)) {
          duplicateOwnerCount += 1
        } else {
          seenOwners.set(ownerId, index)
        }
      }

      const roleName = toTrimmedString(raw?.role)
      if (!roleName) {
        missingRoleCount += 1
      }

      const heroName = toTrimmedString(raw?.hero?.name)
      const nickname = toTrimmedString(raw?.nickname ?? raw?.profile_nickname ?? raw?.username)
      const displayName =
        heroName ||
        nickname ||
        (roleName ? `${roleName} 참가자` : `참가자 ${fallbackKey.slice(-4) || index + 1}`)

      const rating = toFiniteNumber(raw?.rating)
      const score = toFiniteNumber(raw?.score)
      if (rating == null && score == null) {
        missingRatingCount += 1
      }
      const resolvedRating = rating ?? score ?? null

      const viewerMatchesUser =
        currentUser?.id != null &&
        (ownerId === String(currentUser.id) || toTrimmedString(raw?.user_id) === String(currentUser.id))

      normalized.push({
        id: fallbackKey,
        ownerId,
        rawId: normalizedId || null,
        roleName,
        heroName,
        displayName,
        rating: resolvedRating,
        originalRating: rating,
        originalScore: score,
        status: toTrimmedString(raw?.status),
        isViewer: viewerMatchesUser,
        rawParticipant: raw,
      })
    })

    if (duplicateOwnerCount > 0) {
      diagnostics.push(
        `같은 사용자 ID가 ${duplicateOwnerCount}회 중복되어 한 사용자가 여러 역할에 표시될 수 있습니다.`,
      )
    }
    if (duplicateIdCount > 0) {
      diagnostics.push(
        `중복된 참가자 ID가 ${duplicateIdCount}건 발견되어 데이터 정합성을 다시 확인해야 합니다.`,
      )
    }
    if (missingRoleCount > 0) {
      diagnostics.push(`역할이 비어 있는 참가자 ${missingRoleCount}명이 있어 추천에서 제외됩니다.`)
    }
    if (missingRatingCount > 0) {
      diagnostics.push(
        `점수/레이팅 정보가 없는 참가자 ${missingRatingCount}명은 범위 검증에서 제외됩니다.`,
      )
    }

    const viewer = normalized.find((participant) => participant.isViewer) || null
    const withoutRole = normalized.filter((participant) => !participant.roleName)

    return {
      normalizedParticipants: normalized,
      participantDiagnostics: diagnostics,
      viewerParticipant: viewer,
      participantsWithoutRole: withoutRole,
    }
  }, [currentUser?.id, participants])

  const { normalizedRoles, roleDiagnostics } = useMemo(() => {
    const diagnostics = []
    const map = new Map()
    const order = []

    const ensureRole = (rawName) => {
      const name = toTrimmedString(rawName)
      if (!name) return null
      if (!map.has(name)) {
        map.set(name, {
          name,
          seatLimit: null,
          occupied: null,
          available: null,
          sources: new Set(),
        })
        order.push(name)
      }
      return map.get(name)
    }

    if (Array.isArray(roleOccupancy)) {
      roleOccupancy.forEach((entry) => {
        const roleEntry = ensureRole(entry?.name)
        if (!roleEntry) return
        roleEntry.sources.add('occupancy')
        const seat = toFiniteNumber(entry?.totalSlots ?? entry?.capacity)
        if (seat != null) {
          if (roleEntry.seatLimit != null && roleEntry.seatLimit !== seat) {
            diagnostics.push(
              `[${roleEntry.name}] 역할 정원(${roleEntry.seatLimit})과 점유 데이터(${seat})가 서로 다릅니다.`,
            )
          }
          roleEntry.seatLimit = seat
        }
        const occupied = toFiniteNumber(entry?.occupiedSlots ?? entry?.filledSlots)
        if (occupied != null) {
          roleEntry.occupied = occupied
        }
        const available = toFiniteNumber(entry?.availableSlots ?? entry?.remainingSlots)
        if (available != null) {
          roleEntry.available = available
        }
      })
    }

    if (Array.isArray(roles)) {
      roles.forEach((role) => {
        const name = typeof role === 'string' ? toTrimmedString(role) : toTrimmedString(role?.name)
        if (!name) return
        const roleEntry = ensureRole(name)
        if (!roleEntry) return
        roleEntry.sources.add('roles')
        const seat = toFiniteNumber(role?.slot_count ?? role?.slotCount ?? role?.capacity)
        if (seat != null) {
          if (roleEntry.seatLimit != null && roleEntry.seatLimit !== seat) {
            diagnostics.push(`[${name}] 역할 설정의 정원 값이 일치하지 않습니다.`)
          }
          roleEntry.seatLimit = seat
        }
      })
    }

    if (!map.size && Array.isArray(participants)) {
      participants.forEach((participant) => {
        ensureRole(participant?.role)
      })
    }

    const normalized = order
      .map((name) => {
        const entry = map.get(name)
        if (!entry) return null
        const seatLimit = entry.seatLimit != null && entry.seatLimit >= 0 ? entry.seatLimit : null
        if (entry.seatLimit != null && entry.seatLimit < 0) {
          diagnostics.push(`[${name}] 정원이 음수로 보고되어 무시했습니다.`)
        }
        const occupied = entry.occupied != null && entry.occupied >= 0 ? entry.occupied : null
        const available = entry.available != null && entry.available >= 0 ? entry.available : null
        if (seatLimit != null && occupied != null && occupied > seatLimit) {
          diagnostics.push(`[${name}] 점유된 좌석(${occupied})이 정원(${seatLimit})을 초과합니다.`)
        }
        return {
          name,
          seatLimit,
          occupied,
          available,
        }
      })
      .filter(Boolean)

    return {
      normalizedRoles: normalized,
      roleDiagnostics: uniqueList(diagnostics),
    }
  }, [participants, roleOccupancy, roles])

  const totalCapacity = useMemo(() => {
    if (normalizedRoles.length) {
      const sum = normalizedRoles.reduce((acc, role) => {
        if (role.seatLimit != null) {
          return acc + role.seatLimit
        }
        return acc
      }, 0)
      if (sum > 0) {
        return sum
      }
    }

    if (Array.isArray(participants) && participants.length) {
      return participants.length
    }

    return null
  }, [normalizedRoles, participants])

  const derivedMyRating = useMemo(() => {
    const primary = toFiniteNumber(myEntry?.rating ?? myEntry?.score)
    if (primary != null) {
      return primary
    }
    if (viewerParticipant?.rating != null) {
      return viewerParticipant.rating
    }
    return null
  }, [myEntry, viewerParticipant?.rating])

  const ratingWindow = useMemo(() => {
    if (derivedMyRating == null) return null
    return {
      min: Math.round(derivedMyRating - 100),
      max: Math.round(derivedMyRating + 100),
    }
  }, [derivedMyRating])

  function buildParticipantChip(participant, overrides = {}) {
    if (!participant) return null
    const rating = participant.rating != null ? participant.rating : null
    const diff =
      rating != null && derivedMyRating != null ? Math.abs(rating - derivedMyRating) : null
    const within =
      ratingWindow && rating != null
        ? rating >= ratingWindow.min && rating <= ratingWindow.max
        : ratingWindow
        ? false
        : true
    const lacksRating = ratingWindow != null && rating == null
    return {
      id: participant.id,
      displayName: participant.displayName,
      roleName: participant.roleName,
      heroName: participant.heroName,
      rating,
      diff,
      within,
      lacksRating,
      isViewer: participant.isViewer,
      ...overrides,
    }
  }

  const preflightWarnings = useMemo(() => {
    const warnings = [...participantDiagnostics, ...roleDiagnostics]
    if (participantsWithoutRole.length > 0) {
      warnings.push(
        `역할이 지정되지 않은 참가자 ${participantsWithoutRole.length}명은 추천 계산에서 제외했습니다.`,
      )
    }
    const viewerRoleFromEntry = toTrimmedString(myEntry?.role)
    if (
      viewerParticipant?.roleName &&
      viewerRoleFromEntry &&
      viewerParticipant.roleName !== viewerRoleFromEntry
    ) {
      warnings.push('메인 룸과 참가자 목록에서 내 역할 이름이 서로 달라 추가 확인이 필요합니다.')
    }
    if (
      viewerParticipant &&
      viewerParticipant.rating != null &&
      derivedMyRating != null &&
      viewerParticipant.rating !== derivedMyRating
    ) {
      warnings.push('내 점수 정보가 참가자 목록과 내 기록에서 서로 다릅니다.')
    }
    return uniqueList(warnings)
  }, [
    derivedMyRating,
    myEntry?.role,
    participantDiagnostics,
    participantsWithoutRole.length,
    roleDiagnostics,
    viewerParticipant,
  ])

  const fatalIssues = useMemo(() => {
    const issues = []
    if (!currentUser?.id) {
      issues.push('로그인 정보를 확인할 수 없어 자동 매칭을 진행할 수 없습니다.')
    }
    if (!myHero?.id) {
      issues.push('메인 룸에서 사용할 영웅을 선택한 뒤 다시 시도하세요.')
    }
    if (!viewerParticipant) {
      issues.push('참가자 목록에서 내 정보를 찾을 수 없어 역할 배정을 검증할 수 없습니다.')
    } else if (!viewerParticipant.roleName) {
      issues.push('내 역할이 지정되지 않아 자동 매칭 기준을 계산할 수 없습니다.')
    }
    return uniqueList(issues)
  }, [currentUser?.id, myHero?.id, viewerParticipant])

  const matchingPlan = useMemo(() => {
    if (!normalizedRoles.length) {
      return null
    }

    const assignedIdentities = new Set()
    const assignedParticipants = new Set()
    const planByRole = []
    const blocking = []
    const advisories = []
    let outOfRangeCount = 0
    let ratingUnknownCount = 0

    normalizedRoles.forEach((role) => {
      const bucket = normalizedParticipants.filter((participant) => participant.roleName === role.name)
      const seatLimit =
        role.seatLimit != null
          ? role.seatLimit
          : role.occupied != null && role.available != null
          ? Math.max(role.occupied + role.available, 0)
          : null
      const availableFromSource = role.available != null ? Math.max(role.available, 0) : null

      const annotated = bucket.map((participant) => {
        const chip = buildParticipantChip(participant)
        return {
          participant,
          chip,
          identity: participant.ownerId || participant.id,
        }
      })

      const withinPreferred = annotated.filter((entry) => entry?.chip?.within)
      const fallback = annotated.filter((entry) => !entry?.chip?.within)

      const sortEntries = (a, b) => {
        if (!a?.chip || !b?.chip) return 0
        if (a.chip.isViewer && !b.chip.isViewer) return -1
        if (!a.chip.isViewer && b.chip.isViewer) return 1
        const diffA = a.chip.diff ?? Number.POSITIVE_INFINITY
        const diffB = b.chip.diff ?? Number.POSITIVE_INFINITY
        if (diffA !== diffB) return diffA - diffB
        const ratingA = a.chip.rating ?? Number.NEGATIVE_INFINITY
        const ratingB = b.chip.rating ?? Number.NEGATIVE_INFINITY
        if (ratingA !== ratingB) return ratingB - ratingA
        return a.chip.displayName.localeCompare(b.chip.displayName, 'ko')
      }

      withinPreferred.sort(sortEntries)
      fallback.sort(sortEntries)

      const picks = []
      const roleAdvisories = []

      const pushEntry = (entry) => {
        if (!entry?.chip) return
        const { chip, identity, participant } = entry
        if (identity && assignedIdentities.has(identity)) {
          roleAdvisories.push(`${chip.displayName} 참가자가 다른 역할에 이미 배정되어 제외했습니다.`)
          return
        }
        if (seatLimit != null && picks.length >= seatLimit) {
          return
        }
        picks.push(chip)
        if (identity) {
          assignedIdentities.add(identity)
        }
        assignedParticipants.add(participant.id)
        if (!chip.within) {
          outOfRangeCount += 1
        }
        if (chip.lacksRating) {
          ratingUnknownCount += 1
        }
      }

      const viewerEntry =
        withinPreferred.find((entry) => entry?.chip?.isViewer) ||
        fallback.find((entry) => entry?.chip?.isViewer)

      if (viewerEntry) {
        pushEntry(viewerEntry)
      }

      withinPreferred.forEach((entry) => {
        if (entry === viewerEntry) return
        pushEntry(entry)
      })

      fallback.forEach((entry) => {
        if (entry === viewerEntry) return
        pushEntry(entry)
      })

      const missing =
        availableFromSource != null
          ? availableFromSource
          : seatLimit != null
          ? Math.max(seatLimit - picks.length, 0)
          : null

      if (missing != null && missing > 0) {
        blocking.push(`[${role.name}] 남은 자리 ${missing}명`)
      }

      if (!bucket.length) {
        if (seatLimit != null && seatLimit > 0) {
          blocking.push(`[${role.name}] 참가자가 없어 정원을 채우지 못했습니다.`)
        } else {
          advisories.push(`[${role.name}] 참가자가 없어 확인이 필요합니다.`)
        }
      }

      const outOfRangeForRole = picks.filter((chip) => !chip.within).length
      if (outOfRangeForRole > 0) {
        blocking.push(`[${role.name}] 점수 범위 밖 인원 ${outOfRangeForRole}명`)
      }

      const unknownRatingForRole = picks.filter((chip) => chip.lacksRating).length
      if (unknownRatingForRole > 0) {
        advisories.push(
          `[${role.name}] 점수 정보가 없는 참가자 ${unknownRatingForRole}명이 임시로 포함되었습니다.`,
        )
      }

      if (seatLimit == null) {
        advisories.push(`[${role.name}] 공식 정원 정보가 없어 남은 인원을 추산했습니다.`)
      }

      roleAdvisories.forEach((message) => {
        advisories.push(`[${role.name}] ${message}`)
      })

      planByRole.push({
        name: role.name,
        seatLimit,
        availableSlots: availableFromSource,
        occupiedSlots: role.occupied != null ? Math.max(role.occupied, 0) : null,
        picks,
        totalCandidates: bucket.length,
        missing,
        outOfRange: outOfRangeForRole,
        unknownRatingPicks: unknownRatingForRole,
      })
    })

    const unassignedRoleMembers = normalizedParticipants.filter(
      (participant) => participant.roleName && !assignedParticipants.has(participant.id),
    )

    if (unassignedRoleMembers.length) {
      advisories.push(
        `정원에 배치되지 않은 참가자 ${unassignedRoleMembers.length}명이 있어 수동 확인이 필요합니다.`,
      )
    }

    return {
      roles: planByRole,
      ready: planByRole.length > 0 && blocking.length === 0,
      blockingReasons: uniqueList(blocking),
      advisoryNotes: uniqueList(advisories),
      outOfRangeCount,
      ratingUnknownCount,
      unassignedRoleMembers,
    }
  }, [buildParticipantChip, normalizedParticipants, normalizedRoles])

  const aggregatedWarnings = useMemo(
    () => uniqueList([...preflightWarnings, ...(matchingPlan?.advisoryNotes ?? [])]),
    [matchingPlan?.advisoryNotes, preflightWarnings],
  )

  const blockingReasons = useMemo(() => {
    const combined = [...fatalIssues]
    if (!matchingPlan) {
      combined.push('역할별 정원 정보를 찾을 수 없어 추천을 구성하지 못했습니다.')
    } else {
      combined.push(...(matchingPlan.blockingReasons || []))
    }
    return uniqueList(combined)
  }, [fatalIssues, matchingPlan])

  const readyForStart = blockingReasons.length === 0 && !!matchingPlan && matchingPlan.ready

  const stepAccess = useMemo(
    () => [
      true,
      fatalIssues.length === 0,
      fatalIssues.length === 0 && !!matchingPlan && (matchingPlan.roles?.length ?? 0) > 0,
    ],
    [fatalIssues.length, matchingPlan],
  )

  useEffect(() => {
    setStep((prev) => {
      if (stepAccess[prev]) {
        return prev
      }
      for (let index = prev; index >= 0; index -= 1) {
        if (stepAccess[index]) {
          return index
        }
      }
      return 0
    })
  }, [stepAccess])

  const handleNavClick = (index) => {
    setStep((prev) => {
      if (index === prev) return prev
      if (index > prev && !stepAccess[index]) {
        return prev
      }
      return index
    })
  }

  const goToNextStep = () => {
    setStep((prev) => {
      const target = Math.min(prev + 1, steps.length - 1)
      if (target === prev) return prev
      if (!stepAccess[target]) {
        return prev
      }
      return target
    })
  }

  const goToPreviousStep = () => {
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const {
    queueTitle,
    metaDescription,
  } = useMemo(() => {
    const fallbackTitle = '랭크 자동 매칭'
    const fallbackDescription =
      '게임 정원, 점수 범위, 역할 조건을 차례로 검증하며 안전한 자동 매칭을 준비합니다.'

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

  const viewerRoleName = viewerParticipant?.roleName || toTrimmedString(myEntry?.role)

  const renderParticipantChip = (item) => {
    if (!item) return null
    const key = item.id || item.displayName
    const subLabel = item.heroName || item.roleName || '역할 미정'
    const ratingLabel =
      item.rating != null ? `${item.rating}` : ratingWindow ? '점수 확인 필요' : '점수 정보 없음'
    const metaParts = []
    if (item.diff != null) {
      metaParts.push(`Δ${item.diff}`)
    }
    if (!item.within && ratingWindow) {
      metaParts.push('범위 밖')
    }
    if (item.lacksRating && ratingWindow) {
      metaParts.push('점수 미기록')
    }
    if (item.note) {
      metaParts.push(item.note)
    }
    return (
      <div
        key={key}
        style={{
          background: item.isViewer ? '#1c2541' : item.within ? '#19202e' : '#3f1c1c',
          border: item.isViewer ? '1px solid #7aa2ff' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 180,
        }}
      >
        <strong style={{ color: '#f4f6fb', fontSize: 14 }}>
          {item.displayName}
          {item.isViewer ? ' (나)' : ''}
        </strong>
        <span style={{ color: '#9da9c2', fontSize: 12 }}>{subLabel}</span>
        <span style={{ color: '#c7d2f0', fontSize: 12 }}>
          {ratingLabel}
          {metaParts.length ? ` · ${metaParts.join(' · ')}` : ''}
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
              gap: 16,
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
                  {derivedMyRating != null ? derivedMyRating : '점수 정보 없음'}
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
                  {viewerRoleName || '배정된 역할 없음'}
                </div>
              </div>
            </div>
            {ratingWindow ? (
              <div style={{ color: '#9da9c2', fontSize: 13 }}>
                추천 매칭 점수 범위: {ratingWindow.min} ~ {ratingWindow.max}
              </div>
            ) : (
              <div style={{ color: '#d4a657', fontSize: 13 }}>
                점수 기준을 계산할 수 없어 범위 검증이 비활성화됩니다.
              </div>
            )}
            {fatalIssues.length > 0 && (
              <div
                style={{
                  background: '#2c1f1f',
                  borderRadius: 10,
                  padding: 14,
                  border: '1px solid rgba(255,140,130,0.4)',
                  color: '#ffb4a8',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>진행 차단 요소</strong>
                <ul style={{ margin: 0, padding: '0 0 0 18px', lineHeight: 1.5, fontSize: 13 }}>
                  {fatalIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
            {preflightWarnings.length > 0 && (
              <div
                style={{
                  background: '#2a2620',
                  borderRadius: 10,
                  padding: 14,
                  border: '1px solid rgba(212,166,87,0.3)',
                  color: '#e4c48b',
                }}
              >
                <strong style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>추가 확인이 필요한 항목</strong>
                <ul style={{ margin: 0, padding: '0 0 0 18px', lineHeight: 1.5, fontSize: 13 }}>
                  {preflightWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )
    }

    if (step === 1) {
      if (!matchingPlan || !matchingPlan.roles.length) {
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
            역할별 정원 정보를 찾을 수 없어 추천을 구성하지 못했습니다. 메인 룸 데이터를 새로고침한 뒤 다시 시도해 주세요.
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
                {rolePlan.availableSlots != null && (
                  <span style={{ color: '#9da9c2', fontSize: 13 }}>
                    남은 공식 슬롯: {rolePlan.availableSlots}명
                  </span>
                )}
                <span style={{ color: rolePlan.missing > 0 ? '#ff8c82' : '#7aa2ff', fontSize: 13 }}>
                  {rolePlan.missing != null
                    ? rolePlan.missing > 0
                      ? `남은 자리 ${rolePlan.missing}명`
                      : '필요 정원을 모두 채웠습니다.'
                    : '정원 정보가 없어 남은 인원을 추정했습니다.'}
                </span>
                {rolePlan.outOfRange > 0 && (
                  <span style={{ color: '#d4a657', fontSize: 13 }}>
                    점수 범위 밖 인원 {rolePlan.outOfRange}명 포함
                  </span>
                )}
                {rolePlan.unknownRatingPicks > 0 && (
                  <span style={{ color: '#d4a657', fontSize: 13 }}>
                    점수 미기록 참가자 {rolePlan.unknownRatingPicks}명은 범위 검증에서 제외되었습니다.
                  </span>
                )}
              </footer>
            </section>
          ))}

          {matchingPlan.unassignedRoleMembers.length > 0 && (
            <section
              style={{
                background: '#1c2230',
                borderRadius: 12,
                padding: 18,
                border: '1px solid rgba(122,162,255,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <strong style={{ color: '#f4f6fb', fontSize: 15 }}>정원에 배치되지 않은 참가자</strong>
              <p style={{ margin: 0, color: '#9da9c2', fontSize: 13, lineHeight: 1.5 }}>
                자동 추천에 포함되지 않은 참가자는 수동으로 조정하거나 점수·역할 정보를 보완해야 합니다.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {matchingPlan.unassignedRoleMembers.map((participant) =>
                  renderParticipantChip(buildParticipantChip(participant, { note: '대기 중' })),
                )}
              </div>
            </section>
          )}
        </div>
      )
    }

    const summaryRoles = matchingPlan?.roles ?? []
    const combinedBlocking = blockingReasons
    const combinedWarnings = aggregatedWarnings

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
        <h3 style={{ margin: 0, color: '#f4f6fb', fontSize: 20 }}>최종 안전 확인</h3>
        <p style={{ margin: 0, color: '#9da9c2', lineHeight: 1.6 }}>
          역할별 추천 명단과 데이터 이상 여부를 모두 점검한 뒤 전투를 시작하세요.
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
              background: readyForStart ? '#1c2a3f' : '#2c1f1f',
              border: readyForStart ? '1px solid rgba(122,162,255,0.4)' : '1px solid rgba(255,140,130,0.4)',
              borderRadius: 12,
              padding: 16,
              color: '#f4f6fb',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 15 }}>
              {readyForStart ? '모든 차단 요소를 통과했습니다' : '아직 해결해야 할 항목이 있습니다'}
            </strong>
            <span style={{ color: '#c7d2f0', fontSize: 13 }}>
              {readyForStart
                ? '필수 조건을 모두 충족했습니다. 전투 시작 화면으로 이동해도 안전합니다.'
                : combinedBlocking.length
                ? '아래 차단 요소를 해결한 뒤 다시 시도하세요.'
                : '추천 명단이 충분히 준비되지 않았습니다.'}
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
              {summaryRoles.map((role) => (
                <li key={role.name}>
                  {role.name}: {role.picks.length}명 추천
                  {role.seatLimit != null ? ` / 정원 ${role.seatLimit}명` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {combinedBlocking.length > 0 && (
          <div
            style={{
              background: '#2c1f1f',
              borderRadius: 10,
              padding: 16,
              border: '1px solid rgba(255,140,130,0.4)',
              color: '#ffb4a8',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14 }}>차단 요소</strong>
            <ul style={{ margin: 0, padding: '0 0 0 18px', lineHeight: 1.6, fontSize: 13 }}>
              {combinedBlocking.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {combinedWarnings.length > 0 && (
          <div
            style={{
              background: '#2a2620',
              borderRadius: 10,
              padding: 16,
              border: '1px solid rgba(212,166,87,0.3)',
              color: '#e4c48b',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 14 }}>추가 주의 사항</strong>
            <ul style={{ margin: 0, padding: '0 0 0 18px', lineHeight: 1.6, fontSize: 13 }}>
              {combinedWarnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (!readyForStart) {
              if (fatalIssues.length) {
                setStep(0)
              } else {
                setStep(1)
              }
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
            background: readyForStart ? '#4361ee' : '#2c354a',
            color: readyForStart ? '#f4f6fb' : '#9da9c2',
            fontSize: 15,
            cursor: readyForStart ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s ease',
          }}
          disabled={!readyForStart}
        >
          {readyForStart ? '전투 시작 화면으로 이동' : '차단 요소를 먼저 해결해 주세요'}
        </button>
      </section>
    )
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
            게임 정보와 역할 정원을 검토하고 점수 범위를 확인한 뒤 안전하게 자동 매칭을 시작합니다.
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
            const disabled = index > step && !stepAccess[index]
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleNavClick(index)}
                disabled={disabled}
                style={{
                  padding: '10px 16px',
                  borderRadius: 24,
                  border: isActive
                    ? '1px solid rgba(122,162,255,0.6)'
                    : '1px solid rgba(255,255,255,0.08)',
                  background: isActive ? '#1c2541' : isCompleted ? '#1b2331' : '#131821',
                  color: isActive ? '#f4f6fb' : disabled ? '#4c566c' : '#9da9c2',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  opacity: disabled ? 0.5 : 1,
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
            disabled={step >= steps.length - 1 || !stepAccess[Math.min(step + 1, steps.length - 1)]}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background:
                step >= steps.length - 1 || !stepAccess[Math.min(step + 1, steps.length - 1)]
                  ? '#25304a'
                  : '#4361ee',
              color: '#f4f6fb',
              cursor:
                step >= steps.length - 1 || !stepAccess[Math.min(step + 1, steps.length - 1)]
                  ? 'not-allowed'
                  : 'pointer',
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
