// DEV ONLY: Bridge to local Gemini CLI (Google login via CLI)
// Requires: DEV_GEMINI_CLI_ENABLED=true and the `gemini` CLI available in PATH.
// Note: Not supported on serverless hosts. Intended for local Windows/macOS/Linux dev.

import { spawn } from 'child_process';

const MAX_PROMPT_LEN = Number(process.env.DEV_GEMINI_CLI_MAX_INPUT_CHARS || 20000);
const TIMEOUT_MS = Number(process.env.DEV_GEMINI_CLI_TIMEOUT_MS || 20000);

export default async function handler(req, res) {
  if (!process.env.DEV_GEMINI_CLI_ENABLED || process.env.DEV_GEMINI_CLI_ENABLED !== 'true') {
    res.setHeader('Allow', 'POST');
    return res.status(404).json({ error: 'not_found' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let payload = req.body || {};
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload || '{}'); } catch { return res.status(400).json({ error: 'invalid_payload' }); }
  }

  const model = (payload.model && String(payload.model)) || 'gemini-2.5-flash';
  const contents = payload.contents || payload.prompt || '';
  const prompt = typeof contents === 'string' ? contents : JSON.stringify(contents);
  if (!prompt) return res.status(400).json({ error: 'missing_prompt' });
  if (prompt.length > MAX_PROMPT_LEN) return res.status(413).json({ error: 'input_too_large' });

  try {
    // gemini generate -m <model> -p <prompt>
    const args = ['generate', '-m', model, '-p', prompt];
    const child = spawn('gemini', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, TIMEOUT_MS);
    child.stdout.on('data', (c) => { out += String(c); });
    child.stderr.on('data', (c) => { err += String(c); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out) {
        return res.status(502).json({ error: 'cli_failed', detail: (err || `exit ${code}`).slice(0, 4000) });
      }
      const text = (out || '').trim();
      // Try to extract JSON from common formats (raw JSON or fenced code blocks)
      const tryParse = (t) => {
        const trimmed = t.trim();
        const fenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        try { return JSON.parse(trimmed); } catch {}
        try { return JSON.parse(fenced); } catch {}
        return null;
      };
      const obj = tryParse(text);
      if (obj && typeof obj === 'object') return res.status(200).json({ ok: true, result: obj, raw: text });
      return res.status(200).json({ ok: true, result: text });
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'internal_error' });
  }
}

