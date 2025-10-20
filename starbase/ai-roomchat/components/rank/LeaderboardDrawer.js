// components/rank/LeaderboardDrawer.js
import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import styles from './LeaderboardDrawer.module.css'

const MODE_OPTIONS = [
  { key: 'overall', label: '전체' },
  { key: 'solo', label: '솔로' },
  { key: 'duo', label: '듀오' },
  { key: 'casual', label: '캐주얼' },
]

function normalizeMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!raw) return 'overall'
  if (raw === 'casual_private') return 'casual'
  if (MODE_OPTIONS.some((option) => option.key === raw)) {
    return raw
  }
  return 'overall'
}

function matchesMode(entryMode, selectedMode) {
  if (!selectedMode || selectedMode === 'overall') {
    return true
  }
  return normalizeMode(entryMode) === selectedMode
}

function toNumber(value) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatNumber(value) {
  if (value == null) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return numeric.toLocaleString('ko-KR')
}

function formatWinRate(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric > 1) {
    return `${Math.round(numeric)}%`
  }
  return `${Math.round(numeric * 100)}%`
}

function formatDateLabel(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

function normalizeHero(hero) {
  if (!hero || typeof hero !== 'object') return null
  return {
    id: hero.id || hero.hero_id || hero.heroId || null,
    name: hero.name || hero.hero_name || hero.heroName || '',
    image_url: hero.image_url || hero.imageUrl || null,
    background_url: hero.background_url || hero.backgroundUrl || null,
  }
}

function sortParticipants(list) {
  return list
    .slice()
    .sort((a, b) => {
      const ratingA = toNumber(a.rating)
      const ratingB = toNumber(b.rating)
      if (ratingA != null || ratingB != null) {
        return (ratingB ?? Number.NEGATIVE_INFINITY) - (ratingA ?? Number.NEGATIVE_INFINITY)
      }

      const scoreA = toNumber(a.score)
      const scoreB = toNumber(b.score)
      if (scoreA != null || scoreB != null) {
        return (scoreB ?? Number.NEGATIVE_INFINITY) - (scoreA ?? Number.NEGATIVE_INFINITY)
      }

      const winRateA = toNumber(a.winRate)
      const winRateB = toNumber(b.winRate)
      if (winRateA != null || winRateB != null) {
        return (winRateB ?? Number.NEGATIVE_INFINITY) - (winRateA ?? Number.NEGATIVE_INFINITY)
      }

      const battlesA = toNumber(a.battles)
      const battlesB = toNumber(b.battles)
      if (battlesA != null || battlesB != null) {
        return (battlesB ?? Number.NEGATIVE_INFINITY) - (battlesA ?? Number.NEGATIVE_INFINITY)
      }

      const nameA = a.heroName || ''
      const nameB = b.heroName || ''
      return nameA.localeCompare(nameB, 'ko')
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

function aggregateRecentBattles(battles, heroMap) {
  if (!Array.isArray(battles) || battles.length === 0) {
    return []
  }

  const result = new Map()

  const register = (mode, heroId, createdAt) => {
    if (!heroId) return null
    const key = `${mode}:${heroId}`
    if (!result.has(key)) {
      const hero = heroMap.get(heroId) || null
      result.set(key, {
        key,
        heroId,
        hero,
        heroName: hero?.name || `#${heroId}`,
        heroImage: hero?.image_url || null,
        mode,
        wins: 0,
        losses: 0,
        appearances: 0,
        lastPlayedAt: null,
      })
    }
    const entry = result.get(key)
    entry.appearances += 1
    const timestamp = Date.parse(createdAt)
    if (!Number.isNaN(timestamp)) {
      entry.lastPlayedAt = entry.lastPlayedAt ? Math.max(entry.lastPlayedAt, timestamp) : timestamp
    }
    return entry
  }

  const getEntry = (mode, heroId) => {
    if (!heroId) return null
    return result.get(`${mode}:${heroId}`) || null
  }

  battles.forEach((battle) => {
    const createdAt = battle.created_at || battle.createdAt || null
    const mode = normalizeMode(
      battle.mode || battle.match_mode || battle.queue_mode || battle.meta?.mode || null,
    )
    const attackerHeroes = Array.isArray(battle.attacker_hero_ids) ? battle.attacker_hero_ids : []
    const defenderHeroes = Array.isArray(battle.defender_hero_ids) ? battle.defender_hero_ids : []

    attackerHeroes.forEach((heroId) => register(mode, heroId, createdAt))
    defenderHeroes.forEach((heroId) => register(mode, heroId, createdAt))

    const rawResult = typeof battle.result === 'string' ? battle.result.toLowerCase() : ''
    const attackerWon = rawResult.includes('attacker') && !rawResult.includes('defender')
    const defenderWon = rawResult.includes('defender') && !rawResult.includes('attacker')

    if (attackerWon) {
      attackerHeroes.forEach((heroId) => {
        const entry = getEntry(mode, heroId)
        if (entry) entry.wins += 1
      })
      defenderHeroes.forEach((heroId) => {
        const entry = getEntry(mode, heroId)
        if (entry) entry.losses += 1
      })
    } else if (defenderWon) {
      defenderHeroes.forEach((heroId) => {
        const entry = getEntry(mode, heroId)
        if (entry) entry.wins += 1
      })
      attackerHeroes.forEach((heroId) => {
        const entry = getEntry(mode, heroId)
        if (entry) entry.losses += 1
      })
    }
  })

  return Array.from(result.values())
    .map((entry) => ({
      ...entry,
      winRate:
        entry.appearances > 0 && Number.isFinite(entry.wins)
          ? Math.max(Math.min(entry.wins / entry.appearances, 1), 0)
          : null,
      lastPlayedAt: entry.lastPlayedAt ? new Date(entry.lastPlayedAt).toISOString() : null,
    }))
    .sort((a, b) => {
      if (a.wins !== b.wins) return b.wins - a.wins
      if (a.appearances !== b.appearances) return b.appearances - a.appearances
      const nameA = a.heroName || ''
      const nameB = b.heroName || ''
      return nameA.localeCompare(nameB, 'ko')
    })
}

function SectionList({
  rows,
  emptyMessage,
  renderAside,
  renderMeta,
}) {
  if (!rows.length) {
    return <div className={styles.emptyState}>{emptyMessage}</div>
  }

  return (
    <ul className={styles.list}>
      {rows.map((row, index) => {
        const avatarLabel = row.heroName ? row.heroName.charAt(0) : '?' 
        return (
          <li key={row.key || row.id || `${row.heroId || index}-${index}`} className={styles.row}>
            <div className={styles.rank}>{row.rank ?? index + 1}</div>
            <div className={styles.avatar}>
              {row.heroImage ? <img src={row.heroImage} alt="" /> : avatarLabel}
            </div>
            <div className={styles.rowMain}>
              <div className={styles.heroName}>{row.heroName || '미지정'}</div>
              {renderMeta ? <div className={styles.rowMeta}>{renderMeta(row)}</div> : null}
            </div>
            {renderAside ? <div className={styles.rowAside}>{renderAside(row)}</div> : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function LeaderboardDrawer({ gameId, onClose }) {
  const [mode, setMode] = useState('overall')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [participants, setParticipants] = useState([])
  const [seasonData, setSeasonData] = useState([])
  const [recentHighlights, setRecentHighlights] = useState([])

  useEffect(() => {
    if (!gameId) return

    let alive = true

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [participantsResult, seasonsResult, battlesResult] = await Promise.all([
          supabase
            .from('rank_participants')
            .select(
              `
              id, owner_id, hero_id, role, rating, score, win_rate, battles, updated_at,
              heroes:hero_id ( id, name, image_url, background_url )
            `,
            )
            .eq('game_id', gameId)
            .limit(100),
          supabase
            .from('rank_game_seasons')
            .select('id, name, status, started_at, ended_at, leaderboard')
            .eq('game_id', gameId)
            .order('started_at', { ascending: false }),
          supabase
            .from('rank_battles')
            .select(
              'id, result, score_delta, created_at, attacker_hero_ids, defender_hero_ids, mode, match_mode, queue_mode',
            )
            .eq('game_id', gameId)
            .order('created_at', { ascending: false })
            .limit(25),
        ])

        if (!alive) return

        if (participantsResult.error) throw participantsResult.error
        if (seasonsResult.error) throw seasonsResult.error
        if (battlesResult.error) throw battlesResult.error

        const heroMap = new Map()
        const missingHeroIds = new Set()

        const normalizedParticipants = sortParticipants(
          (participantsResult.data || []).map((row) => {
            const hero = normalizeHero(row.heroes)
            if (hero?.id) {
              heroMap.set(hero.id, hero)
            }
            const heroId = row.hero_id || hero?.id || null
            return {
              key: row.id,
              heroId,
              hero,
              heroImage: hero?.image_url || null,
              heroName: hero?.name || (heroId ? `#${heroId}` : '미지정'),
              role: row.role || null,
              rating: toNumber(row.rating),
              score: toNumber(row.score),
              winRate: toNumber(row.win_rate),
              battles: toNumber(row.battles),
              updatedAt: row.updated_at || null,
              mode: normalizeMode(row.mode),
            }
          }),
        )

        const normalizedSeasons = (seasonsResult.data || []).map((season) => {
          const status = (season.status || '').toLowerCase()
          const entries = Array.isArray(season.leaderboard)
            ? season.leaderboard.map((entry, index) => {
                const heroId = entry.hero_id || entry.heroId || null
                if (heroId && !heroMap.has(heroId)) {
                  missingHeroIds.add(heroId)
                }
                return {
                  key: `${season.id}-${heroId || index}-${index}`,
                  heroId,
                  heroName: entry.hero_name || entry.heroName || (heroId ? `#${heroId}` : '미지정'),
                  rating: toNumber(entry.rating),
                  score: toNumber(entry.score),
                  wins: toNumber(entry.wins),
                  losses: toNumber(entry.losses),
                  matches: toNumber(entry.matches ?? entry.battles),
                  rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1,
                  role: entry.role || null,
                  mode: normalizeMode(entry.mode),
                }
              })
            : []
          return {
            id: season.id,
            name: season.name || '시즌',
            status,
            startedAt: season.started_at || season.startedAt || null,
            endedAt: season.ended_at || season.endedAt || null,
            entries,
          }
        })

        const battleData = battlesResult.data || []
        battleData.forEach((battle) => {
          const attackerHeroes = Array.isArray(battle.attacker_hero_ids) ? battle.attacker_hero_ids : []
          const defenderHeroes = Array.isArray(battle.defender_hero_ids) ? battle.defender_hero_ids : []
          attackerHeroes.concat(defenderHeroes).forEach((heroId) => {
            if (heroId && !heroMap.has(heroId)) {
              missingHeroIds.add(heroId)
            }
          })
        })

        if (missingHeroIds.size > 0) {
          const { data: extraHeroes, error: heroError } = await supabase
            .from('rank_heroes')
            .select('id, name, image_url, background_url')
            .in('id', Array.from(missingHeroIds))
          if (heroError) throw heroError
          ;(extraHeroes || []).forEach((hero) => {
            const normalized = normalizeHero(hero)
            if (normalized?.id) {
              heroMap.set(normalized.id, normalized)
            }
          })
        }

        const enrichedParticipants = normalizedParticipants.map((row) => {
          const hero = row.heroId ? heroMap.get(row.heroId) || row.hero : row.hero
          return {
            ...row,
            hero,
            heroImage: hero?.image_url || row.heroImage || null,
            heroName: hero?.name || row.heroName,
          }
        })

        const enrichedSeasons = normalizedSeasons.map((season) => ({
          ...season,
          entries: season.entries.map((entry) => {
            const hero = entry.heroId ? heroMap.get(entry.heroId) || null : null
            return {
              ...entry,
              hero,
              heroImage: hero?.image_url || entry.heroImage || null,
              heroName: hero?.name || entry.heroName,
            }
          }),
        }))

        const recent = aggregateRecentBattles(battleData, heroMap)

        if (!alive) return

        setParticipants(enrichedParticipants)
        setSeasonData(enrichedSeasons)
        setRecentHighlights(recent)
      } catch (err) {
        if (!alive) return
        console.error(err)
        setError(err)
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      alive = false
    }
  }, [gameId])

  const activeSeason = useMemo(
    () => seasonData.find((season) => season.status === 'active'),
    [seasonData],
  )
  const archivedSeasons = useMemo(
    () => seasonData.filter((season) => season.status !== 'active'),
    [seasonData],
  )
  const latestArchived = archivedSeasons.length ? archivedSeasons[0] : null

  const filteredParticipants = useMemo(
    () => participants.filter((entry) => matchesMode(entry.mode, mode)).slice(0, 12),
    [participants, mode],
  )

  const filteredActiveSeason = useMemo(() => {
    if (!activeSeason) return []
    return activeSeason.entries.filter((entry) => matchesMode(entry.mode, mode)).slice(0, 10)
  }, [activeSeason, mode])

  const filteredArchivedSeason = useMemo(() => {
    if (!latestArchived) return []
    return latestArchived.entries.filter((entry) => matchesMode(entry.mode, mode)).slice(0, 10)
  }, [latestArchived, mode])

  const filteredRecent = useMemo(
    () => recentHighlights.filter((entry) => matchesMode(entry.mode, mode)).slice(0, 10),
    [recentHighlights, mode],
  )

  const hasSeasonContent = filteredActiveSeason.length || filteredArchivedSeason.length

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>통합 리더보드</span>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.modeSwitch}>
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`${styles.modeButton} ${mode === option.key ? styles.modeButtonActive : ''}`.trim()}
                onClick={() => setMode(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className={styles.statusLine}>
            시즌 누적과 최근 전적을 한 곳에서 확인하고, 모드별 비교를 진행해 보세요.
          </p>

          {loading ? <div className={styles.loading}>리더보드를 불러오는 중입니다…</div> : null}
          {error ? (
            <div className={styles.error}>
              데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
            </div>
          ) : null}

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>시즌 리더보드</span>
              {activeSeason ? (
                <span className={styles.badge}>
                  진행 중 · {activeSeason.name}
                </span>
              ) : null}
            </div>
            {hasSeasonContent ? (
              <>
                <SectionList
                  rows={filteredActiveSeason.map((entry, index) => ({
                    ...entry,
                    rank: entry.rank ?? index + 1,
                  }))}
                  emptyMessage="해당 모드의 시즌 데이터가 없습니다."
                  renderMeta={(entry) => [
                    entry.role ? <span key="role">역할 {entry.role}</span> : null,
                    entry.rating != null ? (
                      <span key="rating">
                        레이팅 <span className={styles.rowStat}>{formatNumber(entry.rating)}</span>
                      </span>
                    ) : null,
                    entry.score != null ? (
                      <span key="score">
                        점수 <span className={styles.rowStat}>{formatNumber(entry.score)}</span>
                      </span>
                    ) : null,
                    entry.wins != null || entry.losses != null ? (
                      <span key="wl">
                        {formatNumber(entry.wins || 0)}승 {formatNumber(entry.losses || 0)}패
                      </span>
                    ) : null,
                  ].filter(Boolean)}
                  renderAside={(entry) =>
                    entry.matches != null ? [
                      <span key="matches">전투 {formatNumber(entry.matches)}</span>,
                    ] : null
                  }
                />
                {filteredArchivedSeason.length ? (
                  <>
                    <div className={styles.sectionDivider} />
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionTitle}>최근 종료 시즌</span>
                      {latestArchived?.name ? (
                        <span className={styles.sectionMeta}>{latestArchived.name}</span>
                      ) : null}
                    </div>
                    <SectionList
                      rows={filteredArchivedSeason.map((entry, index) => ({
                        ...entry,
                        rank: entry.rank ?? index + 1,
                      }))}
                      emptyMessage="최근 종료 시즌 데이터가 없습니다."
                      renderMeta={(entry) => [
                        entry.role ? <span key="role">역할 {entry.role}</span> : null,
                        entry.rating != null ? (
                          <span key="rating">
                            레이팅 <span className={styles.rowStat}>{formatNumber(entry.rating)}</span>
                          </span>
                        ) : null,
                        entry.wins != null || entry.losses != null ? (
                          <span key="wl">
                            {formatNumber(entry.wins || 0)}승 {formatNumber(entry.losses || 0)}패
                          </span>
                        ) : null,
                      ].filter(Boolean)}
                      renderAside={(entry) =>
                        entry.matches != null ? [
                          <span key="matches">전투 {formatNumber(entry.matches)}</span>,
                        ] : null
                      }
                    />
                  </>
                ) : null}
              </>
            ) : (
              <div className={styles.emptyState}>시즌 리더보드 데이터가 아직 없습니다.</div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>최근 기록</span>
              <span className={styles.sectionMeta}>최근 25경기 기반</span>
            </div>
            <SectionList
              rows={filteredRecent.map((entry, index) => ({
                ...entry,
                rank: index + 1,
              }))}
              emptyMessage="최근 전투 기록이 아직 없습니다."
              renderMeta={(entry) => {
                const winRate = formatWinRate(entry.winRate)
                const parts = []
                parts.push(
                  <span key="wl">
                    <span className={styles.rowStat}>{formatNumber(entry.wins || 0)}</span>승{' '}
                    <span className={styles.rowStat}>{formatNumber(entry.losses || 0)}</span>패
                  </span>,
                )
                if (entry.appearances != null) {
                  parts.push(<span key="matches">출전 {formatNumber(entry.appearances)}</span>)
                }
                if (winRate) {
                  parts.push(
                    <span key="rate">
                      승률 <span className={styles.rowStat}>{winRate}</span>
                    </span>,
                  )
                }
                return parts
              }}
              renderAside={(entry) =>
                entry.lastPlayedAt
                  ? [<span key="recent">최근 {formatDateLabel(entry.lastPlayedAt)}</span>]
                  : null
              }
            />
            <p className={styles.smallNote}>
              모드 정보가 포함되지 않은 전투는 전체 모드 통계에 합산됩니다.
            </p>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>누적 순위</span>
              <span className={styles.sectionMeta}>레이팅·점수 기준</span>
            </div>
            <SectionList
              rows={filteredParticipants}
              emptyMessage="해당 모드의 누적 순위를 계산할 데이터가 없습니다."
              renderMeta={(entry) => [
                entry.role ? <span key="role">역할 {entry.role}</span> : null,
                entry.rating != null ? (
                  <span key="rating">
                    레이팅 <span className={styles.rowStat}>{formatNumber(entry.rating)}</span>
                  </span>
                ) : null,
                entry.score != null ? (
                  <span key="score">
                    점수 <span className={styles.rowStat}>{formatNumber(entry.score)}</span>
                  </span>
                ) : null,
                entry.winRate != null ? (
                  <span key="winRate">
                    승률 <span className={styles.rowStat}>{formatWinRate(entry.winRate)}</span>
                  </span>
                ) : null,
                entry.battles != null ? <span key="battles">전투 {formatNumber(entry.battles)}</span> : null,
              ].filter(Boolean)}
              renderAside={(entry) =>
                entry.updatedAt ? [<span key="updated">갱신 {formatDateLabel(entry.updatedAt)}</span>] : null
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
