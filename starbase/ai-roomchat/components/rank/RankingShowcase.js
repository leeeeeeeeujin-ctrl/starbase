// components/rank/RankingShowcase.js
import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabase'
import { withTable } from '@/lib/supabaseTables'

const baseCardStyle = {
  borderRadius: 24,
  padding: 20,
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.82) 100%)',
  color: '#e2e8f0',
  display: 'grid',
  gap: 16,
}

function safeFirstHeroId(row) {
  if (!row) return null
  if (row.hero_id) return row.hero_id
  if (row.heroes_id) return row.heroes_id
  if (Array.isArray(row.hero_ids) && row.hero_ids.length > 0) return row.hero_ids[0]
  return null
}

function summarize(row, heroMap, gameMap) {
  const heroId = safeFirstHeroId(row)
  const hero = heroId ? heroMap[heroId] || null : null
  const game = row?.game_id ? gameMap[row.game_id] || null : null

  return {
    ...row,
    heroId,
    hero,
    game,
  }
}

function HighlightCard({ hero, stats, onInvite, onWhisper, gameId, heroId }) {
  if (!hero) return null

  return (
    <section
      style={{
        ...baseCardStyle,
        borderRadius: 28,
        background: 'linear-gradient(135deg, rgba(15,118,110,0.92) 0%, rgba(30,64,175,0.88) 100%)',
        boxShadow: '0 38px 80px -48px rgba(8, 47, 73, 0.65)',
        gap: 18,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>이번 주 1위</span>
          <h2 style={{ margin: 0, fontSize: 26 }}>{hero.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onInvite ? (
            <button
              type="button"
              onClick={() => onInvite({ heroId, heroName: hero.name, gameId })}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: '1px solid rgba(191, 219, 254, 0.35)',
                background: 'rgba(15, 23, 42, 0.35)',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              실시간 초대
            </button>
          ) : null}
          {onWhisper ? (
            <button
              type="button"
              onClick={() => onWhisper({ heroId, heroName: hero.name, gameId })}
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                border: 'none',
                background: '#38bdf8',
                color: '#0f172a',
                fontWeight: 800,
              }}
            >
              귓속말 보내기
            </button>
          ) : null}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 20, alignItems: 'center' }}>
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: 28,
            overflow: 'hidden',
            border: '2px solid rgba(244, 244, 245, 0.45)',
            background: 'rgba(15, 23, 42, 0.45)',
          }}
        >
          {hero.image_url ? (
            <img
              src={hero.image_url}
              alt={hero.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
              }}
            >
              🛡️
            </div>
          )}
        </div>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
          }}
        >
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>최근 Elo</span>
            <strong style={{ fontSize: 22 }}>{stats?.rating ?? '—'}</strong>
          </li>
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>승률</span>
            <strong style={{ fontSize: 22 }}>{stats?.winRate ?? '—'}%</strong>
          </li>
          <li
            style={{
              borderRadius: 18,
              padding: 14,
              background: 'rgba(15, 23, 42, 0.35)',
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.75 }}>전투수</span>
            <strong style={{ fontSize: 22 }}>{stats?.total ?? 0}</strong>
          </li>
        </ul>
      </div>
    </section>
  )
}

// 

function LeaderRow({ entry, rank, onWhisper }) {
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 14,
        alignItems: 'center',
        padding: '12px 16px',
        borderRadius: 18,
        background: rank === 1 ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.45)',
          border: '1px solid rgba(148, 163, 184, 0.35)',
        }}
      >
        {entry.hero?.image_url ? (
          <img
            src={entry.hero.image_url}
            alt={entry.hero?.name || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            #{rank}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>
          #{rank} {entry.hero?.name || '미정'}
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          {entry.game?.name || '등록된 게임 없음'} · {entry.battles ?? 0}회 참여
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 18 }}>{Math.round(entry.rating ?? entry.score ?? 0)}</strong>
        {onWhisper ? (
          <button
            type="button"
            onClick={() => onWhisper({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#bae6fd',
              fontSize: 12,
            }}
          >
            귓속말
          </button>
        ) : null}
      </div>
    </li>
  )
}

