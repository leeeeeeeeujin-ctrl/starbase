import { useMemo } from 'react'

import { normalizeRoleName } from '@/lib/rank/roleLayoutLoader'
import { normalizeTimelineStatus } from '@/lib/rank/timelineEvents'

import { deriveParticipantOwnerId } from './engine/participants'

function formatWinRate(value) {
  if (value === null || value === undefined) return '기록 없음'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '기록 없음'
  const ratio = numeric > 1 ? numeric : numeric * 100
  const rounded = Math.round(ratio * 10) / 10
  return `${rounded}%`
}

function formatBattles(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return '정보 없음'
  return `${numeric}전`
}

function formatStatusText(status) {
  const normalized = normalizeTimelineStatus(status)
  if (!normalized) return '알 수 없음'
  if (['defeated', 'lost', '패배'].includes(normalized)) return '패배'
  if (normalized === 'spectating') return '관전'
  if (normalized === 'proxy') return '대역'
  if (normalized === 'pending') return '대기'
  if (['active', 'playing', 'alive', '참여', 'in_battle'].includes(normalized)) return '전투 중'
  return status || '알 수 없음'
}

function buildPresenceMap(realtimePresence) {
  if (!realtimePresence || typeof realtimePresence !== 'object') return new Map()
  const entries = Array.isArray(realtimePresence.entries) ? realtimePresence.entries : []
  const map = new Map()
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return
    const ownerId = entry.ownerId ? String(entry.ownerId).trim() : ''
    if (!ownerId) return
    map.set(ownerId, entry)
  })
  return map
}

function buildRoleMap(dropInSnapshot) {
  if (!dropInSnapshot || typeof dropInSnapshot !== 'object') return new Map()
  const roles = Array.isArray(dropInSnapshot.roles) ? dropInSnapshot.roles : []
  const map = new Map()
  roles.forEach((role) => {
    if (!role || typeof role !== 'object') return
    const key = typeof role.role === 'string' ? role.role.trim() : ''
    if (!key) return
    map.set(key, role)
  })
  return map
}

function resolveStatusBadge(status, presenceEntry) {
  const normalized = normalizeTimelineStatus(status)
  if (!normalized) return null
  const base = {
    key: `status-${normalized}`,
    title: undefined,
  }
  if (normalized === 'spectating') {
    return {
      ...base,
      label: '관전',
      color: '#38bdf8',
      background: 'rgba(56, 189, 248, 0.16)',
      border: 'rgba(56, 189, 248, 0.45)',
    }
  }
  if (normalized === 'proxy') {
    const proxiedTurn = Number.isFinite(Number(presenceEntry?.proxiedAtTurn))
      ? Number(presenceEntry.proxiedAtTurn)
      : null
    return {
      ...base,
      label: '대역',
      color: '#c084fc',
      background: 'rgba(192, 132, 252, 0.18)',
      border: 'rgba(192, 132, 252, 0.45)',
      title: proxiedTurn !== null ? `${proxiedTurn}턴부터 대역` : undefined,
    }
  }
  if (normalized === 'pending') {
    return {
      ...base,
      label: '대기',
      color: '#facc15',
      background: 'rgba(250, 204, 21, 0.18)',
      border: 'rgba(250, 204, 21, 0.42)',
    }
  }
  if (['defeated', 'lost'].includes(normalized)) {
    return {
      ...base,
      label: '탈락',
      color: '#f87171',
      background: 'rgba(248, 113, 113, 0.18)',
      border: 'rgba(248, 113, 113, 0.42)',
    }
  }
  return null
}

