export function requireUser(user) {
  if (user) {
    return true
  }

  alert('로그인이 필요합니다.')
  return false
}

export function requireNonEmpty(value, message) {
  if (value) {
    return true
  }

  alert(message)
  return false
}

export function requireList(list, message) {
  if (Array.isArray(list) && list.length > 0) {
    return true
  }

  alert(message)
  return false
}
