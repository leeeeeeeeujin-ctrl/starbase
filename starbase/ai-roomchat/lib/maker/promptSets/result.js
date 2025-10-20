export function asError(error, fallbackMessage) {
  if (!error) {
    return new Error(fallbackMessage)
  }

  if (error instanceof Error) {
    return error
  }

  if (typeof error === 'string' && error) {
    return new Error(error)
  }

  if (error && typeof error.message === 'string') {
    return new Error(error.message)
  }

  return new Error(fallbackMessage)
}

export function success(data) {
  return { data, error: null }
}

export function failure(error) {
  return { data: null, error }
}
