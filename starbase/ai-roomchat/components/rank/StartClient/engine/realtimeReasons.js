const REASON_LABELS = new Map(
  [
    ['timeout', '시간 초과'],
    ['consensus', '합의 미응답'],
    ['manual', '수동 진행 미완료'],
    ['ai', '자동 진행'],
    ['inactivity', '응답 없음'],
  ].map(([key, label]) => [key, label]),
)

export function formatRealtimeReason(reason) {
  if (!reason) return ''
  const normalized = String(reason).trim().toLowerCase()
  return REASON_LABELS.get(normalized) || ''
}

export function getRealtimeReasonLabels() {
  return new Map(REASON_LABELS)
}
