import { test, expect } from '@playwright/test';

test.describe('smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    const resp = await page.goto('/', { waitUntil: 'networkidle' });
    // ensure we got an HTTP-level response
    expect(resp && resp.ok()).toBeTruthy();

    // basic DOM sanity checks
    await expect(page.locator('body')).toBeVisible();
  });
});
