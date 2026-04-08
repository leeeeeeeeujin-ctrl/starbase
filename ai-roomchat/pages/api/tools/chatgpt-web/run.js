import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

function unlinkSafe(targetPath) {
  try {
    if (targetPath) {
      fs.unlinkSync(targetPath);
    }
  } catch (_) {
    // ignore cleanup failures
  }
}

function runNodeScript(args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('chatgpt_web_timeout'));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      ok: false,
      error: 'chatgpt_web_runner_disabled_in_production',
    });
  }

  const {
    prompt,
    provider = 'chatgpt',
    expect = 'text',
    cleanup = 'delete',
    timeoutMs: rawTimeoutMs,
    headless = false,
    browserChannel = 'chromium',
    executablePath = '',
    userDataDir = '',
    profileName = '',
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'prompt_required' });
  }

  const timeoutMs = Math.max(30_000, Math.min(Number(rawTimeoutMs) || 240_000, 600_000));
  const workdir = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatgpt-web-run-'));
  const promptPath = path.join(tempDir, 'prompt.txt');
  const resultPath = path.join(tempDir, 'result.json');

  try {
    fs.writeFileSync(promptPath, prompt, 'utf8');

    const args = [
      path.join('scripts', 'run-chatgpt-web-prompt.js'),
      '--prompt-file',
      promptPath,
      '--provider',
      provider === 'wrtn-gpt5' ? 'wrtn-gpt5' : 'chatgpt',
      '--expect',
      expect === 'json' ? 'json' : 'text',
      '--cleanup',
      cleanup === 'none' ? 'none' : 'delete',
      '--out',
      resultPath,
      '--timeout',
      String(timeoutMs),
      '--browser-channel',
      browserChannel === 'chrome' ? 'chrome' : 'chromium',
    ];

    if (executablePath && typeof executablePath === 'string') {
      args.push('--executable-path', executablePath);
    }

    if (userDataDir && typeof userDataDir === 'string') {
      args.push('--user-data-dir', userDataDir);
    }

    if (profileName && typeof profileName === 'string') {
      args.push('--profile-name', profileName);
    }

    if (headless) {
      args.push('--headless');
    }

    const run = await runNodeScript(args, workdir, timeoutMs + 15_000);

    let payload = null;
    if (fs.existsSync(resultPath)) {
      payload = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    }

    if (run.code !== 0 && !payload) {
      return res.status(500).json({
        ok: false,
        error: 'chatgpt_web_run_failed',
        stdout: run.stdout,
        stderr: run.stderr,
      });
    }

    return res.status(payload?.ok === false ? 500 : 200).json({
      ok: Boolean(payload?.ok),
      payload,
      stdout: run.stdout,
      stderr: run.stderr,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'chatgpt_web_run_failed',
    });
  } finally {
    unlinkSafe(promptPath);
    unlinkSafe(resultPath);
    try {
      fs.rmdirSync(tempDir);
    } catch (_) {
      // ignore cleanup failures
    }
  }
}
