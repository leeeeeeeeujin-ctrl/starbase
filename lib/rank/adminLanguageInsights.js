const MIN_TOKEN_MATCHES = 4
const MIN_SENTENCE_MATCHES = 2
const MAX_SENTENCE_LENGTH = 160
const TOKEN_REGEX = /[\p{L}\p{N}]+/gu
const SENTENCE_SPLIT_REGEX = /[.!?\n]+/g

function toObject(value) {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      return {}
    }
  }
  if (typeof value === 'object') {
    return value
  }
  return {}
}

function normalizeOutcome(raw) {
  if (!raw || typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  if (!value) return null
  if (value === 'victory' || value === 'won') return 'win'
  if (value === 'defeat' || value === 'loss' || value === 'lose' || value === 'lost') return 'lose'
  if (value === 'draw' || value === 'tie' || value === 'neutral') return 'draw'
  if (value === 'win' || value === 'lose') return value
  return null
}

function extractTokens(text) {
  if (!text || typeof text !== 'string') return []
  const matches = text.toLowerCase().match(TOKEN_REGEX)
  if (!matches) return []
  return matches
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 24)
}

function extractSentences(text) {
  if (!text || typeof text !== 'string') return []
  const parts = text
    .split(SENTENCE_SPLIT_REGEX)
    .map((part) => part.trim())
    .filter((part) => part.length >= 10)

  return parts.map((sentence) => {
    if (sentence.length <= MAX_SENTENCE_LENGTH) return sentence
    return `${sentence.slice(0, MAX_SENTENCE_LENGTH - 1)}…`
  })
}

function ensureTokenEntry(map, token) {
  if (!map.has(token)) {
    map.set(token, {
      token,
      occurrences: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    })
  }
  return map.get(token)
}

function ensureSentenceEntry(map, canonical, sample) {
  if (!map.has(canonical)) {
    map.set(canonical, {
      key: canonical,
      sample,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    })
  }
  return map.get(canonical)
}

function pushOutcome(entry, outcome) {
  if (!outcome) return
  if (outcome === 'win') {
    entry.wins += 1
  } else if (outcome === 'lose') {
    entry.losses += 1
  } else if (outcome === 'draw') {
    entry.draws += 1
  }
}

function computeWinRate(entry) {
  const total = entry.wins + entry.losses
  if (!total) return null
  return entry.wins / total
}

function assignTier(delta) {
  if (delta === null || delta === undefined) return 'B'
  if (delta >= 0.15) return 'S'
  if (delta >= 0.07) return 'A'
  if (delta <= -0.15) return 'D'
  if (delta <= -0.07) return 'C'
  return 'B'
}

