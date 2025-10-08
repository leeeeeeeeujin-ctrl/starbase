'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import styles from './StartClient.module.css'
import { clearMatchFlow, readMatchFlowState } from '../../../lib/rank/matchFlow'

function buildRosterEntries(roster) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return [
      {
        key: 'empty',
        title: '참가자 정보가 없습니다.',
        subtitle: '',
      },
    ]
  }

  return roster.map((entry, index) => ({
    key: `${entry.slotId || index}-${entry.heroId || index}`,
    title: entry.heroName || (entry.heroId ? `캐릭터 #${entry.heroId}` : '빈 슬롯'),
    subtitle: entry.role || '역할 미지정',
    ready: !!entry.heroId && !!entry.ownerId,
  }))
}

function buildSessionMeta(state) {
  const meta = []
  if (state?.room?.mode) {
    meta.push({ label: '모드', value: state.room.mode })
  }
  if (state?.snapshot?.match?.matchCode) {
    meta.push({ label: '방 코드', value: state.snapshot.match.matchCode })
  }
  if (Number.isFinite(Number(state?.snapshot?.match?.maxWindow)) && Number(state.snapshot.match.maxWindow) > 0) {
    meta.push({ label: '점수 범위', value: `±${Number(state.snapshot.match.maxWindow)}` })
  }
  if (state?.matchMode) {
    meta.push({ label: '매치 모드', value: state.matchMode })
  }
  if (state?.room?.realtimeMode) {
    meta.push({ label: '실시간 옵션', value: state.room.realtimeMode })
  }
  return meta
}

export default function StartClient() {
  const router = useRouter()
  const [gameId, setGameId] = useState('')
  const [state, setState] = useState(() => readMatchFlowState(''))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    const { id } = router.query
    if (typeof id !== 'string' || !id.trim()) {
      setGameId('')
      setState(readMatchFlowState(''))
      setReady(true)
      return
    }
    setGameId(id)
    setState(readMatchFlowState(id))
    setReady(true)

    return () => {
      clearMatchFlow(id)
    }
  }, [router.isReady, router.query])

  const rosterEntries = useMemo(() => buildRosterEntries(state?.roster), [state?.roster])
  const sessionMeta = useMemo(() => buildSessionMeta(state), [state])

  const handleBackToRoom = useCallback(() => {
    if (state?.room?.id) {
      router.push(`/rooms/${state.room.id}`).catch(() => {})
      return
    }
    if (gameId) {
      router.push(`/rank/${gameId}`).catch(() => {})
      return
    }
    router.push('/rooms').catch(() => {})
  }, [router, state?.room?.id, gameId])

  const handleReset = useCallback(() => {
    if (!gameId) return
    clearMatchFlow(gameId)
    setState(readMatchFlowState(gameId))
  }, [gameId])

  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.status}>매칭 정보를 불러오는 중…</p>
        </div>
      </div>
    )
  }

  if (!gameId || !state?.snapshot) {
    return (
      <div className={styles.page}>
        <div className={styles.shell}>
          <p className={styles.status}>활성화된 매치 정보를 찾지 못했습니다.</p>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleBackToRoom}>
              방 목록으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{state?.room?.mode ? `${state.room.mode} 메인 게임` : '메인 게임'}</h1>
            <p className={styles.subtitle}>
              참가자 {state?.rosterReadyCount}/{state?.totalSlots}
            </p>
          </div>
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleBackToRoom}>
              방으로 돌아가기
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              세션 초기화
            </button>
          </div>
        </header>

        {sessionMeta.length > 0 && (
          <section className={styles.metaSection}>
            <h2 className={styles.sectionTitle}>매치 정보</h2>
            <ul className={styles.metaList}>
              {sessionMeta.map((item) => (
                <li key={item.label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{item.label}</span>
                  <span className={styles.metaValue}>{item.value}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.rosterSection}>
          <h2 className={styles.sectionTitle}>참가자</h2>
          <ul className={styles.rosterList}>
            {rosterEntries.map((entry) => (
              <li key={entry.key} className={styles.rosterItem}>
                <div className={styles.rosterText}>
                  <span className={styles.rosterName}>{entry.title}</span>
                  <span className={styles.rosterRole}>{entry.subtitle}</span>
                </div>
                <span className={entry.ready ? styles.badgeReady : styles.badgeWaiting}>
                  {entry.ready ? '준비 완료' : '대기'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.placeholderSection}>
          <h2 className={styles.sectionTitle}>전투 준비 단계</h2>
          <p className={styles.placeholderBody}>
            메인 게임 로직은 현재 재구성 중입니다. 참가자 구성이 확정되면 여기에 전투 로그와 세션 진행 상황이 표시될 예정입니다.
          </p>
        </section>
      </div>
    </div>
  )
}
