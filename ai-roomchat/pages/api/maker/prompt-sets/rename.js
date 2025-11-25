// Server-side rename of a prompt set.
// Body: { id: string, name: string }

import { supabaseAdmin as supabase } from '../../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id: rawId, name: rawName } = req.body || {};
    const id = String(rawId || '').trim();
    const name = typeof rawName === 'string' ? rawName.trim() : '';

    if (!id) {
      return res.status(400).json({ error: 'id required' });
    }
    if (!name) {
      return res.status(400).json({ error: '이름을 비울 수 없습니다.' });
    }

    const { error } = await supabase.from('prompt_sets').update({ name }).eq('id', id);
    if (error) {
      return res.status(500).json({ error: '세트 이름을 변경하지 못했습니다.' });
    }

    return res.status(200).json({ ok: true, name });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res
      .status(status)
      .json({ error: error?.message || 'rename failed' });
  }
}

