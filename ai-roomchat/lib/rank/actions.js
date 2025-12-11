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
import { dbGetSet, dbPutSet } from '../workspace/dbWorkspaceSets.js';
import { ensure as ensureWorkspaceSet, upsert as upsertWorkspaceSet } from '../workspace/setsStore.js';

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
const SANDBOX_MAX_CMD_CHARS = Number(process.env.SANDBOX_MAX_CMD_CHARS || 500);
// Default: prefix rules are disabled unless explicitly enabled (prefer regex/token).
const SANDBOX_ALLOW_PREFIX = process.env.SANDBOX_ALLOW_PREFIX
  ? process.env.SANDBOX_ALLOW_PREFIX !== '0'
  : false;

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

async function loadWorkspaceSetSnapshot(rawId) {
  const id = rawId && String(rawId).trim();
  if (!id) return null;
  // Prefer DB-backed set when available
  try {
    const db = await dbGetSet(id);
    if (db && Array.isArray(db.files)) {
      return { id: db.id, files: db.files };
    }
  } catch {
    // ignore and fall through to in-memory store
  }
  try {
    const local = ensureWorkspaceSet(id);
    if (local && Array.isArray(local.files)) {
      return { id: local.id, files: local.files };
    }
  } catch {
    // ignore
  }
  return null;
}

async function loadWorkspaceSetFull(rawId) {
  const id = rawId && String(rawId).trim();
  if (!id) return null;
  // Try DB first
  try {
    const db = await dbGetSet(id);
    if (db && Array.isArray(db.files)) {
      return { id: db.id, files: db.files || [], meta: db.meta || {} };
    }
  } catch {
    // ignore and fall through
  }
  // Then dev-only in-memory store
  try {
    const local = ensureWorkspaceSet(id);
    if (local && Array.isArray(local.files)) {
      return { id, files: local.files || [], meta: local.meta || {} };
    }
  } catch {
    // ignore
  }
  // Treat missing set as empty for write paths; callers can decide whether this is an error.
  return { id, files: [], meta: {} };
}

async function saveWorkspaceSetFiles(rawId, mutateFiles) {
  const current = await loadWorkspaceSetFull(rawId);
  if (!current || !current.id) {
    return { ok: false, error: 'workspace_set_not_found' };
  }
  const baseFiles = Array.isArray(current.files) ? current.files : [];
  const nextFilesRaw =
    typeof mutateFiles === 'function' ? mutateFiles(baseFiles) || [] : baseFiles;
  const normalizedFiles = Array.isArray(nextFilesRaw)
    ? nextFilesRaw.map((f) => {
        const setPath = normalizeSetPath(f.path || '/');
        const isDir = !!f.dir;
        const content = isDir ? '' : String(f.content ?? '');
        return {
          path: setPath,
          content,
          readonly: !!f.readonly,
          dir: isDir,
        };
      })
    : [];
  const meta =
    current.meta && typeof current.meta === 'object' && current.meta !== null
      ? current.meta
      : {};

  // Update dev in-memory store (best-effort)
  try {
    upsertWorkspaceSet(current.id, { files: normalizedFiles, meta }, { merge: false });
  } catch {
    // ignore dev-store errors
  }

  // Update DB when available (also best-effort; errors are surfaced only if nothing succeeded)
  try {
    const res = await dbPutSet(current.id, normalizedFiles, meta, null);
    if (res && typeof res.status === 'number' && res.status >= 200 && res.status < 300) {
      return { ok: true, files: normalizedFiles };
    }
    // If DB is unavailable (503) but dev store was updated, still treat as ok.
    if (res && res.status === 503) {
      return { ok: true, files: normalizedFiles };
    }
  } catch {
    // ignore DB errors; fall through
  }

  // If we reached here, dev-store may still have been updated; consider it success.
  return { ok: true, files: normalizedFiles };
}

function normalizeSetPath(p) {
  const raw = (p == null ? '' : String(p)).trim();
  if (!raw || raw === '.' || raw === '/') return '/';
  if (raw === WORKSPACE_PREFIX) return '/';
  if (raw.startsWith(`${WORKSPACE_PREFIX}/`)) {
    const tail = raw.slice(WORKSPACE_PREFIX.length);
    return tail.startsWith('/') ? tail : `/${tail}`;
  }
  if (!raw.startsWith('/')) return `/${raw}`;
  return raw;
}

