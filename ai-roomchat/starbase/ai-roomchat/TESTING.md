Testing guide — E2E and secrets

This project provides a dev-only test session endpoint to support Playwright E2E tests that require real user sessions.

1. Enabling the endpoint (local / vercel staging)

- Set the environment variable `ENABLE_TEST_ENDPOINT=true` in your local .env or in Vercel project settings for staging only.
- IMPORTANT: Do NOT enable this in production. The endpoint can create test users using the service role key.

2. Required environment variables (on Vercel/staging)

- `ENABLE_TEST_ENDPOINT=true`
- `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` (used by Playwright tests if provided)
- `SUPABASE_SERVICE_ROLE` (already required by the app for supabaseAdmin usage)

3. How Playwright uses it

- `tests/e2e/auth.ts` will POST to `/api/test/session` with `{ email, password }` to obtain an `access_token`.
- The token is injected into the browser context (localStorage) so tests can run as an authenticated user.

4. GitHub Actions / Secrets

- Do NOT commit credentials to the repo. Add `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` as GitHub Secrets in the repository settings.
- Add `SUPABASE_SERVICE_ROLE` as a GitHub Secret if you want CI to create the test user.
- The Playwright workflow reads these secrets via the Actions environment configuration.

5. Security notes

- Limit the privileges of the test user in your Supabase project (create a user with minimal permissions if possible).
- Rotate or delete test users regularly.
- Only enable `ENABLE_TEST_ENDPOINT` for non-production environments.
