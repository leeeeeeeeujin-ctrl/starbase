// Workspace action implementations for the ai-roomchat app.
// - File operations are restricted to a base root.
// - Reads/writes are scoped to a workspace subtree plus a small docs allowlist.
// - Sandbox commands are guarded by env + allowlist.
// - Batch combines multiple actions.

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

let BASE_ROOT = process.cwd();
if (process.env.WORKSPACE_ROOT) {
  BASE_ROOT = path.resolve(process.env.WORKSPACE_ROOT);
} else {
  // If this repo has an `ai-roomchat` subdirectory, prefer that as the
  // workspace root so AI-driven actions are scoped to the app copy by default
  // when running from a larger monorepo root.
  try {
    const candidate = path.resolve(BASE_ROOT, 'ai-roomchat');
    const stat = fsSync.statSync(candidate);
    if (stat.isDirectory()) {
      BASE_ROOT = candidate;
    }
  } catch {
    // fall back to process.cwd()
  }
}

const DEFAULT_READONLY_EXEMPT = new Set([
  'list_files',
  'read_file',
  'read_file_range',
  'search_text',
  'stat_file',
]);

const MAX_FILE_BYTES = Number(process.env.ACTION_MAX_FILE_BYTES || 2 * 1024 * 1024);
const SEARCH_MAX_RESULTS_DEFAULT = 200;

// Workspace / docs scoping
// - All paths are first normalised and resolved relative to BASE_ROOT.
// - Then we classify them as "workspace", "docs", or "other".
// - Writes are only allowed under the workspace subtree.
// - Reads are allowed for workspace + a small docs allowlist.

const WORKSPACE_PREFIX = process.env.AI_ACTIONS_WORKSPACE_PREFIX || 'workspace';

// Docs that AI is allowed to read directly
const DOCS_FILE_ALLOWLIST = [
  'docs/WORKSPACE_EDITOR_RUNTIME.md',
  'docs/AI_GAME_PROMPTS.md',
];

// Doc directories that AI can list/search inside
const DOCS_DIR_ALLOWLIST = ['docs/capabilities'];

function normalizeWorkspacePath(p) {
  const raw = (p == null ? '' : String(p)).trim();
  if (!raw || raw === '.' || raw === '/') {
    return WORKSPACE_PREFIX;
  }
  if (raw === WORKSPACE_PREFIX || raw.startsWith(`${WORKSPACE_PREFIX}/`)) {
    return raw;
  }
  if (raw === 'docs' || raw.startsWith('docs/')) {
    return raw;
  }
  if (raw.startsWith('/')) {
    const rest = raw.slice(1);
    if (!rest) return WORKSPACE_PREFIX;
    return `${WORKSPACE_PREFIX}/${rest}`;
  }
  return raw;
}

function resolveSafe(p) {
  const rel = normalizeWorkspacePath(p);
  const target = path.resolve(BASE_ROOT, rel || '.');
  if (!target.startsWith(BASE_ROOT)) throw new Error('path_outside_workspace');
  return target;
}

function classifyPath(absPath) {
  // Explicit escape hatch for local dev: allow full host access when opted-in.
  if (process.env.AI_ACTIONS_ALLOW_HOST === '1') return 'workspace';

  const rel = path.relative(BASE_ROOT, absPath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return 'other';

  if (rel === WORKSPACE_PREFIX || rel.startsWith(`${WORKSPACE_PREFIX}/`)) {
    return 'workspace';
  }
  if (rel === 'docs' || rel.startsWith('docs/')) {
    return 'docs';
  }
  return 'other';
}

function ensureReadableFile(absPath) {
  const kind = classifyPath(absPath);
  if (kind === 'workspace') return absPath;
  if (kind === 'docs') {
    const rel = path.relative(BASE_ROOT, absPath).replace(/\\/g, '/');
    if (DOCS_FILE_ALLOWLIST.includes(rel)) return absPath;
    for (const dir of DOCS_DIR_ALLOWLIST) {
      if (rel === dir || rel.startsWith(`${dir}/`)) return absPath;
    }
    throw new Error('docs_path_not_allowed');
  }
  throw new Error('path_not_allowed');
}

function ensureReadableRoot(absPath) {
  const kind = classifyPath(absPath);
  if (kind === 'workspace') return absPath;
  if (kind === 'docs') {
    const rel = path.relative(BASE_ROOT, absPath).replace(/\\/g, '/');
    if (rel === 'docs') return absPath;
    for (const dir of DOCS_DIR_ALLOWLIST) {
      if (rel === dir) return absPath;
    }
    throw new Error('docs_path_not_allowed');
  }
  throw new Error('path_not_allowed');
}

function ensureWritablePath(absPath) {
  const kind = classifyPath(absPath);
  if (kind !== 'workspace') throw new Error('write_not_allowed');
  return absPath;
}

function isBinaryBuffer(buf) {
  const len = Math.min(buf.length, 1024);
  for (let i = 0; i < len; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function listDir(dir, recursive = false) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const full = path.join(cur, ent.name);
      const stat = await fs.lstat(full);
      out.push({
        name: ent.name,
        path: path.relative(BASE_ROOT, full),
        type: ent.isDirectory() ? 'dir' : 'file',
        size: ent.isDirectory() ? 0 : stat.size,
        mtimeMs: stat.mtimeMs,
      });
      if (recursive && ent.isDirectory()) stack.push(full);
    }
  }
  return out;
}

