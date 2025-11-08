#!/usr/bin/env node
// Lightweight local bridge for mobile/desktop to avoid server compute.
// Exposes an HTTP endpoint that TemplateStudio can target (Proxy URL),
// running a mock template executor locally. You can extend it to call a
// real Gemini CLI if installed (set GEMINI_CLI_CMD).

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { spawn } = require('child_process');

const PORT = process.env.CLI_BRIDGE_PORT || 4311;
const GEMINI = process.env.GEMINI_CLI_CMD || null; // e.g., 'gemini' or 'python -m google_genai_cli'

function runMock(template, variables) {
  const logs = [];
  const outputs = {};
  const byId = new Map((template.nodes || []).map(n => [n.id, n]));
  const render = (s, vars) => String(s || '').replace(/\{\{\s*([A-Za-z0-9_\.]+)\s*\}\}/g, (_, k) => {
    const parts = k.split('.'); let cur = vars; for (const p of parts) { if (cur == null) return ''; cur = cur[p]; } return cur ?? '';
  });
  const merged = Object.assign({}, template.variables || {}, variables || {});
  let current = (template.nodes || [])[0];
  let steps = 0;
  while (current && steps < 100) {
    steps++;
    if (current.type === 'prompt') {
      const text = render(current.prompt, merged);
      logs.push({ node: current.id, type: 'prompt', text });
      outputs[current.id] = { text };
    } else if (current.type === 'decision') {
      const branch = merged.branch || current.params?.paths?.[0] || 'default';
      logs.push({ node: current.id, type: 'decision', branch });
      outputs[current.id] = { branch };
    } else if (current.type === 'tool') {
      logs.push({ node: current.id, type: 'tool', status: 'ok' });
      outputs[current.id] = { status: 'ok' };
    } else if (current.type === 'output') {
      logs.push({ node: current.id, type: 'end' });
      break;
    }
    const edges = template.edges || [];
    const outgoing = edges.filter(e => e.from === current.id);
    let nextId = outgoing[0]?.to;
    if (current.type === 'decision') {
      const br = merged.branch || outputs[current.id]?.branch;
      nextId = (outgoing.find(e => e.mapping?.branch === br) || outgoing[0])?.to;
    }
    current = nextId ? byId.get(nextId) : undefined;
  }
  return { ok: true, logs, outputs };
}

function runGeminiViaCLI(payload) {
  return new Promise((resolve) => {
    if (!GEMINI) return resolve({ ok: false, error: 'GEMINI_CLI_CMD not set' });
    const child = spawn(GEMINI, [], { shell: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output: out.trim() });
      else resolve({ ok: false, error: err || `exit ${code}` });
    });
    try { child.stdin.write(JSON.stringify(payload) + '\n'); child.stdin.end(); } catch {}
  });
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: '512kb' }));

  app.get('/', (_req, res) => res.json({ ok: true, message: 'cli-bridge alive' }));

  app.post('/run-template', async (req, res) => {
    const { template, variables } = req.body || {};
    if (!template) return res.status(400).json({ ok: false, error: 'missing template' });
    // If GEMINI is configured, try external CLI, otherwise run mock locally.
    if (GEMINI) {
      const r = await runGeminiViaCLI({ template, variables });
      return res.status(r.ok ? 200 : 500).json(r);
    }
    const r = runMock(template, variables || {});
    return res.json(r);
  });

  app.listen(PORT, () => {
    console.log(`cli-bridge listening on http://127.0.0.1:${PORT}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
