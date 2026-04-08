#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HOST = process.env.CHATGPT_WEB_HELPER_HOST || '127.0.0.1';
const PORT = Number(process.env.CHATGPT_WEB_HELPER_PORT || 4319);
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function runNodeScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });
  });
}

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    host: HOST,
    port: PORT,
    pid: process.pid,
  });
});

app.post('/run', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  const expectType = req.body?.expect === 'text' ? 'text' : 'json';
  const cleanupMode = req.body?.cleanup === 'none' ? 'none' : 'delete';
  const timeoutMs = Math.max(30000, Math.min(Number(req.body?.timeoutMs) || 240000, 900000));
  const headless = Boolean(req.body?.headless);

  if (!prompt.trim()) {
    return res.status(400).json({ ok: false, error: 'prompt_required' });
  }

  const requestId = crypto.randomUUID();
  const promptFile = path.join(os.tmpdir(), `chatgpt-web-prompt-${requestId}.txt`);
  const outFile = path.join(os.tmpdir(), `chatgpt-web-result-${requestId}.json`);

  try {
    await fs.writeFile(promptFile, prompt, 'utf8');

    const args = [
      path.join('scripts', 'run-chatgpt-web-prompt.js'),
      '--prompt-file',
      promptFile,
      '--expect',
      expectType,
      '--out',
      outFile,
      '--timeout',
      String(timeoutMs),
      '--cleanup',
      cleanupMode,
    ];

    if (headless) {
      args.push('--headless');
    }

    const runResult = await runNodeScript(args);
    let payload = null;

    try {
      const raw = await fs.readFile(outFile, 'utf8');
      payload = JSON.parse(raw);
    } catch (_error) {
      payload = null;
    }

    const ok = runResult.code === 0 && Boolean(payload?.ok);
    return res.status(ok ? 200 : 500).json({
      ok,
      payload,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.code,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'chatgpt_web_helper_failed',
    });
  } finally {
    await Promise.allSettled([fs.unlink(promptFile), fs.unlink(outFile)]);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`chatgpt-web-helper listening on http://${HOST}:${PORT}`);
});