function runCommand(cmd, { cwd = BASE_ROOT, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve({ ok: false, code: 124, stdout, stderr: `${stderr}\nTIMEOUT` });
    }, timeoutMs);
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(t);
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: String(err?.message || err),
      });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function isCommandAllowed(cmdPreview) {
  try {
    const allowPath = ensureReadableFile(
      resolveSafe('workspace/config/ai-actions-allowlist.json'),
    );
    const buf = await fs.readFile(allowPath, 'utf8').catch(() => '');
    if (!buf) return false;
    const conf = JSON.parse(buf);
    const allow = Array.isArray(conf.allow) ? conf.allow : [];
    return allow.some((s) => typeof s === 'string' && cmdPreview.startsWith(s));
  } catch {
    return false;
  }
}

async function action_list_files(payload) {
  const dir = ensureReadableRoot(resolveSafe(payload?.path || '.'));
  const recursive = !!payload?.recursive;
  const items = await listDir(dir, recursive);
  return { ok: true, result: { items } };
}

async function action_read_file(payload) {
  const file = ensureReadableFile(resolveSafe(payload?.path));
  const stat = await fs.lstat(file);
  if (stat.size > MAX_FILE_BYTES) return { ok: false, error: 'file_too_large' };
  const buf = await fs.readFile(file);
  if (isBinaryBuffer(buf)) {
    return {
      ok: true,
      result: { encoding: 'base64', content: buf.toString('base64') },
    };
  }
  return {
    ok: true,
    result: { encoding: 'utf8', content: buf.toString('utf8') },
  };
}

async function action_read_file_range(payload) {
  const file = ensureReadableFile(resolveSafe(payload?.path));
  const start = Number(payload?.start ?? 0);
  const end = Number(payload?.end ?? start + 250);
  const txt = await fs.readFile(file, 'utf8');
  const lines = txt.split(/\r?\n/);
  const s = Math.max(0, start);
  const e = Math.min(lines.length, Math.max(s, end));
  const slice = lines.slice(s, e).join('\n');
  return { ok: true, result: { start: s, end: e, content: slice } };
}

async function action_write_file(payload) {
  const file = ensureWritablePath(resolveSafe(payload?.path));
  const content = typeof payload?.content === 'string' ? payload.content : '';
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, 'utf8');
  return { ok: true };
}

async function action_delete_file(payload) {
  const file = ensureWritablePath(resolveSafe(payload?.path));
  await fs.rm(file, { force: true });
  return { ok: true };
}

async function action_delete_dir(payload) {
  const dir = ensureWritablePath(resolveSafe(payload?.path));
  const recursive = payload?.recursive !== false;
  await fs.rm(dir, { recursive, force: true });
  return { ok: true };
}

async function action_move_file(payload) {
  const src = ensureWritablePath(resolveSafe(payload?.src));
  const dest = ensureWritablePath(resolveSafe(payload?.dest));
  await ensureDir(path.dirname(dest));
  await fs.rename(src, dest);
  return { ok: true };
}

async function action_copy_file(payload) {
  const src = ensureWritablePath(resolveSafe(payload?.src));
  const dest = ensureWritablePath(resolveSafe(payload?.dest));
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
  return { ok: true };
}

