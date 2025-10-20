// 성능 유틸리티: 실행 시간 측정, 병목 구간 로그
export function measureTime(label, fn) {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  console.log(`[performanceUtil] ${label}: ${(end - start).toFixed(2)}ms`)
  return result
}

export function logSlowOperation(label, thresholdMs, fn) {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  if (end - start > thresholdMs) {
    console.warn(`[performanceUtil] 느린 작업 감지: ${label} (${(end - start).toFixed(2)}ms)`)
  }
  return result
}
