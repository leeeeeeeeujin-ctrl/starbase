import { supabase } from './supabase'

/**
 * Starts a Google OAuth redirect flow using Supabase.
 * @param {Object} options
 * @param {string} options.origin - The current window origin.
 * @param {string} [options.redirectPath='/auth-callback'] - Relative callback path.
 * @returns {Promise<{status:'redirect', url:string} | {status:'error', message:string}>}
 */
export async function startGoogleOAuth({ origin, redirectPath = '/auth-callback' }) {
  try {
    const redirectTo = `${origin}${redirectPath.startsWith('/') ? '' : '/'}${redirectPath}`
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })

    if (error) {
      return { status: 'error', message: error.message }
    }

    if (data?.url) {
      return { status: 'redirect', url: data.url }
    }

    return { status: 'error', message: '로그인 URL을 가져오지 못했습니다.' }
  } catch (error) {
    console.error(error)
    return { status: 'error', message: '로그인 초기화 중 오류가 발생했습니다.' }
  }
}

/**
 * Handles Supabase OAuth callback processing and returns the next navigation step.
 * @param {Object} options
 * @param {string} options.href - Current browser href.
 * @returns {Promise<
 *   | { status: 'redirect', path: string, message: string }
 *   | { status: 'error', message: string, retryPath: string }
 * >}
 */
export async function handleOAuthCallback({ href }) {
  try {
    if (!href) {
      return {
        status: 'error',
        message: '잘못된 접근입니다. 홈으로 이동합니다.',
        retryPath: '/',
      }
    }

    const currentUrl = new URL(href)
    const code = currentUrl.searchParams.get('code')
    const errorDescription = currentUrl.searchParams.get('error_description')
    const next = sanitizeNextPath(currentUrl.searchParams.get('next'))

    if (errorDescription) {
      return {
        status: 'error',
        message: `로그인 실패: ${decodeURIComponent(errorDescription)}`,
        retryPath: '/',
      }
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw sessionError
    }

    if (!sessionData?.session) {
      if (!code) {
        return {
          status: 'error',
          message: '로그인 코드가 존재하지 않습니다. 홈으로 이동합니다.',
          retryPath: '/',
        }
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession({
        authCode: code,
      })
      if (exchangeError) {
        console.error(exchangeError)
        return {
          status: 'error',
          message: `로그인 실패: ${exchangeError.message}`,
          retryPath: '/',
        }
      }
    }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) {
      throw userError
    }

    if (userData?.user) {
      return {
        status: 'redirect',
        path: next,
        message: '로그인 완료! 이동 중…',
      }
    }

    return {
      status: 'error',
      message: '로그인 실패. 홈으로 이동합니다.',
      retryPath: '/',
    }
  } catch (error) {
    console.error(error)
    return {
      status: 'error',
      message: '로그인 처리 중 오류가 발생했습니다. 홈으로 이동합니다.',
      retryPath: '/',
    }
  }
}

export function sanitizeNextPath(raw) {
  if (!raw || raw === '/' || raw === '') {
    return '/roster'
  }

  if (/^https?:/i.test(raw) || raw.startsWith('//')) {
    return '/roster'
  }

  return raw.startsWith('/') ? raw : `/${raw}`
}
