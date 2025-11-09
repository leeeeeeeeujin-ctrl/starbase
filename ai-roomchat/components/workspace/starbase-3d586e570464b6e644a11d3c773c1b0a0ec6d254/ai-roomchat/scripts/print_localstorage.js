const { chromium } = require('@playwright/test');
(async ()=>{
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const id = 'playwright-A';
  await page.goto(`http://localhost:3000/prompts/${encodeURIComponent(id)}/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  console.log('localStorage keys:', keys);
  const inspector = await page.evaluate(() => ({ ns: window.__WORKSPACE_INSPECTOR__?.ns, filesCount: Object.keys(window.__WORKSPACE_INSPECTOR__?.api?.files||{}).length }));
  console.log('inspector:', inspector);
  await browser.close();
})();
