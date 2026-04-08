const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { chromium } = require('@playwright/test');

const PROVIDERS = {
  chatgpt: {
    id: 'chatgpt',
    startUrl: 'https://chatgpt.com/',
    composerSelectors: [
      '#prompt-textarea',
      'textarea[placeholder]',
      'textarea',
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[contenteditable="true"]',
    ],
    responseSelectors: ['[data-message-author-role="assistant"]'],
    codeSelectors: ['pre code'],
    stopSelectors: [
      'button[aria-label*="Stop"]',
      'button:has-text("Stop generating")',
      'button:has-text("중단")',
    ],
    freshStart: async (page, timeout, clickFirst) => {
      const clicked = await clickFirst(page, [
        'button[aria-label*="New chat"]',
        'button[aria-label*="새 채팅"]',
        'button:has-text("New chat")',
        'button:has-text("새 채팅")',
        'a:has-text("New chat")',
        'a:has-text("새 채팅")',
      ]);
      if (!clicked) {
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout });
      }
      await page.waitForTimeout(1200);
    },
    cleanupSupported: true,
  },
  'wrtn-gpt5': {
    id: 'wrtn-gpt5',
    startUrl: 'https://wrtn.ai/',
    composerSelectors: ['textarea[placeholder]', 'textarea', '[contenteditable="true"]', 'input[type="text"]'],
    responseSelectors: [
      'article',
      '[data-testid*="message"]',
      '[class*="message"]',
      '[class*="chat"] [class*="bubble"]',
    ],
    codeSelectors: ['pre code', 'code'],
    stopSelectors: [
      'button:has-text("중단")',
      'button:has-text("Stop")',
      'button:has-text("생성 중지")',
    ],
    settleRounds: 2,
    dismissOverlaySelectors: [
      'button[aria-label="닫기"]',
      'button[aria-label*="close"]',
      'button[aria-label*="Close"]',
      'button:has-text("닫기")',
      '[role="dialog"] button:has-text("나중에")',
      '[role="dialog"] button:has-text("다음에")',
      '[role="dialog"] button:has-text("건너뛰기")',
      '[role="dialog"] button:has-text("취소")',
    ],
    freshStart: async (page, timeout, clickFirst) => {
      await page.goto('https://wrtn.ai/', { waitUntil: 'domcontentloaded', timeout });
      await page.waitForTimeout(1200);
      await dismissOverlays(page, [
        'button[aria-label="닫기"]',
        'button:has-text("닫기")',
        '[role="dialog"] button:has-text("나중에")',
        '[role="dialog"] button:has-text("건너뛰기")',
      ]);
      await clickFirst(page, [
        'text=GPT-5',
        'button:has-text("GPT-5")',
        'a:has-text("GPT-5")',
        'img[alt*="GPT-5"]',
      ], 2500).catch(() => false);
      await page.waitForTimeout(1500);
    },
    cleanupSupported: true,
  },
};

