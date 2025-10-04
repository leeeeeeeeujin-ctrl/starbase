'use client'

import { useMemo } from 'react'

import {
  formatAbsoluteTimelineLabel,
  formatRelativeTimelineLabel,
  normalizeTimelineEvents,
} from '../../../lib/rank/timelineEvents'

import styles from './TimelineSection.module.css'

const TYPE_LABELS = {
  warning: '경고',
  proxy_escalated: '대역 전환',
  drop_in_joined: '난입 합류',
  turn_timeout: '자동 진행',
  consensus_reached: '합의 완료',
}

const TYPE_TONES = {
  warning: 'warn',
  proxy_escalated: 'alert',
  drop_in_joined: 'info',
  turn_timeout: 'info',
  consensus_reached: 'info',
}

function defaultOwnerLabel(event) {
  if (!event) return '알 수 없는 참가자'
  if (event.context && typeof event.context === 'object') {
    const actorLabel =
      typeof event.context.actorLabel === 'string' && event.context.actorLabel.trim()
        ? event.context.actorLabel.trim()
        : ''
    if (actorLabel) {
      return actorLabel
    }
  }
  if (event.ownerId) {
    const trimmed = String(event.ownerId).trim()
    if (trimmed) {
      return `플레이어 ${trimmed.slice(0, 6)}`
    }
  }
  return '알 수 없는 참가자'
}

function buildMetaParts(event) {
  if (!event || typeof event !== 'object') return []
  const meta = []
  if (Number.isFinite(Number(event.strike))) {
    meta.push(`경고 ${Number(event.strike)}회`)
  }
  if (Number.isFinite(Number(event.remaining))) {
    meta.push(`남은 기회 ${Number(event.remaining)}회`)
  }
  if (Number.isFinite(Number(event.limit))) {
    meta.push(`한도 ${Number(event.limit)}회`)
  }
  if (event.status === 'proxy') {
    meta.push('현재 상태: 대역')
  } else if (event.status === 'spectating') {
    meta.push('현재 상태: 관전')
  } else if (event.status === 'defeated') {
    meta.push('현재 상태: 탈락')
  }
  const context = event.context && typeof event.context === 'object' ? event.context : {}
  if (context.role) {
    meta.push(`역할: ${context.role}`)
  }
  if (context.heroName) {
    meta.push(`캐릭터: ${context.heroName}`)
  }
  if (context.sessionLabel) {
    meta.push(`세션: ${context.sessionLabel}`)
  }
  if (context.sessionCreatedAt) {
    meta.push(`시작: ${context.sessionCreatedAt}`)
  }
  if (context.mode === 'async') {
    meta.push('모드: 비실시간')
  } else if (context.mode === 'realtime') {
    meta.push('모드: 실시간')
  }
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : null
  if (metadata?.apiKeyPool) {
    const pool = metadata.apiKeyPool
    if (pool.source) {
      meta.push(`키 출처: ${pool.source}`)
    }
    if (pool.provider) {
      meta.push(`프로바이더: ${pool.provider}`)
    }
    if (pool.newSample) {
      meta.push(`신규 키: ${pool.newSample}`)
    }
    if (pool.replacedSample) {
      meta.push(`교체 키: ${pool.replacedSample}`)
    }
  }
  if (metadata?.matching) {
    const matching = metadata.matching
    if (matching.matchType) {
      meta.push(`매치 유형: ${matching.matchType}`)
    }
    if (matching.matchCode) {
      meta.push(`매치 코드: ${matching.matchCode}`)
    }
    if (matching.dropInTarget?.role) {
      meta.push(`대상 역할: ${matching.dropInTarget.role}`)
    }
    if (Number.isFinite(Number(matching.dropInMeta?.queueSize))) {
      meta.push(`큐 대기 ${Number(matching.dropInMeta.queueSize)}명`)
    }
  }
  return meta
}

export default function TimelineSection({
  title = '실시간 타임라인',
  events = [],
  collapsed = false,
  onToggle = () => {},
  emptyMessage = '아직 타임라인 이벤트가 없습니다.',
  collapsedNotice = '타임라인을 숨겼습니다. 펼쳐서 최근 이벤트를 확인하세요.',
  getOwnerLabel = defaultOwnerLabel,
}) {
  const normalizedEvents = useMemo(
    () => normalizeTimelineEvents(events, { order: 'desc' }),
    [events],
  )

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeading}>
          <h3 className={styles.cardTitle}>{title}</h3>
          {normalizedEvents.length ? (
            <span className={styles.cardBadge}>{normalizedEvents.length}건</span>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.toggleButton}
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          {collapsed ? '펼치기' : '축약'}
        </button>
      </div>

      {collapsed ? (
        <p className={styles.collapsedNotice}>{collapsedNotice}</p>
      ) : normalizedEvents.length ? (
        <ul className={styles.timelineList}>
          {normalizedEvents.map((event) => {
            const ownerLabel = getOwnerLabel(event)
            const metaParts = buildMetaParts(event)
            const reasonLabel = event.reason || ''
            const badgeTone = TYPE_TONES[event.type] || 'info'
            const badgeClass =
              badgeTone === 'alert'
                ? styles.timelineBadgeAlert
                : badgeTone === 'warn'
                  ? styles.timelineBadgeWarn
                  : styles.timelineBadgeInfo
            const typeLabel = TYPE_LABELS[event.type] || '이벤트'

            return (
              <li key={event.id || `${event.type}:${event.timestamp}`} className={styles.timelineItem}>
                <div className={styles.timelineHeader}>
                  <span className={badgeClass}>{typeLabel}</span>
                  {event.turn != null ? (
                    <span className={styles.timelineMeta}>턴 {event.turn}</span>
                  ) : null}
                  <span className={styles.timelineMeta}>
                    {formatAbsoluteTimelineLabel(event.timestamp)}
                  </span>
                  <span className={styles.timelineMetaFaded}>
                    {formatRelativeTimelineLabel(event.timestamp)}
                  </span>
                </div>
                <div className={styles.timelineBody}>
                  <p className={styles.timelineText}>{ownerLabel}</p>
                  {metaParts.length ? (
                    <p className={styles.timelineMetaText}>{metaParts.join(' · ')}</p>
                  ) : null}
                  {reasonLabel ? (
                    <p className={styles.timelineReason}>사유: {reasonLabel}</p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={styles.empty}>{emptyMessage}</p>
      )}
    </div>
  )
}
