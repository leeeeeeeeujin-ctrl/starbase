import { useCallback, useMemo, useState } from 'react'

import TimelineSection from '../Timeline/TimelineSection'
import styles from './LogsPanel.module.css'
import { normalizeTurnSummaryPayload } from '../../../lib/rank/turnSummary'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text, tokens) {
  if (typeof text !== 'string' || !tokens.length) return text

  const escaped = tokens.map(escapeRegExp).join('|')
  if (!escaped) return text
  const regex = new RegExp(`(${escaped})`, 'gi')
  const segments = text.split(regex)

  return segments.map((segment, index) => {
    if (!segment) return null
    const match = tokens.some((token) => segment.toLowerCase() === token.toLowerCase())
    if (match) {
      return (
        <mark key={`mark-${index}`} className={styles.highlight}>
          {segment}
        </mark>
      )
    }
    return <span key={`plain-${index}`}>{segment}</span>
  })
}

function dedupeStrings(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const result = []
  value.forEach((item) => {
    if (typeof item !== 'string') return
    const trimmed = item.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    if (seen.has(lower)) return
    seen.add(lower)
    result.push(trimmed)
  })
  return result
}

function formatActionLabel(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : ''
  const ACTION_LABELS = {
    continue: '계속',
    win: '승리',
    lose: '패배',
    draw: '무승부',
    retry: '재시도',
    halt: '중단',
  }
  return ACTION_LABELS[normalized] || (normalized ? normalized : '')
}

function formatRoleLabel(role) {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (!normalized) return '내레이션'
  if (normalized === 'assistant') return 'AI 응답'
  if (normalized === 'user') return '플레이어 행동'
  if (normalized === 'system') return '시스템'
  return role
}

function normalizeLogEntry(entry, index) {
  if (!entry) return null
  const turn = Number(entry.turn)
  const nodeId = entry.nodeId ?? entry.node_id ?? null
  const summary = normalizeTurnSummaryPayload(entry.summary)
  const actors = dedupeStrings(entry.actors)
  const variables = dedupeStrings(entry.variables)
  const next = entry.next ?? entry.nextNode ?? null
  const actionLabel = formatActionLabel(entry.action)
  const actionKey = typeof entry.action === 'string' ? entry.action.trim().toLowerCase() : ''
  const outcome = typeof entry.outcome === 'string' ? entry.outcome.trim() : ''
  const response = typeof entry.response === 'string' ? entry.response : ''
  const prompt = typeof entry.prompt === 'string' ? entry.prompt : ''
  const key = Number.isFinite(turn)
    ? `log-${turn}-${nodeId ?? index}`
    : `log-${index}-${nodeId ?? 'unknown'}`

  return {
    key,
    turn: Number.isFinite(turn) ? turn : null,
    nodeId,
    summary,
    actors,
    variables,
    next,
    actionLabel,
    actionKey,
    outcome,
    response,
    prompt,
  }
}

function normalizeMemoryEntry(entry, index) {
  if (!entry) return null
  const roleLabel = formatRoleLabel(entry.role)
  const content = typeof entry.content === 'string' ? entry.content : ''
  const actors = dedupeStrings(entry.meta?.actors)
  return {
    key: `memory-${entry.index ?? index}`,
    roleLabel,
    content,
    actors,
  }
}

function normalizePlayerHistory(player, index) {
  const name =
    player.heroName ||
    player.hero_name ||
    player.name ||
    player.hero?.name ||
    `슬롯 ${index + 1}`
  const role = player.role || ''
  const entries = Array.isArray(player.entries) ? player.entries.slice(-4) : []
  const normalizedEntries = entries.map((entry, entryIndex) => {
    const roleLabel = formatRoleLabel(entry.role)
    const content = typeof entry.content === 'string' ? entry.content : ''
    const actors = dedupeStrings(entry.meta?.actors)
    return {
      key: `player-${index}-${entry.index ?? entryIndex}`,
      roleLabel,
      content,
      actors,
    }
  })

  return {
    key: `player-${index}`,
    name,
    role,
    entries: normalizedEntries,
  }
}

