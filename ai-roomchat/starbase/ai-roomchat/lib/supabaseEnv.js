export function sanitizeSupabaseUrl(raw) {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const cleaned = trimmed.replace(/[)]+$/g, '');
  if (cleaned !== trimmed) {
    console.warn(
      'NEXT_PUBLIC_SUPABASE_URL 끝에 불필요한 문자를 제거했습니다. 환경 변수 값을 다시 확인해 주세요.'
    );
  }
  return cleaned;
}
