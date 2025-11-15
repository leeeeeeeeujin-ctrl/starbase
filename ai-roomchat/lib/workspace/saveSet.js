import { applySupabaseAccessToken, requireSupabaseAccessToken } from '../api/authHeaders';

// Workspace 세트 저장은 현재 단일 사용자/개발 워크플로우에서만 사용되므로,
// 복잡한 ETag 프리컨디션 검사는 피하고 항상 최신 워크스페이스 상태로 덮어씁니다.
export async function saveSet(id, filesMap = {}) {
  if (!id) throw new Error('saveSet: missing id');

  const toList = (m) =>
    Object.entries(m || {}).map(([path, meta]) => ({
      path,
      content: String(meta?.content ?? ''),
      readonly: !!meta?.readonly,
      dir: !!meta?.dir,
    }));
  const list = Array.isArray(filesMap) ? filesMap : toList(filesMap);

  const sessionToken = await requireSupabaseAccessToken();
  const withAuthHeaders = (headers = {}) => applySupabaseAccessToken(headers, sessionToken);

  // 단일 PUT으로 항상 최신 상태를 덮어쓴다. 서버는 If-Match 없을 때
  // 낙관적 upsert를 수행하므로, ETag는 더 이상 프론트에서 관리하지 않는다.
  const res = await fetch(`/api/workspace/sets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ files: list, meta: {} }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || `saveSet failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body?.etag || null;
}