function usage() {
  console.log(`
Usage:
  node scripts/run-chatgpt-web-prompt.js --prompt-file path/to/prompt.txt [options]
  node scripts/run-chatgpt-web-prompt.js --prompt "..." [options]

Options:
  --prompt-file <path>     Read prompt from a file
  --prompt <text>          Inline prompt text
  --out <path>             Save result JSON to a file
  --provider <name>        wrtn-gpt5 or chatgpt (default: wrtn-gpt5)
  --expect <json|text>     Parse first fenced code block as JSON when set to json (default: text)
  --cleanup <delete|none>  Delete created chat after extraction when possible (default: delete)
  --profile-dir <path>     Chromium user data dir (default: tmp/chatgpt-web-profile)
  --user-data-dir <path>   Browser user data dir (preferred over --profile-dir)
  --profile-name <name>    Existing Chrome profile name, for example Default or Profile 1
  --browser-channel <name> Browser channel to launch (default: chromium, use chrome for installed Chrome)
  --executable-path <path> Explicit browser executable path
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

async function dismissOverlays(page, selectors) {
  for (let round = 0; round < 4; round += 1) {
    const clicked = await clickFirst(page, selectors, 750);
    if (!clicked) {
      break;
    }
    await page.waitForTimeout(600);
  }
}

async function locateComposer(page, timeout, selectors) {
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
  throw new Error('Could not find provider composer');
}

async function ensureLoggedIn(page, timeout, provider) {
  await page.goto(provider.startUrl, { waitUntil: 'domcontentloaded', timeout });
  if (provider.dismissOverlaySelectors?.length) {
    await dismissOverlays(page, provider.dismissOverlaySelectors);
  }
  const composer = await locateComposer(page, timeout, provider.composerSelectors);
  await composer.waitFor({ state: 'visible', timeout });
}

async function submitPrompt(page, prompt, timeout, provider) {
  const composer = await locateComposer(page, timeout, provider.composerSelectors);
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
    'button:has-text("보내기")',
    'button:has-text("전송")',
  ], 500);

  if (!sendClicked) {
    await composer.press('Control+Enter').catch(() => {});
    await composer.press('Meta+Enter').catch(() => {});
    await composer.press('Enter');
  }
}

async function waitForResponse(page, timeout, provider, baselineCount = 0) {
  const primaryResponseSelector = provider.responseSelectors[0];
  await page.waitForSelector(primaryResponseSelector, { timeout });

  const started = Date.now();
  let settledRounds = 0;
  let lastAssistantText = '';
  let lastMeaningfulText = '';
  let firstMeaningfulSeenAt = 0;
  const settleRoundsTarget = provider.settleRounds || 3;

  while (Date.now() - started < timeout) {
    const currentCount = await page.locator(primaryResponseSelector).count().catch(() => 0);
    const targetIndex = currentCount > baselineCount ? baselineCount : Math.max(0, currentCount - 1);
    const stopVisible = await page
      .locator(provider.stopSelectors.join(', '))
      .first()
      .isVisible()
      .catch(() => false);
    const assistant = page.locator(primaryResponseSelector).nth(targetIndex);
    const currentText = (await assistant.innerText().catch(() => '')).trim();
    const currentLength = currentText.length;

    if (currentLength > 20) {
      lastMeaningfulText = currentText;
      if (!firstMeaningfulSeenAt) {
        firstMeaningfulSeenAt = Date.now();
      }
    }

    if (!stopVisible && currentText && currentText === lastAssistantText) {
      settledRounds += 1;
      if (settledRounds >= settleRoundsTarget) {
        return;
      }
    } else {
      settledRounds = 0;
    }

    if (
      provider.id === 'wrtn-gpt5' &&
      firstMeaningfulSeenAt &&
      Date.now() - firstMeaningfulSeenAt > 7000 &&
      currentLength > 20 &&
      Math.abs(currentLength - lastAssistantText.length) < 8
    ) {
      return;
    }

    lastAssistantText = currentText;
    await page.waitForTimeout(1000);
  }

  if (provider.id === 'wrtn-gpt5' && lastMeaningfulText) {
    return;
  }

  throw new Error('Timed out waiting for provider response to settle');
}

async function extractResponse(page, provider, baselineCount = 0) {
  let assistant = null;
  for (const selector of provider.responseSelectors) {
    const count = await page.locator(selector).count().catch(() => 0);
    const targetIndex = count > baselineCount ? baselineCount : Math.max(0, count - 1);
    const candidate = page.locator(selector).nth(targetIndex);
    try {
      if (count > 0) {
        assistant = candidate;
        break;
      }
    } catch (_) {}
  }

  if (!assistant) {
    throw new Error('Could not find provider response container');
  }

  const text = (await assistant.innerText().catch(() => '')).trim();
  let codeBlocks = [];

  for (const selector of provider.codeSelectors) {
    try {
      const found = await assistant.locator(selector).evaluateAll(nodes =>
        nodes.map(node => node.textContent || '').filter(Boolean)
      );
      if (found.length) {
        codeBlocks = found;
        break;
      }
    } catch (_) {}
  }

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

  const textBlockMatch = extracted.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const block = extracted.firstCodeBlock || (textBlockMatch ? textBlockMatch[1].trim() : null);
  if (!block) {
    return { parsed: null, parseError: 'No fenced code block found' };
  }

  try {
    return { parsed: JSON.parse(block), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: error.message };
  }
}

async function cleanupConversation(page, provider) {
  if (!provider.cleanupSupported) {
    return { cleaned: false, reason: 'cleanup_not_supported_for_provider' };
  }

  if (provider.id === 'wrtn-gpt5') {
    const openedSideMenu = await clickFirst(page, [
      'button[aria-label*="메뉴"]',
      'button[aria-label*="Menu"]',
      'button[aria-label*="더보기"]',
      'button:has-text("⋯")',
      'button:has-text("...")',
    ], 1200);

    if (openedSideMenu) {
      await page.waitForTimeout(800);
    }

    const openedConversationMenu = await clickFirst(page, [
      '[role="navigation"] button[aria-label*="더보기"]',
      '[role="navigation"] button[aria-label*="옵션"]',
      '[role="navigation"] button[aria-label*="메뉴"]',
      '[role="navigation"] button:has-text("⋯")',
      '[role="navigation"] button:has-text("...")',
      'aside button[aria-label*="더보기"]',
      'aside button[aria-label*="옵션"]',
      'aside button:has-text("⋯")',
      'aside button:has-text("...")',
    ], 1200);

    if (!openedConversationMenu) {
      return { cleaned: false, reason: 'wrtn_conversation_menu_not_found' };
    }

    const clickedDelete = await clickFirst(page, [
      'button:has-text("삭제")',
      'button:has-text("대화 삭제")',
      '[role="menuitem"]:has-text("삭제")',
      '[role="menuitem"]:has-text("대화 삭제")',
    ], 1200);

    if (!clickedDelete) {
      return { cleaned: false, reason: 'wrtn_delete_action_not_found' };
    }

    const confirmed = await clickFirst(page, [
      'button:has-text("삭제")',
      'button:has-text("확인")',
      'button:has-text("예")',
    ], 1200);

    await page.waitForTimeout(1000);
    return {
      cleaned: confirmed,
      reason: confirmed ? 'deleted' : 'wrtn_delete_confirm_not_found',
    };
  }

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
    string: [
      'prompt',
      'prompt-file',
      'out',
      'provider',
      'expect',
      'cleanup',
      'profile-dir',
      'user-data-dir',
      'profile-name',
      'browser-channel',
      'executable-path',
      'timeout',
    ],
    boolean: ['headless', 'help'],
    alias: {
      h: 'help',
    },
    default: {
      provider: 'wrtn-gpt5',
      expect: 'text',
      cleanup: 'delete',
      'browser-channel': 'chromium',
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
  const provider = PROVIDERS[String(argv.provider || 'chatgpt')];

  if (!provider) {
    throw new Error(`Unsupported provider: ${argv.provider}`);
  }

  const profileDir = path.resolve(
    argv['user-data-dir'] || argv['profile-dir'] || path.join(process.cwd(), 'tmp', 'chatgpt-web-profile')
  );
  const profileName = argv['profile-name'] ? String(argv['profile-name']) : '';
  const browserChannel = String(argv['browser-channel'] || 'chromium');
  const executablePath = argv['executable-path'] ? path.resolve(argv['executable-path']) : '';
  const timeout = Number(argv.timeout) || 120000;

  fs.mkdirSync(profileDir, { recursive: true });

  const launchOptions = {
    headless: Boolean(argv.headless),
    viewport: { width: 1440, height: 960 },
  };

  if (browserChannel === 'chrome' && !executablePath) {
    launchOptions.channel = 'chrome';
  }

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  if (profileName) {
    launchOptions.args = [`--profile-directory=${profileName}`];
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);

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
    await ensureLoggedIn(page, timeout, provider);
    await provider.freshStart(page, timeout, clickFirst);
    const beforeSubmitUrl = page.url();
    const baselineCount = await page.locator(provider.responseSelectors[0]).count().catch(() => 0);
    await submitPrompt(page, prompt, timeout, provider);
    await waitForResponse(page, timeout, provider, baselineCount);
    extracted = await extractResponse(page, provider, baselineCount);
    ({ parsed, parseError } = parseResult(extracted, argv.expect));

    if (argv.cleanup === 'delete') {
      cleanup = await cleanupConversation(page, provider);
    } else {
      cleanup = { cleaned: false, reason: 'cleanup_disabled' };
    }

    const payload = {
      ok: !parseError,
      startedAt,
      provider: provider.id,
      profileDir,
      profileName,
      browserChannel,
      executablePath,
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
    const screenshotPath = path.join(process.cwd(), 'tmp', `chatgpt-web-error-${provider.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const failure = {
      ok: false,
      startedAt,
      provider: provider.id,
      profileDir,
      profileName,
      browserChannel,
      executablePath,
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

main().catch(error => {
  console.error(error);
  process.exit(1);
});
