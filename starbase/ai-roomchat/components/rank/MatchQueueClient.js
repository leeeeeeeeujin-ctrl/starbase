import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

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

function MemberList({ assignment, heroMap }) {
  if (!assignment) return null
  const members = Array.isArray(assignment.members) ? assignment.members : []
  if (!members.length) return null
  return (
    <ul className={styles.memberList}>
      {members.map((member) => {
        const key = member.id || `${member.owner_id || member.ownerId}-${member.hero_id || member.heroId}`
        const heroId = member.hero_id || member.heroId
        const hero = heroMap?.get?.(heroId) || null
        const label = hero?.name || '미지정 영웅'
        const score = member.score ?? member.rating ?? member.mmr
        return (
          <li key={key} className={styles.memberItem}>
            <span className={styles.memberName}>{label}</span>
            {Number.isFinite(score) ? (
              <span className={styles.memberScore}>{score}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function MatchQueueClient({ gameId, mode, title, description, emptyHint }) {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState('')
  const { state, actions } = useMatchQueue({ gameId, mode, enabled: true })
  const [countdown, setCountdown] = useState(null)
  const countdownTimerRef = useRef(null)
  const navigationLockRef = useRef(false)
  const queueByRole = useMemo(() => groupQueue(state.queue), [state.queue])

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
      setCountdown((prev) => (prev == null ? 5 : prev))
      return
    }

    setCountdown(null)
    navigationLockRef.current = false
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [state.status, state.match])

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

  useEffect(() => () => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [])

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
        <h2 className={styles.sectionTitle}>참가 설정</h2>
        <div className={styles.heroRow}>
          <p className={styles.sectionHint}>
            선택한 캐릭터: <strong>{state.heroId ? state.heroId : '선택된 캐릭터 없음'}</strong>
          </p>
          <button type="button" className={styles.refreshButton} onClick={actions.refreshHero}>
            새로고침
          </button>
        </div>
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
                  <span className={styles.roleSlots}>활성 슬롯 {role.slot_count ?? role.slotCount ?? '?'}개</span>
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
        {state.error ? <p className={styles.errorText}>{state.error}</p> : null}
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
          <div className={styles.actionRow}>
            <button type="button" className={styles.primaryButton} onClick={handleStart}>
              전투 시작하기
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleCancel}>
              매칭 취소
            </button>
          </div>
          {countdown != null ? (
            <div className={styles.countdownOverlay}>
              <div className={styles.countdownCircle}>
                <span className={styles.countdownNumber}>
                  {countdown > 0 ? countdown : '시작'}
                </span>
              </div>
              <p className={styles.countdownHint}>곧 전투 화면으로 이동합니다…</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
