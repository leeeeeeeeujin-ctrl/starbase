import { test, expect } from '@playwright/test';

// This test expects the dev server to run with NEXT_PUBLIC_WORKSPACE_DEBUG=1 so
// the provider exposes `window.__WORKSPACE_INSPECTOR__` allowing controlled writes.

test('workspace isolation across two sets', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  const idA = 'playwright-A';
  const idB = 'playwright-B';

  // navigate and wait for provider init
  await pageA.goto(`http://localhost:3000/prompts/${encodeURIComponent(idA)}/edit`, { waitUntil: 'networkidle' });
  await pageB.goto(`http://localhost:3000/prompts/${encodeURIComponent(idB)}/edit`, { waitUntil: 'networkidle' });

  // Wait until inspector is present and namespace is correct
  await expect.poll(async () => {
    return await pageA.evaluate(() => (window.__WORKSPACE_INSPECTOR__ && window.__WORKSPACE_INSPECTOR__.ns) || null);
  }, { timeout: 5000 }).toBe(idA);
  await expect.poll(async () => {
    return await pageB.evaluate(() => (window.__WORKSPACE_INSPECTOR__ && window.__WORKSPACE_INSPECTOR__.ns) || null);
  }, { timeout: 5000 }).toBe(idB);

  // Assert localStorage keys exist and are namespaced
  const keysA = await pageA.evaluate(() => Object.keys(window.localStorage));
  const keysB = await pageB.evaluate(() => Object.keys(window.localStorage));
  expect(keysA.some(k => k.startsWith('workspace.vfs.v1@'))).toBeTruthy();
  expect(keysB.some(k => k.startsWith('workspace.vfs.v1@'))).toBeTruthy();
  // No bare global key in either context
  expect(keysA.includes('workspace.vfs.v1')).toBeFalsy();
  expect(keysB.includes('workspace.vfs.v1')).toBeFalsy();

  // Listen for PUT requests from pageA and pageB
  let aPutCount = 0;
  let bPutCount = 0;
  pageA.on('request', (req) => {
    if (req.method().toUpperCase() === 'PUT' && /\/api\/workspace\/sets\//.test(req.url())) aPutCount++;
  });
  pageB.on('request', (req) => {
    if (req.method().toUpperCase() === 'PUT' && /\/api\/workspace\/sets\//.test(req.url())) bPutCount++;
  });

  // Perform an edit in A only via debug inspector
  await pageA.evaluate(() => {
    try {
      window.__WORKSPACE_INSPECTOR__.api.writeFile('/test-playwright.txt', 'content-A');
    } catch (e) { console.error(e); }
  });

  // Wait briefly for autosave debounce to trigger
  await pageA.waitForTimeout(1200);

  // Expect A made at least one PUT, B made none
  expect(aPutCount).toBeGreaterThan(0);
  expect(bPutCount).toBe(0);

  // Verify file exists in A but not in B
  const aHas = await pageA.evaluate(() => !!window.__WORKSPACE_INSPECTOR__.api.files['/test-playwright.txt']);
  const bHas = await pageB.evaluate(() => !!window.__WORKSPACE_INSPECTOR__.api.files['/test-playwright.txt']);
  expect(aHas).toBe(true);
  expect(bHas).toBe(false);

  // Reload both and verify persisted isolation
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageB.reload({ waitUntil: 'networkidle' });

  const aHasAfter = await pageA.evaluate(() => !!window.__WORKSPACE_INSPECTOR__.api.files['/test-playwright.txt']);
  const bHasAfter = await pageB.evaluate(() => !!window.__WORKSPACE_INSPECTOR__.api.files['/test-playwright.txt']);
  expect(aHasAfter).toBe(true);
  expect(bHasAfter).toBe(false);

  await ctxA.close();
  await ctxB.close();
});