async function action_mkdirs(payload) {
  const dir = ensureWritablePath(resolveSafe(payload?.path));
  await fs.mkdir(dir, { recursive: true });
  return { ok: true };
}

async function action_stat_file(payload) {
  const p = ensureReadableFile(resolveSafe(payload?.path));
  const s = await fs.lstat(p);
  return {
    ok: true,
    result: { isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs },
  };
}

async function action_search_text(payload) {
  const root = ensureReadableRoot(resolveSafe(payload?.path || '.'));
  const query = String(payload?.query || '').trim();
  if (!query) return { ok: false, error: 'missing_query' };
  const maxResults = Number(payload?.max_results || SEARCH_MAX_RESULTS_DEFAULT);
  const results = [];

  async function scanDir(d) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      if (results.length >= maxResults) return;
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        await scanDir(full);
      } else {
        try {
          const stat = await fs.lstat(full);
          if (stat.size > MAX_FILE_BYTES) continue;
          const buf = await fs.readFile(full);
          if (isBinaryBuffer(buf)) continue;
          const text = buf.toString('utf8');
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].includes(query)) {
              results.push({
                path: path.relative(BASE_ROOT, full),
                line: i + 1,
                preview: lines[i],
              });
              if (results.length >= maxResults) break;
            }
          }
        } catch {
          // ignore per-file errors
        }
      }
    }
  }

  await scanDir(root);
  return { ok: true, result: { results } };
}

async function action_edit_patch(payload) {
  const diff = String(payload?.diff || payload?.patch || '').trim();
  const cwd = BASE_ROOT;
  if (!diff) return { ok: false, error: 'missing_patch' };

  // Ensure all touched paths are inside the workspace subtree before applying.
  const lines = diff.split(/\r?\n/);
  for (const line of lines) {
    if (!(line.startsWith('+++ ') || line.startsWith('--- '))) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    let p = parts[1];
    if (p === '/dev/null') continue;
    if (p.startsWith('a/')) p = p.slice(2);
    else if (p.startsWith('b/')) p = p.slice(2);
    if (p.startsWith('"') && p.endsWith('"')) {
      p = p.slice(1, -1);
    }
    if (!p) continue;
    let abs;
    try {
      abs = resolveSafe(p);
    } catch {
      return { ok: false, error: 'patch_paths_not_allowed' };
    }
    try {
      ensureWritablePath(abs);
    } catch {
      return { ok: false, error: 'patch_paths_not_allowed' };
    }
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'patch-'));
  const patchPath = path.join(tmp, 'patch.diff');
  await fs.writeFile(patchPath, diff, 'utf8');
  const cmd = `git apply --unsafe-paths --reject --whitespace=nowarn "${patchPath.replace(
    /"/g,
    '\\"',
  )}"`;
  const r = await runCommand(cmd, { cwd, timeoutMs: 20000 });
  try {
    await fs.rm(tmp, { recursive: true, force: true });
  } catch {
    // ignore tmp removal errors
  }
  if (!r.ok) {
    return {
      ok: false,
      error: 'patch_failed',
      detail: { code: r.code, stdout: r.stdout, stderr: r.stderr },
    };
  }
  return { ok: true };
}

async function action_sandbox_exec(payload) {
  if (!process.env.SANDBOX_EXEC_ENABLE) {
    return { ok: false, error: 'sandbox_disabled' };
  }
  const cmd = String(payload?.cmd || '').trim();
  if (!cmd) return { ok: false, error: 'missing_cmd' };
  const allowed = await isCommandAllowed(cmd);
  if (!allowed) return { ok: false, error: 'sandbox_blocked' };

  let cwd;
  try {
    if (payload?.cwd) {
      cwd = ensureReadableRoot(resolveSafe(payload.cwd));
    } else {
      // Prefer the workspace root as the execution directory; this keeps
      // commands like `git status` scoped away from host app sources when
      // workspaces live in a separate tree. If that path is not available,
      // fall back to BASE_ROOT (dev-only convenience).
      cwd = ensureReadableRoot(resolveSafe(WORKSPACE_PREFIX));
    }
  } catch {
    cwd = BASE_ROOT;
  }

  const timeoutMs = Number(payload?.timeout_ms || 20000);
  const r = await runCommand(cmd, { cwd, timeoutMs });
  return {
    ok: r.ok,
    result: { code: r.code, stdout: r.stdout, stderr: r.stderr },
  };
}

