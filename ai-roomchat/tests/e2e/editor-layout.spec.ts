import { test, expect } from '@playwright/test';

async function openCodeEditorOverlay(page) {
  await page.goto('http://localhost:3000/maker/test', { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Open tools dropdown and click "코드 에디터"
  const toolsBtn = page.locator('button:has-text("도구")');
  await toolsBtn.first().waitFor({ state: 'visible', timeout: 20000 });
  await toolsBtn.first().click();
  const codeBtn = page.getByRole('button', { name: /코드 에디터/i });
  await codeBtn.click();
  // Wait for overlay header within the dialog
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('strong:has-text("코드 에디터")').first().waitFor({ state: 'visible', timeout: 20000 });
}

async function expectOverlayFitsViewport(page) {
  // Locate inner content container: role=dialog -> inner content div (stopPropagation container)
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  const content = dialog.locator('> div');
  await expect(content).toBeVisible();

  const winH = await page.evaluate(() => window.innerHeight);
  const { height } = await content.boundingBox() || { height: 0 };
  // Allow small tolerance due to device pixel rounding
  expect(Math.abs(height - winH)).toBeLessThanOrEqual(4);

  // Body scroll should be locked
  const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(bodyOverflow === 'hidden' || bodyOverflow === 'clip').toBeTruthy();
}

test.describe('코드 에디터 오버레이 레이아웃', () => {
  test('데스크톱 뷰포트에서 화면에 딱 맞게 채움', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openCodeEditorOverlay(page);
    await expectOverlayFitsViewport(page);
  });

  test('모바일 뷰포트(iPhone 12 유사)에서 화면에 딱 맞게 채움', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCodeEditorOverlay(page);
    await expectOverlayFitsViewport(page);
  });
});
