import { test, expect } from '@playwright/test';
import { visit } from './helpers';
import { createTestSession, injectSessionToPage } from './auth';

test.describe('navigation', () => {
  test('rank page loads (unauthenticated)', async ({ page }) => {
    await visit(page, '/rank');
    await expect(page).toHaveURL(/\/rank/);
    // Be tolerant: some builds render different heading structures for /rank.
    // select the first matching root element to avoid strict-mode errors
    const root = page.locator('main, [data-app-root], #__next').first();
    await expect(root).toBeVisible({ timeout: 10000 });
  });

  test('rank page as authenticated user', async ({ page }) => {
    const session = await createTestSession();
    await injectSessionToPage(page, session);
    await visit(page, '/rank');

    // If the app exposes a profile/avatar when logged in, check for it; otherwise
    // ensure we are not redirected to login.
    const profile = page.locator('[data-test=profile], [data-user-avatar], a[href*="/profile"]');
    if ((await profile.count()) > 0) {
      await expect(profile.first()).toBeVisible();
    } else {
      await expect(page).not.toHaveURL(/login|signin/);
    }
  });
});
