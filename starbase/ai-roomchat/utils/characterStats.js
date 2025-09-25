export const ABILITY_KEYS = ['ability1', 'ability2', 'ability3', 'ability4']

export function buildAbilityCards(edit) {
  return ABILITY_KEYS.map((key, index) => ({
    key,
    label: `능력 ${index + 1}`,
    value: edit?.[key] || '',
  }))
}

export function buildStatSlides(participations, scoreboards, heroId) {
  if (!Array.isArray(participations) || participations.length === 0) return []

  return participations.map((row) => {
    const board = scoreboards?.[row.game_id] || []
    const sortedBoard = board.length ? [...board].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)) : []
    const heroIndex = heroId ? sortedBoard.findIndex((item) => item.hero_id === heroId) : -1
    const rankText = heroIndex >= 0 ? `#${heroIndex + 1}` : '—'
    const ratingValue = row.rating ?? row.score
    const ratingText =
      typeof ratingValue === 'number' ? ratingValue.toLocaleString() : ratingValue || '—'
    const totalBattles = row.battles ?? 0

    let winRateText = '—'
    if (row.win_rate != null) {
      const rate = Math.round(row.win_rate)
      winRateText = `${Math.max(0, Math.min(100, rate))}%`
    } else if (totalBattles && typeof row.score === 'number') {
      const computed = Math.round((row.score / totalBattles) * 100)
      if (Number.isFinite(computed)) {
        winRateText = `${Math.max(0, Math.min(100, computed))}%`
      }
    }

    const battlesText = totalBattles ? totalBattles.toLocaleString() : '0'

    return {
      key: row.game_id,
      name: row.game?.name || '이름 없는 게임',
      image: row.game?.image_url || null,
      role: row.role || '',
      stats: [
        { key: 'rank', label: '전체 랭킹', value: rankText },
        { key: 'rating', label: 'Elo Score', value: ratingText },
        { key: 'winRate', label: '승률', value: winRateText },
        { key: 'battles', label: '전체 전투수', value: battlesText },
      ],
    }
  })
}

export function buildBattleSummary(battleDetails) {
  const rows = Array.isArray(battleDetails) ? battleDetails : []
  const wins = rows.filter((battle) => (battle.result || '').toLowerCase() === 'win').length
  const losses = rows.filter((battle) => {
    const value = (battle.result || '').toLowerCase()
    return value === 'lose' || value === 'loss'
  }).length
  const draws = rows.filter((battle) => (battle.result || '').toLowerCase() === 'draw').length
  const total = rows.length
  const rate = total ? Math.round((wins / total) * 100) : null
  return { wins, losses, draws, total, rate }
}

export function includesHeroId(value, heroId) {
  if (!value) return false
  if (Array.isArray(value)) return value.includes(heroId)
  return false
}

export function createOpponentCards(scoreboardRows, heroLookup, heroId) {
  if (!Array.isArray(scoreboardRows)) return []

  return scoreboardRows
    .filter((row) => {
      if (heroId && row?.hero_id === heroId) return false
      if (Array.isArray(row?.hero_ids) && heroId && row.hero_ids.includes(heroId)) return false
      return true
    })
    .map((row, index) => {
      const heroEntry = heroLookup?.[row.hero_id] || null
      const name = heroEntry?.name || row.role || `참가자 ${index + 1}`
      const portrait = heroEntry?.image_url || null
      const abilities = heroEntry
        ? ABILITY_KEYS.map((key) => heroEntry[key]).filter(Boolean).slice(0, 2)
        : []
      return {
        id: row.id || `${row.hero_id}-${row.owner_id || index}`,
        heroId: row.hero_id || null,
        role: row.role || '',
        name,
        portrait,
        abilities,
      }
    })
}

//