function formatTimelineReason(reason) {
  if (!reason) return ''
  const normalized = String(reason).trim().toLowerCase()
  switch (normalized) {
    case 'timeout':
      return '시간 초과'
    case 'consensus':
      return '합의 미응답'
    case 'manual':
      return '수동 진행 미완료'
    case 'ai':
      return '자동 진행'
    case 'inactivity':
      return '응답 없음'
    default:
      return reason
  }
}

export default function LogsPanel({
  logs = [],
  aiMemory = [],
  playerHistories = [],
  realtimeEvents = [],
}) {
  const normalizedLogs = useMemo(
    () => logs.map(normalizeLogEntry).filter(Boolean),
    [logs],
  )

  const normalizedMemory = useMemo(
    () => aiMemory.map(normalizeMemoryEntry).filter(Boolean),
    [aiMemory],
  )

  const normalizedPlayers = useMemo(
    () => playerHistories.map(normalizePlayerHistory).filter(Boolean),
    [playerHistories],
  )

  const timelineEvents = useMemo(() => {
    if (!Array.isArray(realtimeEvents)) return []
    return realtimeEvents
      .map((event) => {
        if (!event || typeof event !== 'object') return null
        const formattedReason = formatTimelineReason(event.reason)
        if (formattedReason !== (event.reason || '')) {
          return { ...event, reason: formattedReason }
        }
        return event
      })
      .filter(Boolean)
  }, [realtimeEvents])
  const getTimelineOwnerLabel = useCallback((event) => {
    if (!event || typeof event !== 'object') return '알 수 없는 참가자'
    const ownerId = event.ownerId ? String(event.ownerId).trim() : ''
    if (ownerId) {
      return `플레이어 ${ownerId.slice(0, 6)}`
    }
    const context = event.context && typeof event.context === 'object' ? event.context : {}
    if (context.heroName) {
      return context.heroName
    }
    return '알 수 없는 참가자'
  }, [])

  const [searchTerm, setSearchTerm] = useState('')
  const [collapsedSections, setCollapsedSections] = useState({
    logs: false,
    memory: false,
    players: false,
    timeline: false,
  })

  const trimmedSearch = searchTerm.trim().toLowerCase()
  const searchTokens = useMemo(
    () => (trimmedSearch ? trimmedSearch.split(/\s+/).filter(Boolean) : []),
    [trimmedSearch],
  )

  const [activeActions, setActiveActions] = useState([])
  const [activeActors, setActiveActors] = useState([])
  const [activeTags, setActiveTags] = useState([])

  const availableActions = useMemo(() => {
    const unique = new Map()
    normalizedLogs.forEach((entry) => {
      if (!entry.actionKey) return
      if (unique.has(entry.actionKey)) return
      unique.set(entry.actionKey, entry.actionLabel || entry.actionKey)
    })
    return Array.from(unique.entries()).map(([key, label]) => ({ key, label }))
  }, [normalizedLogs])

  const availableActors = useMemo(() => {
    const seen = new Map()
    normalizedLogs.forEach((entry) => {
      entry.actors.forEach((actor) => {
        const lower = actor.toLowerCase()
        if (seen.has(lower)) return
        seen.set(lower, actor)
      })
      if (entry.summary?.actors?.length) {
        entry.summary.actors.forEach((actor) => {
          const lower = actor.toLowerCase()
          if (seen.has(lower)) return
          seen.set(lower, actor)
        })
      }
    })
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [normalizedLogs])

  const availableTags = useMemo(() => {
    const seen = new Map()
    normalizedLogs.forEach((entry) => {
      ;(entry.summary?.tags || []).forEach((tag) => {
        const lower = tag.toLowerCase()
        if (seen.has(lower)) return
        seen.set(lower, tag)
      })
    })
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label: `#${label}` }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [normalizedLogs])

  const filteredLogs = useMemo(() => {
    const actionSet = new Set(activeActions)
    const actorSet = new Set(activeActors)
    const tagSet = new Set(activeTags)

    return normalizedLogs.filter((entry) => {
      if (actionSet.size && (!entry.actionKey || !actionSet.has(entry.actionKey))) {
        return false
      }

      if (actorSet.size) {
        const summaryActors = entry.summary?.actors?.map((actor) => actor.toLowerCase()) || []
        const entryActors = entry.actors.map((actor) => actor.toLowerCase())
        const combined = new Set([...summaryActors, ...entryActors])
        const matchesActor = Array.from(actorSet).some((actor) => combined.has(actor))
        if (!matchesActor) return false
      }

      if (tagSet.size) {
        const tags = (entry.summary?.tags || []).map((tag) => tag.toLowerCase())
        const matchesTag = Array.from(tagSet).some((tag) => tags.includes(tag))
        if (!matchesTag) return false
      }

      if (!trimmedSearch) return true

      const haystacks = [
        entry.summary?.preview,
        entry.summary?.promptPreview,
        entry.summary?.outcomeLine,
        entry.summary?.role,
        entry.response,
        entry.prompt,
        entry.outcome,
        entry.actors.join(' '),
        entry.variables.join(' '),
        (entry.summary?.tags || []).join(' '),
      ]

      return haystacks.some((value) =>
        typeof value === 'string' ? value.toLowerCase().includes(trimmedSearch) : false,
      )
    })
  }, [activeActions, activeActors, activeTags, normalizedLogs, trimmedSearch])

  const handleToggle = useCallback((section) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])

  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value)
  }, [])

  const handleFilterToggle = useCallback((type, value) => {
    const updater = type === 'action' ? setActiveActions : type === 'actor' ? setActiveActors : setActiveTags
    updater((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return Array.from(next)
    })
  }, [])

  const handleClearFilters = useCallback(() => {
    setActiveActions([])
    setActiveActors([])
    setActiveTags([])
    setSearchTerm('')
  }, [])

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>턴 & 히스토리</h2>
        <p className={styles.subtitle}>
          최근 전투 로그, AI 기억, 플레이어별 기록을 동시에 살펴볼 수 있습니다.
        </p>
      </div>

      <div className={styles.columns}>
        <div className={styles.primaryColumn}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>턴 로그</h3>
              {normalizedLogs.length ? (
                <span className={styles.sectionBadge}>{normalizedLogs.length}개</span>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => handleToggle('logs')}
              aria-expanded={!collapsedSections.logs}
            >
              {collapsedSections.logs ? '펼치기' : '축약'}
            </button>
          </div>

          {collapsedSections.logs ? (
            <p className={styles.collapsedNotice}>턴 로그 카드를 축약했습니다. 펼치면 다시 확인할 수 있어요.</p>
          ) : (
            <>
              <div className={styles.sectionControls}>
                <label className={styles.searchField}>
                  <span className={styles.visuallyHidden}>턴 로그 검색</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="요약, 주역, 프롬프트로 검색"
                    className={styles.searchInput}
                  />
                </label>
                {(trimmedSearch || activeActions.length || activeActors.length || activeTags.length) && (
                  <div className={styles.activeSummary}>
                    <span className={styles.filterBadge}>
                      {filteredLogs.length ? `${filteredLogs.length}개 일치` : '일치 항목 없음'}
                    </span>
                    <button
                      type="button"
                      className={styles.clearFilters}
                      onClick={handleClearFilters}
                    >
                      필터 초기화
                    </button>
                  </div>
                )}
              </div>

              {availableActions.length || availableActors.length || availableTags.length ? (
                <div className={styles.filterRow}>
                  {availableActions.length ? (
                    <div className={styles.filterGroup}>
                      <span className={styles.filterLabel}>액션</span>
                      <div className={styles.filterOptions}>
                        {availableActions.map((action) => {
                          const isActive = activeActions.includes(action.key)
                          return (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => handleFilterToggle('action', action.key)}
                              className={isActive ? styles.filterChipActive : styles.filterChip}
                              aria-pressed={isActive}
                            >
                              {action.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {availableActors.length ? (
                    <div className={styles.filterGroup}>
                      <span className={styles.filterLabel}>주역</span>
                      <div className={styles.filterOptions}>
                        {availableActors.map((actor) => {
                          const isActive = activeActors.includes(actor.key)
                          return (
                            <button
                              key={actor.key}
                              type="button"
                              onClick={() => handleFilterToggle('actor', actor.key)}
                              className={isActive ? styles.filterChipActive : styles.filterChip}
                              aria-pressed={isActive}
                            >
                              {actor.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {availableTags.length ? (
                    <div className={styles.filterGroup}>
                      <span className={styles.filterLabel}>태그</span>
                      <div className={styles.filterOptions}>
                        {availableTags.map((tag) => {
                          const isActive = activeTags.includes(tag.key)
                          return (
                            <button
                              key={tag.key}
                              type="button"
                              onClick={() => handleFilterToggle('tag', tag.key)}
                              className={isActive ? styles.filterChipActive : styles.filterChip}
                              aria-pressed={isActive}
                            >
                              {tag.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {filteredLogs.length ? (
                <ul className={styles.logList}>
                  {filteredLogs.map((entry) => (
                    <li key={entry.key} className={styles.logCard}>
                      <div className={styles.logHeader}>
                        {entry.turn != null ? (
                          <span className={styles.turnBadge}>턴 {entry.turn}</span>
                        ) : (
                      <span className={styles.turnBadge}>턴</span>
                    )}
                    {entry.nodeId ? (
                      <span className={styles.nodeTag}>노드 {entry.nodeId}</span>
                    ) : null}
                    {entry.next ? (
                      <span className={styles.nodeTag}>다음 노드 {entry.next}</span>
                    ) : null}
                    {entry.actionLabel ? (
                      <span className={styles.actionTag}>{entry.actionLabel}</span>
                    ) : null}
                  </div>

                      {entry.summary ? (
                        <div className={styles.summary}>
                          <div className={styles.summaryHeader}>
                            <span className={styles.summaryBadge}>요약</span>
                            {entry.summary.role ? (
                              <span>{highlightText(entry.summary.role, searchTokens)}</span>
                            ) : null}
                            {entry.summary.actors?.length ? (
                              <span className={styles.summaryActors}>
                                {highlightText(entry.summary.actors.join(', '), searchTokens)}
                              </span>
                            ) : null}
                      </div>
                      {entry.summary.preview ? (
                        <p className={styles.summaryText}>{highlightText(entry.summary.preview, searchTokens)}</p>
                      ) : null}
                      {entry.summary.promptPreview ? (
                        <p className={styles.summaryHint}>
                          프롬프트: {highlightText(entry.summary.promptPreview, searchTokens)}
                        </p>
                      ) : null}
                      {entry.summary.outcomeLine ? (
                        <p className={styles.summaryHint}>
                          결론: {highlightText(entry.summary.outcomeLine, searchTokens)}
                        </p>
                      ) : null}
                      {entry.summary.tags?.length ? (
                        <div className={styles.tagRow}>
                          {entry.summary.tags.map((tag, tagIndex) => (
                            <span key={`${entry.key}-tag-${tagIndex}`} className={styles.tagChip}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={styles.logBody}>
                    {entry.response ? (
                      <div>
                        <div className={styles.bodyLabel}>응답</div>
                        <p className={styles.bodyText}>{highlightText(entry.response, searchTokens)}</p>
                      </div>
                    ) : null}
                    {entry.prompt ? (
                      <div>
                        <div className={styles.bodyLabel}>사용된 프롬프트</div>
                        <p className={styles.bodyText}>{highlightText(entry.prompt, searchTokens)}</p>
                      </div>
                    ) : null}
                    <div className={styles.bodyMetaRow}>
                      {entry.actors.length ? (
                        <span>{highlightText(`주역: ${entry.actors.join(', ')}`, searchTokens)}</span>
                      ) : null}
                      {entry.variables.length ? (
                        <span>{highlightText(`변수: ${entry.variables.join(', ')}`, searchTokens)}</span>
                      ) : null}
                      {entry.outcome ? (
                        <span>{highlightText(`결과: ${entry.outcome}`, searchTokens)}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
              </ul>
              ) : trimmedSearch ? (
                <p className={styles.empty}>검색어와 일치하는 로그가 없습니다.</p>
              ) : (
                <p className={styles.empty}>아직 진행된 턴이 없습니다.</p>
              )}
            </>
          )}
        </div>

        <div className={styles.secondaryColumn}>
          <TimelineSection
            title="실시간 타임라인"
            events={timelineEvents}
            collapsed={collapsedSections.timeline}
            onToggle={() => handleToggle('timeline')}
            emptyMessage="아직 실시간 이벤트가 없습니다."
            collapsedNotice="실시간 이벤트 타임라인을 숨겼습니다. 펼쳐서 최근 경고와 대역 전환을 확인하세요."
            getOwnerLabel={getTimelineOwnerLabel}
          />

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeading}>
                <h3 className={styles.cardTitle}>AI 히스토리</h3>
                {normalizedMemory.length ? (
                  <span className={styles.cardBadge}>{normalizedMemory.length}개</span>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => handleToggle('memory')}
                aria-expanded={!collapsedSections.memory}
              >
                {collapsedSections.memory ? '펼치기' : '축약'}
              </button>
            </div>

            {collapsedSections.memory ? (
              <p className={styles.collapsedNotice}>AI 히스토리를 숨겼습니다. 펼쳐서 다시 확인하세요.</p>
            ) : normalizedMemory.length ? (
              <div className={styles.memoryList}>
                {normalizedMemory.map((entry) => (
                  <div key={entry.key} className={styles.memoryItem}>
                    <span className={styles.memoryRole}>{entry.roleLabel}</span>
                    {entry.actors.length ? (
                      <span className={styles.memoryMeta}>
                        {highlightText(`주역: ${entry.actors.join(', ')}`, searchTokens)}
                      </span>
                    ) : null}
                    <p className={styles.memoryContent}>{highlightText(entry.content, searchTokens)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>아직 기록된 히스토리가 없습니다.</p>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeading}>
                <h3 className={styles.cardTitle}>플레이어 히스토리</h3>
                {normalizedPlayers.length ? (
                  <span className={styles.cardBadge}>{normalizedPlayers.length}명</span>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.toggleButton}
                onClick={() => handleToggle('players')}
                aria-expanded={!collapsedSections.players}
              >
                {collapsedSections.players ? '펼치기' : '축약'}
              </button>
            </div>

            {collapsedSections.players ? (
              <p className={styles.collapsedNotice}>플레이어 히스토리를 숨겼습니다. 펼쳐서 카드별 기록을 살펴보세요.</p>
            ) : normalizedPlayers.length ? (
              <div className={styles.playerList}>
                {normalizedPlayers.map((player) => (
                  <div key={player.key} className={styles.playerCard}>
                    <div className={styles.playerHeader}>
                      <span className={styles.playerName}>{player.name}</span>
                      {player.role ? (
                        <span className={styles.playerRole}>
                          {highlightText(player.role, searchTokens)}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.playerEntries}>
                      {player.entries.length ? (
                        player.entries.map((entry) => (
                          <div key={entry.key} className={styles.playerEntry}>
                            <span className={styles.playerEntryRole}>{entry.roleLabel}</span>
                            {entry.actors.length ? (
                              <span className={styles.memoryMeta}>
                                {highlightText(`주역: ${entry.actors.join(', ')}`, searchTokens)}
                              </span>
                            ) : null}
                            <p className={styles.playerEntryContent}>
                              {highlightText(entry.content, searchTokens)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className={styles.subtleEmpty}>아직 기록이 없습니다.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.empty}>참가자가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
