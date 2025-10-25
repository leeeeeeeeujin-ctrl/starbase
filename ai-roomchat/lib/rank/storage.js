// lib/rank/storage.js
import { supabase } from '../supabase';

function sanitize(name) {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

export async function uploadGameImage(file) {
  if (!file) throw new Error('파일이 없습니다.');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const ext = (file.name?.split('.').pop() || '').toLowerCase() || 'jpg';
  const key = `${user.id}/${Date.now()}-${sanitize(file.name || `image.${ext}`)}`;
  const { error: upErr } = await supabase.storage
    .from('rank-games')
    .upload(key, file, { upsert: false, contentType: file.type || 'image/jpeg' });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from('rank-games').getPublicUrl(key);
  return { url: data.publicUrl, path: key };
}

export async function deleteGameImage(path) {
  if (!path) return;
  await supabase.storage.from('rank-games').remove([path]);
}