function buildWorkspacePathFromSetPath(setPath) {
  const norm = normalizeSetPath(setPath);
  if (norm === '/') return WORKSPACE_PREFIX;
  const rel = norm.replace(/^\/+/, '');
  return `${WORKSPACE_PREFIX}/${rel}`;
}

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
  // Never enable this in production; only honor when NODE_ENV !== 'production'.
  if (process.env.AI_ACTIONS_ALLOW_HOST === '1' && process.env.NODE_ENV !== 'production') {
    return 'workspace';
  }

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

const ALLOWLIST_DEFAULT = { allow: [] };

async function ensureAllowlistFile() {
  try {
    const target = resolveSafe('workspace/config/ai-actions-allowlist.json');
    await ensureDir(path.dirname(target));
    const exists = fsSync.existsSync(target);
    if (!exists) {
      await fs.writeFile(target, JSON.stringify(ALLOWLIST_DEFAULT, null, 2), 'utf8');
    }
    return target;
  } catch {
    return null;
  }
}

function firstToken(cmd) {
  const parts = cmd.trim().split(/\s+/);
  return parts[0] || '';
}

async function isCommandAllowed(cmdPreview) {
  try {
    const allowPath = ensureReadableFile(
      (await ensureAllowlistFile()) || resolveSafe('workspace/config/ai-actions-allowlist.json'),
    );
    const buf = await fs.readFile(allowPath, 'utf8').catch(() => '');
    if (!buf) return false;
    const conf = JSON.parse(buf);
    const allow = Array.isArray(conf.allow) ? conf.allow : [];
    return allow.some((s) => {
      if (typeof s !== 'string') return false;
      const rule = s.trim();
      if (!rule) return false;
      if (rule.startsWith('token:')) {
        const tok = rule.slice('token:'.length).trim();
        return tok && firstToken(cmdPreview) === tok;
      }
      if (rule.startsWith('^')) {
        try {
          const re = new RegExp(rule);
          return re.test(cmdPreview);
        } catch {
          return false;
        }
      }
      if (!SANDBOX_ALLOW_PREFIX) return false;
      return cmdPreview.startsWith(rule);
    });
  } catch {
    return false;
  }
}

async function action_list_files(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const snapshot = await loadWorkspaceSetSnapshot(setId);
    if (!snapshot || !Array.isArray(snapshot.files) || snapshot.files.length === 0) {
      return { ok: true, result: { items: [] } };
    }
    const items = snapshot.files.map((file) => {
      const workspacePath = buildWorkspacePathFromSetPath(file.path || '/');
      const name = workspacePath.split('/').pop() || workspacePath;
      const isDir = !!file.dir;
      const content =
        !isDir && typeof file.content === 'string' ? file.content : '';
      const size = isDir ? 0 : Buffer.byteLength(content, 'utf8');
      return {
        name,
        path: workspacePath,
        type: isDir ? 'dir' : 'file',
        size,
        mtimeMs: 0,
      };
    });
    return { ok: true, result: { items } };
  }

  const resolved = resolveSafe(payload?.path || '.');
  let dir;
  try {
    dir = ensureReadableRoot(resolved);
  } catch (err) {
    return { ok: false, error: err?.message || 'path_not_allowed' };
  }
  const recursive = !!payload?.recursive;
  let items = [];
  try {
    items = await listDir(dir, recursive);
  } catch (err) {
    // If the workspace root does not exist yet (e.g. serverless read-only
    // deploys), treat it as an empty directory instead of surfacing ENOENT.
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      items = [];
    } else {
      throw err;
    }
  }
  return { ok: true, result: { items } };
}