async function action_test_run(payload) {
  return action_sandbox_exec({
    cmd: 'npm test --silent',
    cwd: payload?.cwd,
    timeout_ms: payload?.timeout_ms,
  });
}

async function action_lint_run(payload) {
  return action_sandbox_exec({
    cmd: 'npm run lint --silent',
    cwd: payload?.cwd,
    timeout_ms: payload?.timeout_ms,
  });
}

async function action_build_run(payload) {
  return action_sandbox_exec({
    cmd: 'npm run build --silent',
    cwd: payload?.cwd,
    timeout_ms: payload?.timeout_ms,
  });
}

async function action_ui_sandbox_step(payload) {
  const baseUrl = process.env.UI_SANDBOX_AGENT_URL;
  if (!baseUrl) {
    return { ok: false, error: 'ui_sandbox_not_configured' };
  }

  const fnFetch =
    typeof fetch === 'function'
      ? fetch
      : typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
      ? globalThis.fetch
      : null;
  if (!fnFetch) {
    return { ok: false, error: 'ui_sandbox_fetch_unavailable' };
  }

  const action = String(payload?.action || 'snapshot');
  const params =
    payload && typeof payload.params === 'object' && payload.params !== null
      ? payload.params
      : {};
  const incomingSessionId = payload?.sessionId || null;
  const sessionOptions =
    payload && typeof payload.sessionOptions === 'object' && payload.sessionOptions !== null
      ? payload.sessionOptions
      : {};

  const base = baseUrl.replace(/\/+$/, '');
  let sessionId = incomingSessionId;

  try {
    const headers = { 'Content-Type': 'application/json' };

    if (!sessionId) {
      const resCreate = await fnFetch(`${base}/session`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionOptions),
      });
      const dataCreate = await resCreate.json().catch(() => null);
      if (!resCreate.ok || !dataCreate || !dataCreate.sessionId) {
        return {
          ok: false,
          error: 'ui_sandbox_session_failed',
          detail: dataCreate || null,
        };
      }
      sessionId = String(dataCreate.sessionId);
    }

    const resStep = await fnFetch(
      `${base}/session/${encodeURIComponent(sessionId)}/step`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, params }),
      },
    );
    const dataStep = await resStep.json().catch(() => null);
    if (!resStep.ok || !dataStep) {
      return {
        ok: false,
        error: 'ui_sandbox_step_failed',
        detail: dataStep || null,
      };
    }
    const state =
      (typeof dataStep.state === 'object' && dataStep.state !== null && dataStep.state) ||
      dataStep.result ||
      dataStep;
    return {
      ok: true,
      result: {
        sessionId,
        state,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: 'ui_sandbox_error',
      detail: String(err?.message || err),
    };
  }
}

const registry = {
  list_files: action_list_files,
  read_file: action_read_file,
  read_file_range: action_read_file_range,
  write_file: action_write_file,
  delete_file: action_delete_file,
  delete_dir: action_delete_dir,
  move_file: action_move_file,
  copy_file: action_copy_file,
  mkdirs: action_mkdirs,
  stat_file: action_stat_file,
  search_text: action_search_text,
  edit_patch: action_edit_patch,
  sandbox_exec: action_sandbox_exec,
  test_run: action_test_run,
  lint_run: action_lint_run,
  build_run: action_build_run,
  ui_sandbox_step: action_ui_sandbox_step,
};

export function isReadOnly(action) {
  return DEFAULT_READONLY_EXEMPT.has(action);
}

export async function performAction(action, payload) {
  const fn = registry[action];
  if (!fn) return { ok: false, error: 'unknown_action' };
  return fn(payload || {});
}

export async function performBatch(payload) {
  const actions = Array.isArray(payload?.actions) ? payload.actions : [];
  const results = [];
  for (const a of actions) {
    if (!a || typeof a !== 'object') {
      results.push({ ok: false, error: 'invalid_action' });
      continue;
    }
    const type = a.action || a.type || a.name;
    if (type === 'batch') {
      results.push({ ok: false, error: 'nested_batch_not_allowed' });
      continue;
    }
    const r = await performAction(type, a.payload || {});
    results.push(r);
  }
  return { ok: true, result: { results } };
}

export function getBaseRoot() {
  return BASE_ROOT;
}
