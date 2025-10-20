// 디버그 툴: 객체/배열/상태 시각화 및 중복/불일치/미할당 체크
export function debugState(state, options = {}) {
  if (!state) return '[debugTool] state is null or undefined'
  const { label = 'DEBUG', log = true } = options
  let output = `==== ${label} ====`
  if (Array.isArray(state)) {
    output += '\nArray length: ' + state.length
    state.forEach((item, idx) => {
      output += `\n[${idx}] ${JSON.stringify(item, null, 2)}`
    })
  } else if (typeof state === 'object') {
    output += '\n' + JSON.stringify(state, null, 2)
  } else {
    output += '\n' + String(state)
  }
  if (log) console.log(output)
  return output
}

export function checkDuplicates(arr, keyFn = (x) => x) {
  const seen = new Set()
  const dups = []
  arr.forEach((item) => {
    const key = keyFn(item)
    if (seen.has(key)) dups.push(item)
    else seen.add(key)
  })
  if (dups.length) console.warn('[debugTool] 중복 감지:', dups)
  return dups
}

export function checkMissing(arr, requiredKeys = []) {
  const missing = arr.filter((item) => {
    return requiredKeys.some((key) => item[key] == null)
  })
  if (missing.length) console.warn('[debugTool] 미할당/누락 감지:', missing)
  return missing
}
