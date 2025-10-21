export const baseCardStyle = {
  borderRadius: 24,
  padding: 20,
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.82) 100%)',
  color: '#e2e8f0',
  display: 'grid',
  gap: 16,
}

export function safeFirstHeroId(row) {
  if (!row) return null
  if (row.hero_id) return row.hero_id
  if (row.heroes_id) return row.heroes_id
  if (Array.isArray(row.hero_ids) && row.hero_ids.length > 0) return row.hero_ids[0]
  return null
}

export function summarize(row, heroMap, gameMap) {
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

export function aggregateHeroStats(heroId, attackRows, defendRows) {
  const seen = new Map()
  ;[...attackRows, ...defendRows].forEach((row) => {
    if (row?.id && !seen.has(row.id)) {
      seen.set(row.id, row)
    }
  })

  let wins = 0
  let losses = 0
  let draws = 0

  seen.forEach((row) => {
    if (!row) return
    const attackers = Array.isArray(row.attacker_hero_ids) ? row.attacker_hero_ids : []
    const defenders = Array.isArray(row.defender_hero_ids) ? row.defender_hero_ids : []

    const isAttacker = attackers.includes(heroId)
    const isDefender = defenders.includes(heroId)

    if (!isAttacker && !isDefender) return

    if (row.result === 'win') {
      wins += isAttacker ? 1 : 0
      losses += isDefender ? 1 : 0
    } else if (row.result === 'lose') {
      losses += isAttacker ? 1 : 0
      wins += isDefender ? 1 : 0
    } else {
      draws += 1
    }
  })

  const total = wins + losses + draws
  const winRate = total ? Math.round((wins / total) * 100) : 0

  return { wins, losses, draws, total, winRate }
}

//
