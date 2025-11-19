// Extremely small, local-only hook loader for /game/hooks/automation.js
// Intentionally blocks require and limits execution time at call site.

export function loadHooksFromSource(source) {
  const code = String(source || '');
  const exports = {};
  const module = { exports };
  const require = () => { throw new Error('require is disabled in hooks'); };
  // Best-effort isolation: provide no this/global, no arguments besides the three.
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports', 'module', 'require', code);
  fn(exports, module, require);
  const out = module.exports || exports || {};
  return {
    onTurnStart: pickFn(out, 'onTurnStart'),
    onUserAction: pickFn(out, 'onUserAction'),
    transformPrompt: pickFn(out, 'transformPrompt'),
    selectNext: pickFn(out, 'selectNext'),
    onEnterNode: pickFn(out, 'onEnterNode'),
    onLeaveNode: pickFn(out, 'onLeaveNode'),
    // World/grid-related hooks (optional; used by worldGridEngine when present)
    stepSimulation: pickFn(out, 'stepSimulation'),
    applyAction: pickFn(out, 'applyAction'),
  };
}

export async function callHookWithTimeout(invoke, timeoutMs = 500) {
  const t = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 500;
  let timer;
  try {
    const res = await Promise.race([
      Promise.resolve().then(invoke),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('hook timeout')), t); }),
    ]);
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pickFn(obj, key) {
  const v = obj && obj[key];
  return typeof v === 'function' ? v : null;
}