async function action_read_file(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const snapshot = await loadWorkspaceSetSnapshot(setId);
    if (!snapshot || !Array.isArray(snapshot.files)) {
      return { ok: false, error: 'workspace_set_not_found' };
    }
    const targetPath = normalizeSetPath(payload?.path || '/');
    const fileMeta = snapshot.files.find(
      (f) => normalizeSetPath(f.path || '/') === targetPath && !f.dir,
    );
    if (!fileMeta) {
      return { ok: false, error: 'file_not_found' };
    }
    const content = typeof fileMeta.content === 'string' ? fileMeta.content : '';
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      return { ok: false, error: 'file_too_large' };
    }
    return {
      ok: true,
      result: { encoding: 'utf8', content },
    };
  }

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
  const setId = payload?.workspaceSetId;
  if (setId) {
    const snapshot = await loadWorkspaceSetSnapshot(setId);
    if (!snapshot || !Array.isArray(snapshot.files)) {
      return { ok: false, error: 'workspace_set_not_found' };
    }
    const targetPath = normalizeSetPath(payload?.path || '/');
    const fileMeta = snapshot.files.find(
      (f) => normalizeSetPath(f.path || '/') === targetPath && !f.dir,
    );
    if (!fileMeta) {
      return { ok: false, error: 'file_not_found' };
    }
    const txt = String(fileMeta.content || '');
    const lines = txt.split(/\r?\n/);
    const start = Number(payload?.start ?? 0);
    const end = Number(payload?.end ?? start + 250);
    const s = Math.max(0, start);
    const e = Math.min(lines.length, Math.max(s, end));
    const slice = lines.slice(s, e).join('\n');
    return { ok: true, result: { start: s, end: e, content: slice } };
  }

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
  const setId = payload?.workspaceSetId;
  if (setId) {
    const targetPath = normalizeSetPath(payload?.path || '/');
    const content = typeof payload?.content === 'string' ? payload.content : '';
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const next = Array.isArray(files) ? files.map((f) => ({ ...f })) : [];
      let updated = false;
      for (const f of next) {
        if (normalizeSetPath(f.path || '/') === targetPath && !f.dir) {
          f.content = content;
          f.readonly = !!f.readonly;
          updated = true;
        }
      }
      if (!updated) {
        next.push({ path: targetPath, content, readonly: false, dir: false });
      }
      return next;
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const file = ensureWritablePath(resolveSafe(payload?.path));
  const content = typeof payload?.content === 'string' ? payload.content : '';
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, 'utf8');
  return { ok: true };
}

async function action_delete_file(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const targetPath = normalizeSetPath(payload?.path || '/');
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const base = Array.isArray(files) ? files : [];
      return base.filter(
        (f) => !(normalizeSetPath(f.path || '/') === targetPath && !f.dir),
      );
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const file = ensureWritablePath(resolveSafe(payload?.path));
  await fs.rm(file, { force: true });
  return { ok: true };
}

async function action_delete_dir(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const dirPath = normalizeSetPath(payload?.path || '/');
    const recursive = payload?.recursive !== false;
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const base = Array.isArray(files) ? files : [];
      if (!recursive) {
        // Non-recursive: remove the exact dir entry only.
        return base.filter(
          (f) => !(normalizeSetPath(f.path || '/') === dirPath && !!f.dir),
        );
      }
      // Recursive: remove dir and all children under it.
      const prefix = dirPath === '/' ? '/' : `${dirPath.replace(/\/+$/, '')}/`;
      return base.filter((f) => {
        const p = normalizeSetPath(f.path || '/');
        if (p === dirPath) return false;
        if (p.startsWith(prefix)) return false;
        return true;
      });
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const dir = ensureWritablePath(resolveSafe(payload?.path));
  const recursive = payload?.recursive !== false;
  await fs.rm(dir, { recursive, force: true });
  return { ok: true };
}

async function action_move_file(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const srcPath = normalizeSetPath(payload?.src || payload?.from || '/');
    const destPath = normalizeSetPath(payload?.dest || payload?.to || '/');
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const base = Array.isArray(files) ? files.map((f) => ({ ...f })) : [];
      const prefix = `${srcPath.replace(/\/+$/, '')}/`;
      const destPrefix = `${destPath.replace(/\/+$/, '')}/`;
      return base.map((f) => {
        const p = normalizeSetPath(f.path || '/');
        if (p === srcPath) {
          return { ...f, path: destPath };
        }
        if (p.startsWith(prefix)) {
          const tail = p.slice(prefix.length);
          return { ...f, path: `${destPrefix}${tail}` };
        }
        return f;
      });
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const src = ensureWritablePath(resolveSafe(payload?.src));
  const dest = ensureWritablePath(resolveSafe(payload?.dest));
  await ensureDir(path.dirname(dest));
  await fs.rename(src, dest);
  return { ok: true };
}

