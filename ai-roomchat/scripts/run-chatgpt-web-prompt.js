const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { chromium } = require('@playwright/test');

function usage() {
  console.log(`
Usage:
  node scripts/run-chatgpt-web-prompt.js --prompt-file path/to/prompt.txt [options]
  node scripts/run-chatgpt-web-prompt.js --prompt "..." [options]

Options:
  --prompt-file <path>     Read prompt from a file
  --prompt <text>          Inline prompt text
  --out <path>             Save result JSON to a file
  --expect <json|text>     Parse first fenced code block as JSON when set to json (default: text)
  --cleanup <delete|none>  Delete created chat after extraction when possible (default: delete)
  --profile-dir <path>     Chromium user data dir (default: tmp/chatgpt-web-profile)
  --headless               Run headless (default: false)
  --timeout <ms>           Per-step timeout in milliseconds (default: 120000)
  --help                   Show this help
`);
}

function readPrompt(argv) {
  if (argv.promptFile) {
    return fs.readFileSync(path.resolve(argv.promptFile), 'utf8');
  }
  if (argv.prompt) {
    return String(argv.prompt);
  }
  throw new Error('Missing --prompt or --prompt-file');
}

async function clickFirst(page, candidates, timeout = 1500) {
  for (const candidate of candidates) {
    try {
      const locator = page.locator(candidate).first();
      if (await locator.isVisible({ timeout })) {
        await locator.click({ timeout });
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function locateComposer(page, timeout) {
  const selectors = [
    '#prompt-textarea',
    'textarea[placeholder]',
    'textarea',
    '[contenteditable="true"][data-lexical-editor="true"]',
    '[contenteditable="true"]',
  ];

  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 1000 })) {
          return locator;
        }
      } catch (_) {}
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Could not find ChatGPT composer');
}

async function ensureLoggedIn(page, timeout) {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout });
  const composer = await locateComposer(page, timeout);
  await composer.waitFor({ state: 'visible', timeout });
}

async function startFreshChat(page) {
  const clicked = await clickFirst(page, [
    'button[aria-label*="New chat"]',
    'button[aria-label*="새 채팅"]',
    'button:has-text("New chat")',
    'button:has-text("새 채팅")',
    'a:has-text("New chat")',
    'a:has-text("새 채팅")',
  ]);
  if (clicked) {
    await page.waitForTimeout(1200);
    return;
  }
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
}

async function submitPrompt(page, prompt, timeout) {
  const composer = await locateComposer(page, timeout);
  await composer.click();
  try {
    await composer.fill(prompt);
  } catch (_) {
    await composer.evaluate((node, value) => {
      node.textContent = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, prompt);
  }

  const sendClicked = await clickFirst(page, [
    'button[aria-label*="Send prompt"]',
    'button[aria-label*="메시지 보내기"]',
    'button[data-testid="send-button"]',
  ], 500);

  if (!sendClicked) {
    await composer.press('Control+Enter').catch(() => {});
    await composer.press('Meta+Enter').catch(() => {});
    await composer.press('Enter');
  }
}

async function waitForResponse(page, timeout) {
  const assistantSelector = '[data-message-author-role="assistant"]';
  await page.waitForSelector(assistantSelector, { timeout });

  const started = Date.now();
  let settledRounds = 0;
  let lastAssistantText = '';

  while (Date.now() - started < timeout) {
    const stopVisible = await page.locator('button[aria-label*="Stop"], button:has-text("Stop generating"), button:has-text("중단")').first().isVisible().catch(() => false);
    const assistant = page.locator(assistantSelector).last();
    const currentText = (await assistant.innerText().catch(() => '')).trim();

    if (!stopVisible && currentText && currentText === lastAssistantText) {
      settledRounds += 1;
      if (settledRounds >= 3) {
        return;
      }
    } else {
      settledRounds = 0;
    }

    lastAssistantText = currentText;
    await page.waitForTimeout(1000);
  }

  throw new Error('Timed out waiting for assistant response to settle');
}

async function extractResponse(page) {
  const assistant = page.locator('[data-message-author-role="assistant"]').last();
  const text = (await assistant.innerText()).trim();
  const codeBlocks = await assistant.locator('pre code').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent || '').filter(Boolean)
  );

  return {
    text,
    codeBlocks,
    firstCodeBlock: codeBlocks[0] || null,
  };
}

