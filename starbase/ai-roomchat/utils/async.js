export function sleep(durationMs) {
  const duration = Number(durationMs)
  if (!Number.isFinite(duration) || duration <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  })
}

export async function retryAsync(operation, options = {}) {
  const {
    retries = 0,
    delay = 0,
    onRetry,
  } = options

  const maxAttempts = Math.max(0, retries) + 1
  let attempt = 0
  let lastError = null

  while (attempt < maxAttempts) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === maxAttempts - 1
      if (isLastAttempt) {
        break
      }

      if (typeof onRetry === 'function') {
        try {
          onRetry(error, attempt)
        } catch (callbackError) {
          console.error('retryAsync onRetry callback failed:', callbackError)
        }
      }

      const computedDelay = typeof delay === 'function' ? delay(attempt, error) : delay
      const waitMs = Number(computedDelay)
      if (Number.isFinite(waitMs) && waitMs > 0) {
        await sleep(waitMs)
      }
    }

    attempt += 1
  }

  throw lastError
}
