// lib/rank/storage.js
import { supabase } from '../supabase';
import { uploadAsset } from '../../utils/uploader';

function sanitize(name) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

export async function uploadGameImage(file) {
  if (!file) throw new Error('파일이 없습니다.');
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  // Upload to R2 via our API; group under "rank" since gameId is not yet created
  const res = await uploadAsset(file, { gameId: 'rank' });
  return { url: res.url, path: res.key, hash: res.hash };
}

export async function deleteGameImage(path) {
  // TODO: Implement delete via R2 if needed (not critical for free-tier caps)
  if (!path) return;
}