function parseResult(extracted, expectType) {
  if (expectType !== 'json') {
    return { parsed: null, parseError: null };
  }

  const block = extracted.firstCodeBlock;
  if (!block) {
    return { parsed: null, parseError: 'No fenced code block found' };
  }

  try {
    return { parsed: JSON.parse(block), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: error.message };
  }
}

async function cleanupConversation(page) {
  const clickedMenu = await clickFirst(page, [
    'button[aria-label*="More"]',
    'button[aria-label*="more"]',
    'button[aria-label*="options"]',
    'button[aria-label*="옵션"]',
    'button:has-text("More")',
    'button:has-text("더보기")',
  ], 1000);

  if (!clickedMenu) {
    return { cleaned: false, reason: 'menu_not_found' };
  }

  const clickedDelete = await clickFirst(page, [
    'button:has-text("Delete")',
    'button:has-text("삭제")',
    '[role="menuitem"]:has-text("Delete")',
    '[role="menuitem"]:has-text("삭제")',
  ], 1000);

  if (!clickedDelete) {
    return { cleaned: false, reason: 'delete_action_not_found' };
  }

  const confirmed = await clickFirst(page, [
    'button:has-text("Delete")',
    'button:has-text("삭제")',
    'button:has-text("Confirm")',
    'button:has-text("확인")',
  ], 1000);

  await page.waitForTimeout(1000);
  return {
    cleaned: confirmed,
    reason: confirmed ? 'deleted' : 'delete_confirm_not_found',
  };
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['prompt', 'prompt-file', 'out', 'expect', 'cleanup', 'profile-dir', 'timeout'],
    boolean: ['headless', 'help'],
    alias: {
      h: 'help',
    },
    default: {
      expect: 'text',
      cleanup: 'delete',
      headless: false,
      timeout: '120000',
    },
  });

  if (argv.help) {
    usage();
    return;
  }

  const prompt = readPrompt({
    prompt: argv.prompt,
    promptFile: argv['prompt-file'],
  });

  const profileDir = path.resolve(argv['profile-dir'] || path.join(process.cwd(), 'tmp', 'chatgpt-web-profile'));
  const timeout = Number(argv.timeout) || 120000;

  fs.mkdirSync(profileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: Boolean(argv.headless),
    viewport: { width: 1440, height: 960 },
  });

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  const startedAt = new Date().toISOString();
  const initialUrl = page.url();
  let extracted = null;
  let parsed = null;
  let parseError = null;
  let cleanup = null;

  try {
    await ensureLoggedIn(page, timeout);
    await startFreshChat(page);
    const beforeSubmitUrl = page.url();
    await submitPrompt(page, prompt, timeout);
    await waitForResponse(page, timeout);
    extracted = await extractResponse(page);
    ({ parsed, parseError } = parseResult(extracted, argv.expect));

    if (argv.cleanup === 'delete') {
      cleanup = await cleanupConversation(page);
    } else {
      cleanup = { cleaned: false, reason: 'cleanup_disabled' };
    }

    const payload = {
      ok: !parseError,
      startedAt,
      profileDir,
      initialUrl,
      beforeSubmitUrl,
      finalUrl: page.url(),
      prompt,
      expect: argv.expect,
      response: extracted,
      parsed,
      parseError,
      cleanup,
    };

    const serialized = JSON.stringify(payload, null, 2);
    if (argv.out) {
      const outPath = path.resolve(argv.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, serialized, 'utf8');
      console.log(`Saved result to ${outPath}`);
    } else {
      console.log(serialized);
    }
  } catch (error) {
    const screenshotPath = path.join(process.cwd(), 'tmp', 'chatgpt-web-error.png');
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const failure = {
      ok: false,
      startedAt,
      profileDir,
      finalUrl: page.url(),
      prompt,
      error: error.message,
      screenshotPath,
      response: extracted,
      parsed,
      parseError,
      cleanup,
    };
    const serialized = JSON.stringify(failure, null, 2);
    if (argv.out) {
      const outPath = path.resolve(argv.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, serialized, 'utf8');
    }
    console.error(serialized);
    process.exitCode = 1;
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
