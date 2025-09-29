import { linesOf } from './utils'

export function parseOutcome(assistantText = '') {
  const arr = linesOf(assistantText)
  const lastLine = (arr[arr.length - 1] || '').trim()
  const secondLast = (arr[arr.length - 2] || '').trim()
  const thirdLast = (arr[arr.length - 3] || '').trim()

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
