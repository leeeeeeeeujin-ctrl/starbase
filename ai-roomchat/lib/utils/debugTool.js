// 에러 로깅 유틸
export function logError(error, context = '') {
  try {
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(
        `[debugTool] ERROR${context ? ' [' + context + ']' : ''}:`,
        error,
      );
    }
  } catch {
    // ignore logging errors
  }
}

// 내부 포맷터: 상태를 문자열로 시각화 (실제 로깅 여부는 options.log로 제어)
function formatDebugState(state, options = {}) {
  if (!state) return '[debugTool] state is null or undefined';
  const { label = 'DEBUG', log = true } = options;
  let output = `==== ${label} ====`;
  if (Array.isArray(state)) {
    output += '\nArray length: ' + state.length;
    state.forEach((item, idx) => {
      output += `\n[${idx}] ${JSON.stringify(item, null, 2)}`;
    });
  } else if (typeof state === 'object') {
    output += '\n' + JSON.stringify(state, null, 2);
  } else {
    output += '\n' + String(state);
  }
  if (log && typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log(output);
  }
  return output;
}

// 상태 시각화 유틸 (외부에서 주로 사용하는 진입점)
export function visualizeState(state, label = 'STATE') {
  try {
    const output = formatDebugState(state, { label, log: false });
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(`[debugTool] ${label}:\n${output}`);
    }
  } catch (e) {
    logError(e, 'visualizeState');
  }
}

// 디버그 툴: 객체/배열/상태 시각화 및 중복/불일치/미할당 체크
export function debugState(state, options = {}) {
  return formatDebugState(state, options);
}

export function checkDuplicates(arr, keyFn = x => x) {
  const seen = new Set();
  const dups = [];
  arr.forEach(item => {
    const key = keyFn(item);
    if (seen.has(key)) dups.push(item);
    else seen.add(key);
  });
  if (dups.length) console.warn('[debugTool] 중복 감지:', dups);
  return dups;
}

export function checkMissing(arr, requiredKeys = []) {
  const missing = arr.filter(item => {
    return requiredKeys.some(key => item[key] == null);
  });
  if (missing.length) console.warn('[debugTool] 미할당/누락 감지:', missing);
  return missing;
}
