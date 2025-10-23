import { APIRequestContext, Page, request } from '@playwright/test'

type Session = {
  access_token: string
  refresh_token?: string
}

/**
 * Try to create a session via a test-only API endpoint or fallback to mocking.
 * Expects an environment variable TEST_USER_EMAIL/TEST_USER_PASSWORD or a
 * local endpoint `/api/test/session` that returns { access_token }.
 */
export async function createTestSession(): Promise<Session> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD

  if (email && password) {
    const api = await request.newContext({ baseURL })
    const res = await api.post('/api/test/session', { data: { email, password } })
    if (res.ok()) {
      const body = await res.json()
      return { access_token: body.access_token, refresh_token: body.refresh_token }
    }
  }

  // Fallback: return a fake token for local dev where APIs can't create sessions.
  return { access_token: 'fake-test-token' }
}

export async function injectSessionToPage(page: Page, session: Session) {
  // Common Supabase storage keys used by the app (localStorage)
  await page.addInitScript((token: string) => {
    try {
      localStorage.setItem('supabase.auth.token', token)
    } catch (e) {
      // ignore
    }
  }, JSON.stringify(session))
}