function GameSection({ section, onInvite, onWhisper }) {
  return (
    <li
      style={{
        borderRadius: 20,
        padding: 16,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          }}
        >
          {section.game?.image_url ? (
            <img
              src={section.game.image_url}
              alt={section.game?.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              🎮
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          <strong style={{ fontSize: 15 }}>{section.game?.name || '이름 없는 게임'}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>상위 {section.rows.length}명</span>
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {section.rows.map((entry, index) => (
          <li
            key={entry.id || `${entry.heroId}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(30, 41, 59, 0.55)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'rgba(15, 23, 42, 0.45)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
              }}
            >
              {entry.hero?.image_url ? (
                <img
                  src={entry.hero.image_url}
                  alt={entry.hero?.name || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                  }}
                >
                  #{index + 1}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                #{index + 1} {entry.hero?.name || '이름 없음'}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Elo {Math.round(entry.rating ?? entry.score ?? 0)} · {entry.battles ?? 0}전
              </span>
            </div>
            {onInvite || onWhisper ? (
              <div style={{ display: 'flex', gap: 6 }}>
                {onInvite ? (
                  <button
                    type="button"
                    onClick={() => onInvite({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid rgba(148, 163, 184, 0.45)',
                      background: 'rgba(15, 23, 42, 0.3)',
                      color: '#e2e8f0',
                      fontSize: 11,
                    }}
                  >
                    초대
                  </button>
                ) : null}
                {onWhisper ? (
                  <button
                    type="button"
                    onClick={() => onWhisper({ heroId: entry.heroId, heroName: entry.hero?.name, gameId: entry.game_id })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: 'none',
                      background: 'rgba(56, 189, 248, 0.25)',
                      color: '#bae6fd',
                      fontSize: 11,
                    }}
                  >
                    귓속말
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  )
}

function aggregateHeroStats(heroId, attackRows, defendRows) {
  const seen = new Map()
  ;[...attackRows, ...defendRows].forEach((row) => {
    if (row?.id && !seen.has(row.id)) {
      seen.set(row.id, row)
    }
  })

  let wins = 0
  let losses = 0
  let draws = 0

  seen.forEach((battle) => {
    const result = String(battle?.result || '').toLowerCase()
    const asAttacker = Array.isArray(battle?.attacker_hero_ids) && battle.attacker_hero_ids.includes(heroId)
    const asDefender = Array.isArray(battle?.defender_hero_ids) && battle.defender_hero_ids.includes(heroId)

    if (!asAttacker && !asDefender) return

    if (result === 'draw') {
      draws += 1
      return
    }

    if (asAttacker) {
      if (result === 'win') wins += 1
      else if (result === 'lose') losses += 1
      else draws += 1
      return
    }

    if (asDefender) {
      if (result === 'win') losses += 1
      else if (result === 'lose') wins += 1
      else draws += 1
    }
  })

  const total = wins + losses + draws

  return {
    wins,
    losses,
    draws,
    total,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
  }
}

export default function RankingShowcase({ onInvite, onWhisper, maxGameSections = 3 }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [heroMap, setHeroMap] = useState({})
  const [gameMap, setGameMap] = useState({})
  const [topStats, setTopStats] = useState(null)

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: listError } = await withTable(
        supabase,
        'rank_participants',
        (table) =>
          supabase
            .from(table)
            .select('id, game_id, hero_id, heroes_id, hero_ids, rating, score, battles, updated_at')
            .order('rating', { ascending: false })
            .limit(30),
      )

      if (!alive) return

      if (listError) {
        setError(listError.message || '랭킹 정보를 불러오지 못했습니다.')
        setRows([])
        setHeroMap({})
        setGameMap({})
        setTopStats(null)
        setLoading(false)
        return
      }

      const normalized = (data || []).map((item) => ({
        ...item,
        hero_id: item?.hero_id || item?.heroes_id || null,
      }))
      const valid = normalized.filter((item) => safeFirstHeroId(item))
      setRows(valid)

      const heroIds = Array.from(new Set(valid.map((item) => safeFirstHeroId(item)).filter(Boolean)))
      const gameIds = Array.from(new Set(valid.map((item) => item?.game_id).filter(Boolean)))

      const [heroRes, gameRes] = await Promise.all([
        heroIds.length
          ? withTable(supabase, 'heroes', (table) =>
              supabase
                .from(table)
                .select(
                  'id, name, image_url, description, owner_id, ability1, ability2, ability3, ability4',
                )
                .in('id', heroIds),
            )
          : Promise.resolve({ data: [], error: null }),
        gameIds.length
          ? supabase.from('rank_games').select('id, name, image_url').in('id', gameIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!alive) return

      if (heroRes.error) setError(heroRes.error.message || '영웅 정보를 불러오지 못했습니다.')
      if (gameRes.error) setError((prev) => prev || gameRes.error.message || '게임 정보를 불러오지 못했습니다.')

      const heroLookup = {}
      ;(heroRes.data || []).forEach((item) => {
        heroLookup[item.id] = item
      })
      const gameLookup = {}
      ;(gameRes.data || []).forEach((item) => {
        gameLookup[item.id] = item
      })

      setHeroMap(heroLookup)
      setGameMap(gameLookup)
      setLoading(false)

      const topHeroId = safeFirstHeroId(valid[0])
      if (topHeroId) {
        const [attackRes, defendRes] = await Promise.all([
          withTable(supabase, 'rank_battles', (table) =>
            supabase
              .from(table)
              .select('id, result, attacker_hero_ids, defender_hero_ids')
              .contains('attacker_hero_ids', [topHeroId])
              .order('created_at', { ascending: false })
              .limit(40),
          ),
          withTable(supabase, 'rank_battles', (table) =>
            supabase
              .from(table)
              .select('id, result, attacker_hero_ids, defender_hero_ids')
              .contains('defender_hero_ids', [topHeroId])
              .order('created_at', { ascending: false })
              .limit(40),
          ),
        ])

        if (!alive) return

        if (attackRes.error || defendRes.error) {
          setTopStats(null)
        } else {
          setTopStats(
            aggregateHeroStats(topHeroId, attackRes.data || [], defendRes.data || []) || {
              wins: 0,
              losses: 0,
              draws: 0,
              total: 0,
              winRate: 0,
            },
          )
        }
      } else {
        setTopStats(null)
      }
    }

    load()

    return () => {
      alive = false
    }
  }, [])

  const enrichedRows = useMemo(() => rows.map((row) => summarize(row, heroMap, gameMap)), [rows, heroMap, gameMap])
  const highlight = enrichedRows[0] || null

  const leaders = useMemo(() => enrichedRows.slice(0, 6), [enrichedRows])

  const perGameSections = useMemo(() => {
    if (!rows.length) return []
    const grouped = new Map()

    rows.forEach((row) => {
      if (!row?.game_id) return
      if (!grouped.has(row.game_id)) grouped.set(row.game_id, [])
      grouped.get(row.game_id).push(row)
    })

    const sections = []
    grouped.forEach((value, gameId) => {
      const sorted = [...value].sort((a, b) => (b?.rating ?? 0) - (a?.rating ?? 0))
      sections.push({
        gameId,
        game: gameMap[gameId] || null,
        rows: sorted.slice(0, 3).map((row) => summarize(row, heroMap, gameMap)),
      })
    })

    sections.sort((a, b) => {
      const left = a.rows[0]?.rating ?? 0
      const right = b.rows[0]?.rating ?? 0
      return right - left
    })

    return sections.slice(0, maxGameSections)
  }, [rows, gameMap, heroMap, maxGameSections])

  if (loading) {
    return (
      <div style={baseCardStyle}>
        <strong>랭킹 정보를 불러오는 중…</strong>
        <span style={{ fontSize: 13, opacity: 0.7 }}>잠시만 기다려 주세요.</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...baseCardStyle, color: '#fecaca' }}>
        <strong>랭킹 정보를 불러오는 중 오류가 발생했습니다.</strong>
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{error}</span>
      </div>
    )
  }

  if (!enrichedRows.length) {
    return (
      <div style={baseCardStyle}>아직 집계된 랭킹이 없습니다. 게임을 플레이해 순위를 만들어 보세요.</div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <HighlightCard
        hero={highlight?.hero || null}
        stats={
          highlight
            ? { ...(topStats || {}), rating: Math.round(highlight.rating ?? highlight.score ?? 0) }
            : null
        }
        onInvite={onInvite}
        onWhisper={onWhisper}
        gameId={highlight?.game_id}
        heroId={highlight?.heroId}
      />

      <section style={baseCardStyle}>
        <header>
          <h3 style={{ margin: 0 }}>전체 랭킹 TOP 6</h3>
        </header>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {leaders.map((entry, index) => (
            <LeaderRow key={entry.id || `${entry.heroId}-${index}`} entry={entry} rank={index + 1} onWhisper={onWhisper} />
          ))}
        </ul>
      </section>

      {perGameSections.length ? (
        <section style={baseCardStyle}>
          <h3 style={{ margin: 0 }}>게임별 상위권</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 14 }}>
            {perGameSections.map((section) => (
              <GameSection
                key={section.gameId}
                section={section}
                onInvite={onInvite}
                onWhisper={onWhisper}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

//