function resolveDropInBadge(roleStats, snapshotTurn) {
  if (!roleStats) return null
  const replacements = Number.isFinite(Number(roleStats.replacements))
    ? Number(roleStats.replacements)
    : 0
  const arrivals = Number.isFinite(Number(roleStats.totalArrivals))
    ? Number(roleStats.totalArrivals)
    : 0
  const lastArrivalTurn = Number.isFinite(Number(roleStats.lastArrivalTurn))
    ? Number(roleStats.lastArrivalTurn)
    : null
  const snapshotNumeric = Number.isFinite(Number(snapshotTurn)) ? Number(snapshotTurn) : null

  if (snapshotNumeric !== null && lastArrivalTurn !== null && lastArrivalTurn === snapshotNumeric) {
    return {
      key: 'drop-in-latest',
      label: '새 난입',
      color: '#fbbf24',
      background: 'rgba(251, 191, 36, 0.2)',
      border: 'rgba(251, 191, 36, 0.45)',
      title: '이번 턴 난입으로 교체되었습니다.',
    }
  }

  if (replacements > 0) {
    return {
      key: 'drop-in-replacements',
      label: `난입 ${replacements}회`,
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.18)',
      border: 'rgba(245, 158, 11, 0.42)',
      title: '역할군 난입 교체 횟수',
    }
  }

  if (arrivals > 1) {
    return {
      key: 'drop-in-arrivals',
      label: `난입 ${arrivals - 1}회`,
      color: '#f59e0b',
      background: 'rgba(245, 158, 11, 0.18)',
      border: 'rgba(245, 158, 11, 0.42)',
      title: '추가 난입 참가자 수를 포함합니다.',
    }
  }

  return null
}

function buildBadges({ status, presenceEntry, roleStats, snapshotTurn }) {
  const badges = []
  const statusBadge = resolveStatusBadge(status, presenceEntry)
  if (statusBadge) {
    badges.push(statusBadge)
  }
  const dropInBadge = resolveDropInBadge(roleStats, snapshotTurn)
  if (dropInBadge) {
    badges.push(dropInBadge)
  }
  return badges
}

