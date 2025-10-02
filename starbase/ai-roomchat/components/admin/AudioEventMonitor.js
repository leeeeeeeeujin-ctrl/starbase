import { useCallback, useEffect, useMemo, useState } from 'react'

import styles from '../../styles/AdminPortal.module.css'

const REFRESH_INTERVAL_MS = 120_000
const FILTER_DEBOUNCE_MS = 320
const API_LIMIT = 300

const RANGE_OPTIONS = [
  {
    id: '24h',
    label: '최근 24시간',
    resolve: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: '7d',
    label: '최근 7일',
    resolve: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '30d',
    label: '최근 30일',
    resolve: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'all',
    label: '전체',
    resolve: () => null,
  },
]

function formatDateTime(iso) {
  if (!iso) return '시간 정보 없음'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDurationFromNow(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const diff = Date.now() - date.getTime()
  if (diff < 0) {
    return '방금 저장됨'
  }
  const minutes = Math.floor(diff / (60 * 1000))
  if (minutes < 1) return '방금 저장됨'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

function buildQueryString({ ownerId, profileKey, heroId, since, search, eventTypes }) {
  const params = new URLSearchParams()
  params.set('limit', String(API_LIMIT))
  if (ownerId) params.set('ownerId', ownerId)
  if (profileKey) params.set('profileKey', profileKey)
  if (heroId) params.set('heroId', heroId)
  if (since) params.set('since', since)
  if (search) params.set('search', search)
  if (eventTypes.length) params.set('eventType', eventTypes.join(','))
  return params.toString()
}

export default function AudioEventMonitor() {
  const [range, setRange] = useState('24h')
  const [ownerId, setOwnerId] = useState('')
  const [profileKey, setProfileKey] = useState('')
  const [heroId, setHeroId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEventTypes, setSelectedEventTypes] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  const [data, setData] = useState({
    items: [],
    stats: { total: 0, uniqueOwners: 0, uniqueProfiles: 0, byEventType: {} },
    availableEventTypes: [],
  })
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput.trim())
    }, FILTER_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [searchInput])

  const since = useMemo(() => {
    const option = RANGE_OPTIONS.find((item) => item.id === range)
    if (!option) return null
    const resolved = option.resolve()
    if (!resolved) return null
    return resolved.toISOString()
  }, [range])

  const queryString = useMemo(
    () =>
      buildQueryString({
        ownerId: ownerId.trim(),
        profileKey: profileKey.trim(),
        heroId: heroId.trim(),
        since,
        search: searchTerm,
        eventTypes: selectedEventTypes,
      }),
    [ownerId, profileKey, heroId, since, searchTerm, selectedEventTypes],
  )

  const loadEvents = useCallback(
    async (withSpinner = false) => {
      if (withSpinner) {
        setLoading(true)
      }
      try {
        const endpoint = queryString
          ? `/api/admin/audio-events?${queryString}`
          : '/api/admin/audio-events'
        const response = await fetch(endpoint)
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.error || '오디오 이벤트 로그를 불러오지 못했습니다.')
        }
        const payload = await response.json()
        setData({
          items: Array.isArray(payload.items) ? payload.items : [],
          stats: payload.stats || { total: 0, uniqueOwners: 0, uniqueProfiles: 0, byEventType: {} },
          availableEventTypes: Array.isArray(payload.availableEventTypes)
            ? payload.availableEventTypes
            : [],
        })
        if (Array.isArray(payload.availableEventTypes)) {
          setSelectedEventTypes((previous) => {
            const next = previous.filter((type) => payload.availableEventTypes.includes(type))
            if (next.length === previous.length) {
              return previous
            }
            return next
          })
        }
        setError(null)
        setLastUpdatedAt(new Date().toISOString())
      } catch (err) {
        setError(err.message || '오디오 이벤트 로그를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    [queryString],
  )

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadEvents(false)
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadEvents])

  useEffect(() => {
    loadEvents(true)
  }, [loadEvents])

  const toggleEventType = useCallback((eventType) => {
    setSelectedEventTypes((previous) => {
      if (previous.includes(eventType)) {
        return previous.filter((item) => item !== eventType)
      }
      return [...previous, eventType]
    })
  }, [])

  const resetFilters = useCallback(() => {
    setOwnerId('')
    setProfileKey('')
    setHeroId('')
    setSearchInput('')
    setSearchTerm('')
    setSelectedEventTypes([])
    setRange('24h')
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const params = queryString ? `${queryString}&format=csv` : 'format=csv'
      const response = await fetch(`/api/admin/audio-events?${params}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'CSV 내보내기에 실패했습니다.')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const stamp = new Date().toISOString().slice(0, 10)
      link.download = `rank-audio-events-${stamp}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'CSV 내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }, [queryString])

  const summaryChips = useMemo(() => {
    const entries = Object.entries(data.stats.byEventType || {})
    if (!entries.length) {
      return ['이벤트 유형 데이터 없음']
    }
    return entries
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => `${key} ${count}건`)
  }, [data.stats.byEventType])

  return (
    <section className={styles.audioEventsSection}>
      <div className={styles.audioEventsHeader}>
        <h3 className={styles.audioEventsTitle}>오디오 이벤트 로그</h3>
        <div className={styles.audioEventsActions}>
          <button
            type="button"
            className={styles.audioEventsButton}
            onClick={handleExport}
            disabled={loading || exporting || !data.items.length}
          >
            {exporting ? '내보내는 중…' : 'CSV 내보내기'}
          </button>
          <button
            type="button"
            className={styles.audioEventsButton}
            onClick={() => loadEvents(true)}
            disabled={loading}
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>
      </div>

      <div className={styles.audioEventsMeta}>
        <span>총 {data.stats.total}건</span>
        <span>고유 운영자 {data.stats.uniqueOwners}명</span>
        <span>고유 프로필 {data.stats.uniqueProfiles}개</span>
        <span>{summaryChips.join(' · ')}</span>
        {lastUpdatedAt ? <span>마지막 갱신 {formatDurationFromNow(lastUpdatedAt)}</span> : null}
      </div>

      <div className={styles.audioEventsFilters}>
        <div className={styles.audioEventsRangeRow}>
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.audioEventsRangeButton} ${
                range === option.id ? styles.audioEventsRangeButtonActive : ''
              }`}
              onClick={() => setRange(option.id)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className={styles.audioEventsReset} onClick={resetFilters}>
            필터 초기화
          </button>
        </div>

        <div className={styles.audioEventsInputGrid}>
          <label className={styles.audioEventsField}>
            <span>Owner ID</span>
            <input
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              placeholder="owner uuid"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>Profile Key</span>
            <input
              value={profileKey}
              onChange={(event) => setProfileKey(event.target.value)}
              placeholder="hero:profile"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>Hero ID</span>
            <input
              value={heroId}
              onChange={(event) => setHeroId(event.target.value)}
              placeholder="hero uuid"
            />
          </label>
          <label className={styles.audioEventsField}>
            <span>검색어</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="트랙, 프리셋, 변경 필드 검색"
            />
          </label>
        </div>

        <div className={styles.audioEventsEventTypes}>
          <span className={styles.audioEventsEventTypesLabel}>이벤트 유형</span>
          <div className={styles.audioEventsEventTypeChips}>
            {data.availableEventTypes.length ? (
              data.availableEventTypes.map((eventType) => {
                const active = selectedEventTypes.includes(eventType)
                return (
                  <button
                    key={eventType}
                    type="button"
                    className={`${styles.audioEventsEventTypeChip} ${
                      active ? styles.audioEventsEventTypeChipActive : ''
                    }`}
                    onClick={() => toggleEventType(eventType)}
                  >
                    {eventType}
                  </button>
                )
              })
            ) : (
              <span className={styles.audioEventsEmpty}>수집된 이벤트 유형이 없습니다.</span>
            )}
          </div>
        </div>
      </div>

      {error ? <p className={styles.audioEventsError}>{error}</p> : null}

      <ul className={styles.audioEventsList}>
        {!loading && !data.items.length ? (
          <li className={styles.audioEventsEmpty}>표시할 이벤트가 없습니다.</li>
        ) : null}
        {data.items.map((item) => {
          const details = item.details || {}
          const changedFields = Array.isArray(details.changedFields) ? details.changedFields : []
          const preference = details.preference || {}
          return (
            <li key={item.id} className={styles.audioEventsItem}>
              <header className={styles.audioEventsItemHeader}>
                <div>
                  <span className={styles.audioEventsHero}>{item.hero_name || '이름 없음'}</span>
                  {item.hero_source ? (
                    <span className={styles.audioEventsHeroSource}>{item.hero_source}</span>
                  ) : null}
                  {item.profile_key ? (
                    <span className={styles.audioEventsProfile}>{item.profile_key}</span>
                  ) : null}
                </div>
                <div className={styles.audioEventsEventMeta}>
                  <span className={styles.audioEventsType}>{item.event_type}</span>
                  <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                </div>
              </header>
              <div className={styles.audioEventsBody}>
                <div className={styles.audioEventsChangedFields}>
                  {changedFields.length ? (
                    changedFields.map((field) => (
                      <span key={field} className={styles.audioEventsChangedField}>
                        {field}
                      </span>
                    ))
                  ) : (
                    <span className={styles.audioEventsEmpty}>변경 필드 정보 없음</span>
                  )}
                </div>
                <div className={styles.audioEventsPreference}>
                  <span>트랙: {preference.trackId || '—'}</span>
                  <span>프리셋: {preference.presetId || '—'}</span>
                  <span>수동 조정: {preference.manualOverride ? '예' : '아니오'}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
