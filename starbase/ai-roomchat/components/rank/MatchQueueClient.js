import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import {
  TURN_TIMER_OPTIONS,
  TURN_TIMER_VALUES,
  pickTurnTimer,
} from '../../lib/rank/turnTimers'

import useMatchQueue from './hooks/useMatchQueue'
import styles from './MatchQueueClient.module.css'

function groupQueue(queue) {
  const map = new Map()
  queue.forEach((entry) => {
    const role = entry.role || '역할 미지정'
    if (!map.has(role)) {
      map.set(role, [])
    }
    map.get(role).push(entry)
  })
  return Array.from(map.entries())
}

function resolveHero(heroMap, heroId) {
  if (!heroId) return null
  if (heroMap instanceof Map) {
    return heroMap.get(heroId) || heroMap.get(String(heroId)) || null
  }
  if (heroMap && typeof heroMap === 'object') {
    return heroMap[heroId] || heroMap[String(heroId)] || null
  }
  return null
}

function MemberList({ assignment, heroMap }) {
  if (!assignment) return null
  const members = Array.isArray(assignment.members) ? assignment.members : []
  if (!members.length) return null
  return (
    <ul className={styles.memberList}>
      {members.map((member) => {
        const key =
          member.id || `${member.owner_id || member.ownerId}-${member.hero_id || member.heroId}`
        const heroId = member.hero_id || member.heroId
        const hero = resolveHero(heroMap, heroId)
        const label = hero?.name || member.hero_name || '미지정 영웅'
        const score = member.score ?? member.rating ?? member.mmr
        return (
          <li key={key} className={styles.memberItem}>
            {hero?.image_url ? (
              <img
                className={styles.memberAvatar}
                src={hero.image_url}
                alt={label}
              />
            ) : (
              <div className={styles.memberAvatarPlaceholder} />
            )}
            <div className={styles.memberMeta}>
              <span className={styles.memberName}>{label}</span>
              {Number.isFinite(score) ? (
                <span className={styles.memberScore}>{score}</span>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function TimerVotePanel({ remaining, selected, onSelect, finalTimer }) {
  const normalized = Number(selected)
  const showOptions = finalTimer == null
  return (
    <div className={styles.votePanel}>
      <div className={styles.voteHeader}>
        <h3 className={styles.voteTitle}>턴 제한 투표</h3>
        {showOptions && Number.isFinite(remaining) ? (
          <span className={styles.voteCountdown}>남은 선택 시간 {Math.max(0, remaining)}초</span>
        ) : null}
      </div>
      {showOptions ? (
        <div className={styles.voteOptions}>
          {TURN_TIMER_OPTIONS.map((option) => {
            const value = Number(option.value)
            const active = normalized === value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.voteButton} ${active ? styles.voteButtonActive : ''}`}
                onClick={() => onSelect(value)}
                disabled={remaining != null && remaining <= 0}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      ) : (
        <p className={styles.voteResult}>
          선택된 제한: <strong>{finalTimer}초</strong>
        </p>
      )}
      <p className={styles.voteHint}>
        {showOptions
          ? '15초 안에 선택하지 않으면 이전 설정을 그대로 사용합니다.'
          : '카운트다운이 끝나면 전투 화면으로 이동합니다.'}
      </p>
    </div>
  )
}

function describeStatus(status) {
  switch (status) {
    case 'queued':
      return '매칭 대기 중'
    case 'matched':
      return '매칭 완료'
    default:
      return '자동 참가 준비 중'
  }
}

function resolveFlowSteps(status) {
  const steps = [
    { key: 'prepare', label: '참가 정보 확인', state: 'pending' },
    { key: 'queue', label: '대기열 합류', state: 'pending' },
    { key: 'match', label: '매칭 완료 대기', state: 'pending' },
  ]

  if (status === 'matched') {
    steps[0].state = 'done'
    steps[1].state = 'done'
    steps[2].state = 'active'
    return steps
  }

  if (status === 'queued') {
    steps[0].state = 'done'
    steps[1].state = 'active'
    steps[2].state = 'pending'
    return steps
  }

  steps[0].state = 'active'
  steps[1].state = 'pending'
  steps[2].state = 'pending'
  return steps
}

export default function MatchQueueClient({
  gameId,
  mode,
  title,
  description,
  emptyHint,
  autoJoin = false,
}) {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState('')
  const { state, actions } = useMatchQueue({ gameId, mode, enabled: true })
  const [countdown, setCountdown] = useState(null)
  const countdownTimerRef = useRef(null)
  const navigationLockRef = useRef(false)
  const latestStatusRef = useRef('idle')
  const queueByRole = useMemo(() => groupQueue(state.queue), [state.queue])
  const [autoJoinError, setAutoJoinError] = useState('')
  const autoJoinAttemptedRef = useRef(false)
  const lastHeroAttemptRef = useRef('')

  const [voteRemaining, setVoteRemaining] = useState(null)
  const voteTimerRef = useRef(null)
  const [voteValue, setVoteValue] = useState(() => {
    if (typeof window === 'undefined') return null
    const stored = Number(window.sessionStorage.getItem('rank.start.turnTimerVote'))
    return TURN_TIMER_VALUES.includes(stored) ? stored : null
  })
  const [finalTimer, setFinalTimer] = useState(null)
  const finalTimerResolvedRef = useRef(null)

  useEffect(() => {
    if (state.lockedRole) {
      if (selectedRole !== state.lockedRole) {
        setSelectedRole(state.lockedRole)
      }
      return
    }
    if (selectedRole) return
    if (!state.roles?.length) return
    setSelectedRole(state.roles[0].name)
  }, [state.lockedRole, state.roles, selectedRole])

  useEffect(() => {
    latestStatusRef.current = state.status
  }, [state.status])

  useEffect(() => {
    if (!autoJoin) return
    if (state.status === 'queued' || state.status === 'matched') return
    if (autoJoinAttemptedRef.current) return
    const role = state.lockedRole || state.roles?.[0]?.name
    if (!role) return
    autoJoinAttemptedRef.current = true
    lastHeroAttemptRef.current = state.heroId || ''
    actions.joinQueue(role).then((result) => {
      if (!result?.ok && result?.error) {
        setAutoJoinError(result.error)
      } else {
        setAutoJoinError('')
      }
    })
  }, [autoJoin, state.status, state.lockedRole, state.roles, state.heroId, actions])

  useEffect(() => {
    if (!autoJoin) return
    if (state.status !== 'idle') return
    const currentHero = state.heroId || ''
    if (currentHero && currentHero !== lastHeroAttemptRef.current) {
      autoJoinAttemptedRef.current = false
    }
  }, [autoJoin, state.heroId, state.status])

  useEffect(() => {
    if (state.status === 'queued' || state.status === 'matched') {
      setAutoJoinError('')
    }
  }, [state.status])

  const handleJoin = async () => {
    const role = state.lockedRole || selectedRole
    const result = await actions.joinQueue(role)
    if (!result?.ok && result?.error) {
      alert(result.error)
    }
  }

  const handleCancel = async () => {
    const result = await actions.cancelQueue()
    if (!result?.ok && result?.error) {
      alert(result.error)
    }
  }

  const handleStart = useCallback(() => {
    if (navigationLockRef.current) return
    navigationLockRef.current = true
    setCountdown(null)
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    router.push({ pathname: `/rank/${gameId}/start`, query: { mode } })
  }, [router, gameId, mode])

  const handleBackToRoom = () => {
    router.push(`/rank/${gameId}`)
  }

  useEffect(() => {
    if (state.status === 'matched' && state.match) {
      finalTimerResolvedRef.current = null
      setFinalTimer(null)
      setVoteRemaining(15)
      setCountdown(null)
      if (voteTimerRef.current) {
        clearInterval(voteTimerRef.current)
      }
      voteTimerRef.current = setInterval(() => {
        setVoteRemaining((prev) => {
          if (prev == null) return prev
          if (prev <= 0) return 0
          return prev - 1
        })
      }, 1000)
      return () => {
        if (voteTimerRef.current) {
          clearInterval(voteTimerRef.current)
          voteTimerRef.current = null
        }
      }
    }

    setVoteRemaining(null)
    setFinalTimer(null)
    finalTimerResolvedRef.current = null
    if (voteTimerRef.current) {
      clearInterval(voteTimerRef.current)
      voteTimerRef.current = null
    }
    return () => {}
  }, [state.status, state.match])

  useEffect(() => {
    if (
      state.status !== 'matched' ||
      !state.match ||
      voteRemaining == null ||
      voteRemaining > 0 ||
      finalTimerResolvedRef.current != null
    ) {
      return
    }

    let fallback = 60
    if (typeof window !== 'undefined') {
      const stored = Number(window.sessionStorage.getItem('rank.start.turnTimer'))
      if (TURN_TIMER_VALUES.includes(stored)) {
        fallback = stored
      }
    }

    const voteMap = {}
    if (TURN_TIMER_VALUES.includes(Number(voteValue))) {
      voteMap[Number(voteValue)] = 1
    }

    const resolved = pickTurnTimer(voteMap, fallback)
    finalTimerResolvedRef.current = resolved
    setFinalTimer(resolved)

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('rank.start.turnTimer', String(resolved))
      if (TURN_TIMER_VALUES.includes(Number(voteValue))) {
        window.sessionStorage.setItem('rank.start.turnTimerVote', String(voteValue))
      } else {
        window.sessionStorage.setItem('rank.start.turnTimerVote', String(resolved))
      }
    }

    setCountdown(5)
  }, [state.status, state.match, voteRemaining, voteValue])

  useEffect(() => {
    if (state.status === 'matched' && state.match && finalTimer != null) {
      return
    }
    setCountdown(null)
    navigationLockRef.current = false
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [state.status, state.match, finalTimer])

  useEffect(() => {
    if (countdown == null) return

    if (countdown === 0) {
      setCountdown(null)
      handleStart()
      return
    }

    countdownTimerRef.current = setTimeout(() => {
      setCountdown((prev) => {
        if (prev == null) return prev
        return prev > 0 ? prev - 1 : 0
      })
    }, 1000)

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
    }
  }, [countdown, handleStart])

  useEffect(
    () => () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      if (voteTimerRef.current) {
        clearInterval(voteTimerRef.current)
        voteTimerRef.current = null
      }
      if (latestStatusRef.current === 'queued') {
        actions.cancelQueue()
      }
    },
    [actions],
  )

  const handleTimerVote = (value) => {
    const numeric = Number(value)
    if (!TURN_TIMER_VALUES.includes(numeric)) return
    setVoteValue(numeric)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('rank.start.turnTimerVote', String(numeric))
    }
  }

  const statusLabel = describeStatus(state.status)
  const flowSteps = useMemo(() => resolveFlowSteps(state.status), [state.status])

  const heroLabel = useMemo(() => {
    if (!state.heroId) return '선택된 캐릭터 없음'
    if (state.heroMeta?.name) return state.heroMeta.name
    return state.heroId
  }, [state.heroId, state.heroMeta?.name])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={handleBackToRoom}>
          ← 메인 룸으로 돌아가기
        </button>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{description}</p>
      </header>

      <section className={styles.card}>
        <div className={styles.statusRow}>
          <span className={styles.statusBadge}>{statusLabel}</span>
          <span className={styles.heroBadge}>선택한 캐릭터: {heroLabel}</span>
        </div>

        {autoJoin ? (
          <div className={styles.autoFlow}>
            <div className={styles.autoJoinNotice}>
              <p className={styles.sectionHint}>
                매칭 화면에 진입하는 즉시 대기열에 합류합니다. 필요한 경우 언제든지 취소할 수
                있어요.
              </p>
              {state.lockedRole ? (
                <p className={styles.sectionHint}>
                  현재 역할은 <strong>{state.lockedRole}</strong>로 고정되어 있습니다.
                </p>
              ) : null}
            </div>

            <ol className={styles.autoSteps}>
              {flowSteps.map((step) => (
                <li
                  key={step.key}
                  className={`${styles.autoStep} ${
                    step.state === 'done'
                      ? styles.autoStepDone
                      : step.state === 'active'
                      ? styles.autoStepActive
                      : styles.autoStepPending
                  }`}
                >
                  <span className={styles.autoStepIndicator} />
                  <span className={styles.autoStepLabel}>{step.label}</span>
                </li>
              ))}
            </ol>

            <button
              type="button"
              className={styles.cancelLink}
              onClick={handleCancel}
              disabled={state.loading || state.status !== 'queued'}
            >
              대기열 나가고 메인 룸으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            {state.lockedRole ? (
              <div className={styles.lockedRole}>
                <span className={styles.lockedRoleLabel}>고정된 역할</span>
                <strong className={styles.lockedRoleName}>{state.lockedRole}</strong>
              </div>
            ) : (
              <div className={styles.roleGroup}>
                {state.roles.map((role) => {
                  const active = selectedRole === role.name
                  return (
                    <button
                      key={role.name}
                      type="button"
                      className={`${styles.roleButton} ${active ? styles.roleButtonActive : ''}`}
                      onClick={() => setSelectedRole(role.name)}
                    >
                      <span className={styles.roleName}>{role.name}</span>
                      <span className={styles.roleSlots}>
                        활성 슬롯 {role.slot_count ?? role.slotCount ?? '?'}개
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleJoin}
                disabled={
                  state.loading || (!state.lockedRole && !selectedRole) || state.status === 'queued'
                }
              >
                {state.status === 'queued' ? '대기 중…' : '대기열 참가'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCancel}
                disabled={state.loading || state.status !== 'queued'}
              >
                대기열 나가기
              </button>
            </div>
          </>
        )}

        {state.error || autoJoinError ? (
          <p className={styles.errorText}>{state.error || autoJoinError}</p>
        ) : null}
        {autoJoin &&
        (state.error?.includes('캐릭터') || autoJoinError?.includes('캐릭터')) ? (
          <p className={styles.sectionHint}>
            메인 룸에서 사용할 캐릭터를 선택하면 자동으로 다시 대기열에 합류합니다.
          </p>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>대기열 현황</h2>
        {queueByRole.length === 0 ? (
          <p className={styles.emptyHint}>{emptyHint}</p>
        ) : (
          <div className={styles.queueGrid}>
            {queueByRole.map(([role, entries]) => (
              <div key={role} className={styles.queueColumn}>
                <h3 className={styles.queueRole}>{role}</h3>
                <p className={styles.queueCount}>{entries.length}명 대기 중</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {state.status === 'matched' && state.match ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>매칭 완료</h2>
          <p className={styles.sectionHint}>
            허용 점수 폭 ±{state.match.maxWindow || 0} 내에서 팀이 구성되었습니다.
          </p>
          <div className={styles.matchGrid}>
            {state.match.assignments.map((assignment, index) => (
              <div key={`${assignment.role}-${index}`} className={styles.matchColumn}>
                <h3 className={styles.queueRole}>{assignment.role}</h3>
                <MemberList assignment={assignment} heroMap={state.match.heroMap} />
              </div>
            ))}
          </div>

          <TimerVotePanel
            remaining={voteRemaining}
            selected={voteValue}
            onSelect={handleTimerVote}
            finalTimer={finalTimer}
          />

          {countdown != null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownCircle}>
                <span className={styles.countdownNumber}>
                  {countdown > 0 ? countdown : '시작'}
                </span>
              </div>
              <p className={styles.countdownHint}>
                {finalTimer != null
                  ? `턴 제한 ${finalTimer}초로 시작합니다.`
                  : '곧 전투 화면으로 이동합니다…'}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
