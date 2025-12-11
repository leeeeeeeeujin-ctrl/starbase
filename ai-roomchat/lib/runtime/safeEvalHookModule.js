// Extremely small, local-only hook loader for /game/hooks/automation.js
// Intentionally blocks require and limits execution time at call site.

export function loadHooksFromSource(source) {
  const raw = String(source || '');
  const exports = {};
  const module = { exports };
  const require = () => {
    throw new Error('require is disabled in hooks');
  };

  // 기본 ESM 스타일(`export function foo() {}`)을 허용하기 위해
  // 최소한의 문자열 치환을 한 뒤, 알려진 훅 이름들을 module.exports에 매핑한다.
  let transformed = raw;
  try {
    // export async function foo() {}
    transformed = transformed.replace(
      /export\s+async\s+function\s+([A-Za-z0-9_]+)/g,
      'async function $1',
    );
    // export function foo() {}
    transformed = transformed.replace(
      /export\s+function\s+([A-Za-z0-9_]+)/g,
      'function $1',
    );
    // export const foo = ...
    transformed = transformed.replace(
      /export\s+const\s+([A-Za-z0-9_]+)\s*=/g,
      'const $1 =',
    );
    // export let foo = ...
    transformed = transformed.replace(
      /export\s+let\s+([A-Za-z0-9_]+)\s*=/g,
      'let $1 =',
    );
    // export var foo = ...
    transformed = transformed.replace(
      /export\s+var\s+([A-Za-z0-9_]+)\s*=/g,
      'var $1 =',
    );
  } catch {
    // 치환 실패는 그냥 생소스를 실행하게 두지만, 대부분의 경우 위 치환으로 충분하다.
  }

  const footer = `\n;(function() {\n` +
    `  if (typeof onTurnStart === 'function' && !module.exports.onTurnStart) module.exports.onTurnStart = onTurnStart;\n` +
    `  if (typeof onUserAction === 'function' && !module.exports.onUserAction) module.exports.onUserAction = onUserAction;\n` +
    `  if (typeof transformPrompt === 'function' && !module.exports.transformPrompt) module.exports.transformPrompt = transformPrompt;\n` +
    `  if (typeof selectNext === 'function' && !module.exports.selectNext) module.exports.selectNext = selectNext;\n` +
    `  if (typeof onEnterNode === 'function' && !module.exports.onEnterNode) module.exports.onEnterNode = onEnterNode;\n` +
    `  if (typeof onLeaveNode === 'function' && !module.exports.onLeaveNode) module.exports.onLeaveNode = onLeaveNode;\n` +
    `  if (typeof stepSimulation === 'function' && !module.exports.stepSimulation) module.exports.stepSimulation = stepSimulation;\n` +
    `  if (typeof applyAction === 'function' && !module.exports.applyAction) module.exports.applyAction = applyAction;\n` +
    `})();\n`;

  const wrapped = transformed + footer;

  // Best-effort isolation: provide no this/global, no arguments besides the three.
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports', 'module', 'require', wrapped);
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
