import { Page } from '@playwright/test'

export async function waitForAppReady(page: Page) {
  // Wait for root element or app-specific indicator
  await page.waitForSelector('#__next, [data-app-root]', { timeout: 10000 })
}

export async function visit(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'networkidle' })
  await waitForAppReady(page)
}
