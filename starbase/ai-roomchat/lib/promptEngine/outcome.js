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
  const thirdLast = endIndex - 2 >= 0 ? (arr[endIndex - 2] || '').trim() : ''

  const normalizedSecond = secondLast.toLowerCase()
  const variables =
    normalizedSecond && normalizedSecond !== 'none' && !normalizedSecond.includes('없음')
      ? secondLast.split(/\s+/).map((part) => part.trim()).filter(Boolean)
      : []

  let actors = []
  if (thirdLast) {
    const normalizedThird = thirdLast.toLowerCase()
    if (normalizedThird !== 'none' && !normalizedThird.includes('없음')) {
      const parts = thirdLast.includes(',')
        ? thirdLast.split(',')
        : thirdLast.split(/\s+/)
      actors = parts.map((part) => part.trim()).filter(Boolean)
    }
  }

  return { lastLine, variables, actors }
}