export function buildAdminLanguageInsights(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : []

  const tokenStats = new Map()
  const sentenceStats = new Map()
  const baseline = { wins: 0, losses: 0, draws: 0 }

  for (const row of safeRows) {
    if (!row) continue
    const text = typeof row.ai_response === 'string' && row.ai_response.trim()
      ? row.ai_response
      : typeof row.aiResponse === 'string' && row.aiResponse.trim()
      ? row.aiResponse
      : typeof row.prompt === 'string' && row.prompt.trim()
      ? row.prompt
      : null

    if (!text) continue

    const meta = toObject(row.meta)
    const battle = row.battle && typeof row.battle === 'object' ? row.battle : {}
    const outcome =
      normalizeOutcome(meta.outcome || meta.result || meta.outcomeLabel) ||
      normalizeOutcome(row.result || row.outcome) ||
      normalizeOutcome(battle.result)

    if (!outcome) continue

    pushOutcome(baseline, outcome)

    const tokens = extractTokens(text)
    if (tokens.length) {
      const tokenCounts = new Map()
      for (const token of tokens) {
        tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1)
      }
      for (const [token, count] of tokenCounts) {
        const entry = ensureTokenEntry(tokenStats, token)
        entry.matches += 1
        entry.occurrences += count
        pushOutcome(entry, outcome)
      }
    }

    const sentences = extractSentences(text)
    if (sentences.length) {
      const seen = new Set()
      for (const sentence of sentences) {
        const canonical = sentence.toLowerCase()
        if (seen.has(canonical)) continue
        seen.add(canonical)
        const entry = ensureSentenceEntry(sentenceStats, canonical, sentence)
        entry.matches += 1
        pushOutcome(entry, outcome)
      }
    }
  }

  const baselineTotal = baseline.wins + baseline.losses
  const baselineWinRate = baselineTotal ? baseline.wins / baselineTotal : null

  const tokensArray = Array.from(tokenStats.values()).map((entry) => {
    const winRate = computeWinRate(entry)
    const delta = winRate !== null && baselineWinRate !== null ? winRate - baselineWinRate : null
    return {
      ...entry,
      winRate,
      delta,
    }
  })

  const filteredTokens = tokensArray.filter((entry) => entry.matches >= MIN_TOKEN_MATCHES && entry.winRate !== null)
  filteredTokens.sort((a, b) => b.matches - a.matches)
  const maxMatches = filteredTokens.length ? filteredTokens[0].matches : 1

  const topByFrequency = filteredTokens.slice(0, 8)

  const topPositive = filteredTokens
    .filter((entry) => entry.delta !== null && entry.delta > 0)
    .sort((a, b) => {
      if (b.delta === a.delta) return b.matches - a.matches
      return b.delta - a.delta
    })
    .slice(0, 6)

  const topNegative = filteredTokens
    .filter((entry) => entry.delta !== null && entry.delta < 0)
    .sort((a, b) => {
      if (a.delta === b.delta) return b.matches - a.matches
      return a.delta - b.delta
    })
    .slice(0, 6)

  const sentenceArray = Array.from(sentenceStats.values()).map((entry) => {
    const winRate = computeWinRate(entry)
    const delta = winRate !== null && baselineWinRate !== null ? winRate - baselineWinRate : null
    const tier = assignTier(delta)
    return {
      ...entry,
      winRate,
      delta,
      tier,
    }
  })

  const filteredSentences = sentenceArray.filter(
    (entry) => entry.matches >= MIN_SENTENCE_MATCHES && entry.winRate !== null,
  )

  const sentenceTiers = { S: [], A: [], B: [], C: [], D: [] }
  for (const entry of filteredSentences) {
    if (!sentenceTiers[entry.tier]) {
      sentenceTiers[entry.tier] = []
    }
    sentenceTiers[entry.tier].push(entry)
  }

  Object.keys(sentenceTiers).forEach((tier) => {
    sentenceTiers[tier].sort((a, b) => {
      if (b.delta !== a.delta && a.delta !== null && b.delta !== null) {
        return tier === 'D' || tier === 'C' ? a.delta - b.delta : b.delta - a.delta
      }
      return b.matches - a.matches
    })
    sentenceTiers[tier] = sentenceTiers[tier].slice(0, 5)
  })

  const topSentencePositive = filteredSentences
    .filter((entry) => entry.delta !== null && entry.delta > 0)
    .sort((a, b) => {
      if (b.delta === a.delta) return b.matches - a.matches
      return b.delta - a.delta
    })
    .slice(0, 5)

  const topSentenceNegative = filteredSentences
    .filter((entry) => entry.delta !== null && entry.delta < 0)
    .sort((a, b) => {
      if (a.delta === b.delta) return b.matches - a.matches
      return a.delta - b.delta
    })
    .slice(0, 5)

  return {
    baseline: {
      wins: baseline.wins,
      losses: baseline.losses,
      draws: baseline.draws,
      winRate: baselineWinRate,
    },
    tokens: {
      total: filteredTokens.length,
      maxMatches: maxMatches || 1,
      topByFrequency,
      topPositive,
      topNegative,
    },
    sentences: {
      tiers: sentenceTiers,
      topPositive: topSentencePositive,
      topNegative: topSentenceNegative,
    },
    sampleSize: safeRows.length,
  }
}

export default buildAdminLanguageInsights
