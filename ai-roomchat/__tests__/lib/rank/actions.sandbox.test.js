/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-actions-'));
  const ws = path.join(root, 'workspace');
  fs.mkdirSync(ws, { recursive: true });
  return { root, ws };
}

function loadActions(root) {
  jest.resetModules();
  process.env.WORKSPACE_ROOT = root;
  delete process.env.AI_ACTIONS_ALLOW_HOST;
  return require('../../../lib/rank/actions.js');
}

function writeAllowlist(wsRoot, allow = []) {
  const allowPath = path.join(wsRoot, 'config', 'ai-actions-allowlist.json');
  fs.mkdirSync(path.dirname(allowPath), { recursive: true });
  fs.writeFileSync(allowPath, JSON.stringify({ allow }, null, 2), 'utf8');
  return allowPath;
}

describe('sandbox_exec guard rails', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, prevEnv);
  });

  test('rejects when SANDBOX_EXEC_ENABLE is unset', async () => {
    const { root } = makeTmpWorkspace();
    delete process.env.SANDBOX_EXEC_ENABLE;
    const { performAction } = loadActions(root);
    const r = await performAction('sandbox_exec', { cmd: 'echo nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('sandbox_disabled');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('blocks commands not in allowlist', async () => {
    const { root } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    const { performAction } = loadActions(root);
    const r = await performAction('sandbox_exec', { cmd: 'echo nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('sandbox_blocked');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('runs whitelisted command in workspace cwd', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    process.env.SANDBOX_ALLOW_PREFIX = '1';
    writeAllowlist(ws, ['node ']);
    const { performAction } = loadActions(root);
    const r = await performAction('sandbox_exec', {
      cmd: 'node -e "console.log(process.cwd())"',
    });
    expect(r.ok).toBe(true);
    expect(r.result.stdout.trim()).toBe(ws);
    const stored = JSON.parse(
      fs.readFileSync(path.join(ws, 'config', 'ai-actions-allowlist.json'), 'utf8'),
    );
    expect(Array.isArray(stored.allow)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('rejects command with shell chaining even if allowlist matches', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    writeAllowlist(ws, ['node ']);
    const { performAction } = loadActions(root);
    const r = await performAction('sandbox_exec', {
      cmd: 'node -e "console.log(1)"; echo 2',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('sandbox_blocked');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('supports regex allow rules when starting with ^', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    writeAllowlist(ws, ['^node -e \\"console.log\\(42\\)\\"$']);
    const { performAction } = loadActions(root);
    const rOk = await performAction('sandbox_exec', {
      cmd: 'node -e "console.log(42)"',
    });
    expect(rOk.ok).toBe(true);
    const rBad = await performAction('sandbox_exec', {
      cmd: 'node -e "console.log(43)"',
    });
    expect(rBad.ok).toBe(false);
    expect(rBad.error).toBe('sandbox_blocked');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('rejects overly long commands (default 500 chars)', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    writeAllowlist(ws, ['node ']);
    const { performAction } = loadActions(root);
    const long = 'node -e "' + 'a'.repeat(600) + '"';
    const r = await performAction('sandbox_exec', { cmd: long });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cmd_too_long');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('token: rule matches first token only', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    writeAllowlist(ws, ['token:node']);
    const { performAction } = loadActions(root);
    const ok = await performAction('sandbox_exec', { cmd: 'node -v' });
    expect(ok.ok).toBe(true);
    const blocked = await performAction('sandbox_exec', { cmd: 'npm -v' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('sandbox_blocked');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('prefix allowlist is ignored when SANDBOX_ALLOW_PREFIX=0', async () => {
    const { root, ws } = makeTmpWorkspace();
    process.env.SANDBOX_EXEC_ENABLE = '1';
    process.env.SANDBOX_ALLOW_PREFIX = '0';
    writeAllowlist(ws, ['node ']); // should be ignored in strict mode
    const { performAction } = loadActions(root);
    const r = await performAction('sandbox_exec', { cmd: 'node -v' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('sandbox_blocked');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
