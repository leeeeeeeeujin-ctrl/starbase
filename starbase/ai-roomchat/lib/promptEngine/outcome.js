import { linesOf } from './utils'

export function parseOutcome(assistantText = '') {
  const arr = linesOf(assistantText)
  const lastLine = (arr[arr.length - 1] || '').trim()
  const secondLast = (arr[arr.length - 2] || '').trim()
  const variables = secondLast
    ? secondLast.split(/\s+/).map((part) => part.trim()).filter(Boolean)
    : []

  return { lastLine, variables }
}
