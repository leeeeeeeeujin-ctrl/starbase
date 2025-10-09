'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import styles from './MatchReadyClient.module.css'
import { createEmptyMatchFlowState, readMatchFlowState } from '../../lib/rank/matchFlow'
import StartClient from './StartClient'

function buildMetaLines(state) {
  const lines = []
  if (!state?.snapshot) return lines

  const code = state.snapshot?.match?.matchCode
  if (code) {
    lines.push(`방 코드 ${code}`)
  }

  const windowSize = state.snapshot?.match?.maxWindow
  if (Number.isFinite(Number(windowSize)) && Number(windowSize) > 0) {
    lines.push(`점수 범위 ±${Number(windowSize)}`)
  }

  const modeLabel = state.matchMode ? `모드 ${state.matchMode}` : ''
  if (modeLabel) {
    lines.push(modeLabel)
  }

  if (state.room?.realtimeMode === 'pulse') {
    lines.push('Pulse 실시간 규칙 적용')
    if (Number.isFinite(Number(state.room?.hostRoleLimit))) {
      lines.push(`호스트 역할군 제한 ${state.room.hostRoleLimit}명`)
    }
  } else if (state.room?.realtimeMode === 'standard') {
    lines.push('실시간 매치 준비 완료')
  }

  if (state.snapshot?.match?.matchType === 'drop_in') {
    lines.push('난입 매치 진행 중')
  }

  return lines
}

function buildRosterDisplay(roster, viewer, blindMode) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return [
      {
        key: 'empty',
        label: '참가자 정보가 없습니다.',
        status: '',
      },
    ]
  }

  const viewerOwnerId = viewer?.ownerId ? String(viewer.ownerId).trim() : ''

  return roster.map((entry, index) => {
    const isOccupied = entry.heroId && entry.ownerId
    const hideIdentity =
      blindMode &&
      isOccupied &&
      (!viewerOwnerId || String(entry.ownerId).trim() !== viewerOwnerId)
    const heroLabel = hideIdentity
      ? '비공개 참가자'
      : entry.heroName || (entry.heroId ? `캐릭터 #${entry.heroId}` : '빈 슬롯')
    const roleLabel = entry.role || '역할 미지정'
    const readyLabel = isOccupied ? '착석 완료' : '대기'
    return {
      key: `${entry.slotId || index}-${entry.heroId || index}`,
      label: `${roleLabel} · ${heroLabel}`,
      status: readyLabel,
    }
  })
}

export default function MatchReadyClient({ gameId }) {
  const router = useRouter()
  const [state, setState] = useState(() => createEmptyMatchFlowState())
  const [showGame, setShowGame] = useState(false)

  useEffect(() => {
    if (!gameId) {
      setState(createEmptyMatchFlowState())
      return
    }
    setState(readMatchFlowState(gameId))
  }, [gameId])

  const metaLines = useMemo(() => buildMetaLines(state), [state])
  const rosterDisplay = useMemo(
    () => buildRosterDisplay(state?.roster, state?.viewer, state?.room?.blindMode),
    [state?.roster, state?.viewer, state?.room?.blindMode],
  )

  const handleRefresh = useCallback(() => {
    if (!gameId) {
      setState(createEmptyMatchFlowState())
      return
    }
    setState(readMatchFlowState(gameId))
  }, [gameId])

  const handleReturnToRoom = useCallback(() => {
    if (state?.room?.id) {
      router.push(`/rooms/${state.room.id}`).catch(() => {})
      return
    }
    router.push('/rooms').catch(() => {})
  }, [router, state?.room?.id])

  const handleStart = useCallback(() => {
    if (!gameId) return
    setShowGame(true)
  }, [gameId])

  const allowStart = Boolean(gameId && state?.snapshot && state?.hasActiveKey)

  useEffect(() => {
    if (showGame) {
      const previous = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = previous
      }
    }
    return undefined
  }, [showGame])

  useEffect(() => {
    if (!allowStart && showGame) {
      setShowGame(false)
    }
  }, [allowStart, showGame])

  const missingKey = state?.snapshot && !state?.hasActiveKey

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>{state?.room?.mode ? `${state.room.mode} 매치 준비` : '매치 준비'}</h1>
            <p className={styles.subtitle}>
              {state?.room?.code ? `코드 ${state.room.code} · 참가자 ${state.rosterReadyCount}/${state.totalSlots}` : '방 정보를 확인하고 있습니다.'}
            </p>
          </div>
          <div className={styles.actionsInline}>
            <button type="button" className={styles.secondaryButton} onClick={handleRefresh}>
              정보 새로고침
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleReturnToRoom}>
              방으로 돌아가기
            </button>
          </div>
        </header>

        {metaLines.length > 0 && (
          <section className={styles.meta}>
            {metaLines.map((line) => (
              <p key={line} className={styles.metaLine}>
                {line}
              </p>
            ))}
          </section>
        )}

        {state?.room?.blindMode ? (
          <section className={styles.bannerInfo}>
            <p className={styles.bannerTitle}>블라인드 모드가 활성화된 매치입니다.</p>
            <p className={styles.bannerBody}>
              전투가 시작되기 전까지는 다른 참가자의 캐릭터 정보가 공개되지 않습니다. 준비를 마친 뒤 메인
              게임으로 이동하면 전체 로스터가 표시됩니다.
            </p>
          </section>
        ) : null}

        {missingKey && (
          <section className={styles.bannerWarning}>
            <p className={styles.bannerTitle}>활성화된 AI API 키가 필요합니다.</p>
            <p className={styles.bannerBody}>
              방 찾기 헤더에서 API 키를 등록하고 사용 설정해야 전투를 시작할 수 있습니다.
            </p>
          </section>
        )}

        <section className={styles.rosterSection}>
          <h2 className={styles.sectionTitle}>참가자 구성</h2>
          <ul className={styles.rosterList}>
            {rosterDisplay.map((entry) => (
              <li key={entry.key} className={styles.rosterItem}>
                <span className={styles.rosterLabel}>{entry.label}</span>
                <span className={styles.rosterStatus}>{entry.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleStart}
            disabled={!allowStart}
          >
            게임 화면 열기
          </button>
          {!allowStart && state?.snapshot && (
            <p className={styles.footerHint}>
              {!state.hasActiveKey
                ? 'AI API 키를 사용 설정한 뒤 다시 시도해 주세요.'
                : '참가자 정보를 준비하고 있습니다.'}
            </p>
          )}
        </footer>
      </div>
      {showGame ? (
        <div className={styles.overlayRoot}>
          <div className={styles.overlayBackdrop} />
          <div className={styles.overlayContent}>
            <StartClient gameId={gameId} onRequestClose={() => setShowGame(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