export default function RosterPanel({
  participants = [],
  realtimePresence = null,
  dropInSnapshot = null,
  showDetails = true,
  viewerOwnerId = '',
  normalizedHostRole = '',
  normalizedViewerRole = '',
}) {
  const presenceMap = useMemo(() => buildPresenceMap(realtimePresence), [realtimePresence])
  const roleMap = useMemo(() => buildRoleMap(dropInSnapshot), [dropInSnapshot])
  const snapshotTurn = Number.isFinite(Number(dropInSnapshot?.turn))
    ? Number(dropInSnapshot.turn)
    : null
  const viewerKey = viewerOwnerId ? String(viewerOwnerId).trim() : ''
  const hostRoleKey = normalizeRoleName(normalizedHostRole)
  const viewerRoleKey = normalizeRoleName(normalizedViewerRole)

  return (
    <section
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: 16,
        display: 'grid',
        gap: 14,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontWeight: 700 }}>참여자</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {participants.map((participant) => {
          const ownerId = deriveParticipantOwnerId(participant)
          const presenceEntry = ownerId ? presenceMap.get(String(ownerId)) : null
          const status = normalizeTimelineStatus(
            presenceEntry?.status || participant.status,
          )
          const roleKey = typeof participant.role === 'string' ? participant.role.trim() : ''
          const roleStats = roleKey ? roleMap.get(roleKey) : null
          const badges = buildBadges({
            status,
            presenceEntry,
            roleStats,
            snapshotTurn,
          })
          const normalizedRole = normalizeRoleName(participant.role || '')
          const isViewerSeat = Boolean(viewerKey && ownerId && String(ownerId).trim() === viewerKey)
          const isHostRoleSeat = Boolean(hostRoleKey && normalizedRole === hostRoleKey)
          const revealDetails = showDetails || isViewerSeat
          const heroName = revealDetails
            ? participant.hero?.name || '이름 없음'
            : '비공개 참가자'
          const heroImage = revealDetails ? participant.hero?.image_url || '' : ''
          const scoreText = revealDetails
            ? Number.isFinite(Number(participant.score))
              ? Number(participant.score)
              : '정보 없음'
            : isViewerSeat
            ? Number.isFinite(Number(participant.score))
              ? Number(participant.score)
              : '정보 없음'
            : '숨김'
          const battlesText = revealDetails
            ? formatBattles(participant.battles ?? participant.total_battles)
            : isViewerSeat
            ? formatBattles(participant.battles ?? participant.total_battles)
            : '숨김'
          const winRateText = revealDetails
            ? `승률 ${formatWinRate(participant.win_rate ?? participant.winRate)}`
            : isViewerSeat
            ? `승률 ${formatWinRate(participant.win_rate ?? participant.winRate)}`
            : '승률 숨김'
          const abilityTexts = revealDetails
            ? [1, 2, 3, 4]
                .map((index) => participant.hero?.[`ability${index}`])
                .filter(Boolean)
            : []
          const descriptionText = revealDetails ? participant.hero?.description || '' : ''

          return (
            <div
              key={participant.id || participant.hero_id || participant.hero?.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '68px 1fr',
                gap: 12,
                alignItems: 'stretch',
                padding: '12px 14px',
                borderRadius: 16,
                background: 'rgba(15, 23, 42, 0.58)',
                border: '1px solid rgba(148, 163, 184, 0.28)',
              }}
            >
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={heroName || '참여자 이미지'}
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 16,
                    objectFit: 'cover',
                    filter: revealDetails ? 'none' : 'blur(6px)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 16,
                    background: revealDetails
                      ? 'rgba(148, 163, 184, 0.22)'
                      : 'rgba(51, 65, 85, 0.45)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    color: 'rgba(226, 232, 240, 0.7)',
                  }}
                >
                  {revealDetails ? '이미지 없음' : '비공개'}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>
                        {heroName}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>
                        역할: {participant.role || '미지정'} · 상태{' '}
                        {formatStatusText(status || participant.status)}
                      </div>
                      {(isViewerSeat || isHostRoleSeat || (viewerRoleKey && normalizedRole === viewerRoleKey)) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          {isViewerSeat ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'rgba(59, 130, 246, 0.25)',
                                color: '#bfdbfe',
                              }}
                            >
                              내 좌석
                            </span>
                          ) : null}
                          {isHostRoleSeat ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'rgba(250, 204, 21, 0.22)',
                                color: '#facc15',
                              }}
                            >
                              호스트 역할
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: 12,
                        color: 'rgba(148, 163, 184, 0.9)',
                        display: 'grid',
                        gap: 2,
                      }}
                    >
                      <span>점수 {scoreText}</span>
                      <span>{battlesText}</span>
                      <span>{winRateText}</span>
                    </div>
                  </div>
                  {badges.length ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginTop: 4,
                      }}
                    >
                      {badges.map((badge, index) => (
                        <span
                          key={`${badge.key}-${index}`}
                          title={badge.title || undefined}
                          style={{
                            padding: '2px 10px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: badge.background,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            letterSpacing: 0.2,
                          }}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(226, 232, 240, 0.7)',
                    display: 'grid',
                    gap: 4,
                    padding: 10,
                    borderRadius: 12,
                    background: 'rgba(15, 23, 42, 0.45)',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                  }}
                >
                  {abilityTexts.length
                    ? abilityTexts.map((text, idx) => (
                        <div key={idx} style={{ lineHeight: 1.45 }}>
                          능력 {idx + 1}: {text}
                        </div>
                      ))
                    : (
                        <div style={{ lineHeight: 1.45, color: 'rgba(148, 163, 184, 0.85)' }}>
                          상세 능력 정보는 현재 비공개 상태입니다.
                        </div>
                      )}
                  {descriptionText ? (
                    <div style={{ lineHeight: 1.45 }}>설명: {descriptionText}</div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
        {participants.length === 0 && (
          <div style={{ color: 'rgba(226, 232, 240, 0.65)', fontSize: 13 }}>
            등록된 참여자가 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}

//
