import { supabase } from './supabase'

const DEFAULT_PROFILE_NAME = '사용자'

function deriveProfileFromMetadata(user) {
  if (!user) {
    return { displayName: DEFAULT_PROFILE_NAME, avatarUrl: null }
  }

  const metadata = user.user_metadata || {}
  const emailPrefix = typeof user.email === 'string' ? user.email.split('@')[0] : ''

  const displayName =
    metadata.full_name ||
    metadata.name ||
    metadata.nickname ||
    metadata.preferred_username ||
    emailPrefix ||
    DEFAULT_PROFILE_NAME

  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.avatar || null

  return { displayName, avatarUrl }
}

function sanitiseUrlAfterAuth(url) {
  if (typeof window === 'undefined') return
  try {
    window.history.replaceState({}, document.title, url)
  } catch (error) {
    console.error('Failed to clean PKCE callback url', error)
  }
}

export async function bootstrapUserFromUrl(href) {
  if (typeof window === 'undefined') {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    const user = data?.session?.user || null
    return { user, profile: deriveProfileFromMetadata(user) }
  }

  const url = new URL(href || window.location.href)

  if (url.searchParams.has('error_description')) {
    const message = decodeURIComponent(url.searchParams.get('error_description'))
    sanitiseUrlAfterAuth(`${url.origin}${url.pathname}`)
    throw new Error(message || '로그인 중 문제가 발생했습니다. 다시 시도해 주세요.')
  }

  if (url.searchParams.has('code')) {
    const authCode = url.searchParams.get('code')
    const verifier = url.searchParams.get('code_verifier') || undefined
    const result = await supabase.auth.exchangeCodeForSession({ authCode, verifier })
    if (result.error) {
      sanitiseUrlAfterAuth(`${url.origin}${url.pathname}`)
      throw result.error
    }
    sanitiseUrlAfterAuth(`${url.origin}${url.pathname}`)
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) throw sessionError

  let user = session?.user || null

  if (!user) {
    const {
      data: { user: fetchedUser },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError) throw userError
    user = fetchedUser || null
  }

  return { user, profile: deriveProfileFromMetadata(user) }
}