async function action_copy_file(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const srcPath = normalizeSetPath(payload?.src || payload?.from || '/');
    const destPath = normalizeSetPath(payload?.dest || payload?.to || '/');
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const base = Array.isArray(files) ? files.map((f) => ({ ...f })) : [];
      const srcFile = base.find(
        (f) => normalizeSetPath(f.path || '/') === srcPath && !f.dir,
      );
      if (!srcFile) return base;
      const content = typeof srcFile.content === 'string' ? srcFile.content : '';
      const next = base.filter(
        (f) => !(normalizeSetPath(f.path || '/') === destPath && !f.dir),
      );
      next.push({
        path: destPath,
        content,
        readonly: !!srcFile.readonly,
        dir: false,
      });
      return next;
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const src = ensureWritablePath(resolveSafe(payload?.src));
  const dest = ensureWritablePath(resolveSafe(payload?.dest));
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
  return { ok: true };
}

async function action_mkdirs(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const dirPath = normalizeSetPath(payload?.path || '/');
    const res = await saveWorkspaceSetFiles(setId, (files) => {
      const base = Array.isArray(files) ? files.map((f) => ({ ...f })) : [];
      const exists = base.some(
        (f) => normalizeSetPath(f.path || '/') === dirPath && !!f.dir,
      );
      if (exists) return base;
      base.push({ path: dirPath, content: '', readonly: false, dir: true });
      return base;
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || 'workspace_set_write_failed' };
  }

  const dir = ensureWritablePath(resolveSafe(payload?.path));
  await fs.mkdir(dir, { recursive: true });
  return { ok: true };
}

async function action_stat_file(payload) {
  const setId = payload?.workspaceSetId;
  if (setId) {
    const snapshot = await loadWorkspaceSetSnapshot(setId);
    if (!snapshot || !Array.isArray(snapshot.files)) {
      return { ok: false, error: 'workspace_set_not_found' };
    }
    const targetPath = normalizeSetPath(payload?.path || '/');
    const fileMeta = snapshot.files.find(
      (f) => normalizeSetPath(f.path || '/') === targetPath,
    );
    if (!fileMeta) {
      return { ok: false, error: 'file_not_found' };
    }
    const isDir = !!fileMeta.dir;
    const content = typeof fileMeta.content === 'string' ? fileMeta.content : '';
    const size = isDir ? 0 : Buffer.byteLength(content, 'utf8');
    return {
      ok: true,
      result: { isDir, size, mtimeMs: 0 },
    };
  }

  const p = ensureReadableFile(resolveSafe(payload?.path));
  const s = await fs.lstat(p);
  return {
    ok: true,
    result: { isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs },
  };
}

async function action_search_text(payload) {
  const setId = payload?.workspaceSetId;
  const query = String(payload?.query || '').trim();
  if (!query) return { ok: false, error: 'missing_query' };
  const maxResults = Number(payload?.max_results || SEARCH_MAX_RESULTS_DEFAULT);
  const results = [];

  if (setId) {
    const snapshot = await loadWorkspaceSetSnapshot(setId);
    if (!snapshot || !Array.isArray(snapshot.files)) {
      return { ok: true, result: { results: [] } };
    }
    for (const fileMeta of snapshot.files) {
      if (results.length >= maxResults) break;
      if (fileMeta.dir) continue;
      const content = typeof fileMeta.content === 'string' ? fileMeta.content : '';
      if (!content) continue;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(query)) {
          results.push({
            path: buildWorkspacePathFromSetPath(fileMeta.path || '/'),
            line: i + 1,
            preview: lines[i],
          });
          if (results.length >= maxResults) break;
        }
      }
    }
    return { ok: true, result: { results } };
  }

  const root = ensureReadableRoot(resolveSafe(payload?.path || '.'));

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
  // For workspace-set backed operations, prefer explicit write_file-style edits.
  // Applying git-style patches against the virtual set filesystem is not yet supported.
  if (payload && payload.workspaceSetId) {
    return { ok: false, error: 'edit_patch_not_supported_for_workspace_set' };
  }
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
  if (cmd.length > SANDBOX_MAX_CMD_CHARS) return { ok: false, error: 'cmd_too_long' };
  // Reject obvious shell chaining/meta usage to keep scope narrow even with allowlist.
  // This blocks newline, ;, &&, ||, |, $(), backticks which can chain or spawn extra subshells.
  if (/[\n;]/.test(cmd) || /\|\|/.test(cmd) || /&&/.test(cmd) || /\|/.test(cmd) || /\$\([^\)]*\)/.test(cmd) || /`[^`]*`/.test(cmd)) {
    return { ok: false, error: 'sandbox_blocked' };
  }
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
