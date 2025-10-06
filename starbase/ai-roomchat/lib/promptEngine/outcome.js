import { linesOf } from './utils'

export function parseOutcome(assistantText = '') {
  const arr = linesOf(assistantText)
  let endIndex = arr.length - 1

  while (endIndex >= 0) {
    const candidate = arr[endIndex]
    if (!candidate || !candidate.trim()) {
      endIndex -= 1
      continue
    }
    break
  }

  const lastLine = endIndex >= 0 ? (arr[endIndex] || '').trim() : ''
  const secondLast = endIndex - 1 >= 0 ? (arr[endIndex - 1] || '').trim() : ''
  const thirdLastRaw = endIndex - 2 >= 0 ? (arr[endIndex - 2] || '').trim() : ''

  const normalizedSecond = secondLast.toLowerCase()
  let variables = []
  if (normalizedSecond && normalizedSecond !== 'none' && !normalizedSecond.includes('없음')) {
    const tokenSource = secondLast.replace(/[|·,:;\\/]+/g, ' ')
    const parts = tokenSource
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
    const seen = new Set()
    let sawNoneToken = false
    const filtered = []
    for (const part of parts) {
      const key = part.toLowerCase()
      if (key === 'none' || key.includes('없음')) {
        sawNoneToken = true
        continue
      }
      if (seen.has(key)) continue
      seen.add(key)
      filtered.push(part)
    }
    variables = sawNoneToken ? [] : filtered
  }

  let actors = []
  if (thirdLastRaw) {
    const labelPatterns = [/^주역\s*[:\-]/i, /^actors?\s*[:\-]/i, /^focus\s*[:\-]/i]
    let thirdLast = thirdLastRaw
    for (const pattern of labelPatterns) {
      if (pattern.test(thirdLast)) {
        thirdLast = thirdLast.replace(pattern, '').trim()
        break
      }
    }
    const normalizedThird = thirdLast.toLowerCase()
    if (thirdLast && normalizedThird !== 'none' && !normalizedThird.includes('없음')) {
      const tokenSource = thirdLast
        .replace(/[|·/\\]+/g, ',')
        .replace(/\s+/g, ' ')
        .trim()
      const usesComma = tokenSource.includes(',')
      const parts = tokenSource.split(usesComma ? /,/ : /\s+/)
      const seen = new Set()
      const filtered = []
      for (const part of parts) {
        const cleaned = part.replace(/[,:;]+/g, ' ').trim()
        if (!cleaned) continue
        const key = cleaned.toLowerCase()
        if (key === 'none' || key.includes('없음')) {
          continue
        }
        if (seen.has(key)) continue
        seen.add(key)
        filtered.push(cleaned)
      }
      actors = filtered
    }
  }

  return { lastLine, variables, actors }
}
