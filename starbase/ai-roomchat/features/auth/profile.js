const DEFAULT_PROFILE_NAME = '사용자'

export const EMPTY_PROFILE = {
  displayName: DEFAULT_PROFILE_NAME,
  avatarUrl: null,
}

export function deriveProfileFromUser(user) {
  if (!user) {
    return { ...EMPTY_PROFILE }
  }

  const metadata = user.user_metadata || {}
  const displayName =
    metadata.full_name ||
    metadata.name ||
    metadata.nickname ||
    (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
    DEFAULT_PROFILE_NAME

  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.avatar || null

  return {
    displayName,
    avatarUrl,
  }
}
