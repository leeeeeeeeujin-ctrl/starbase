import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TABLE_NAME = 'rank_announcements';

function mapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 10;

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id, title, body, published_at, created_at, updated_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ items: [], meta: { missingTable: true } });
      }
      console.error('Failed to fetch public announcements:', error);
      return res.status(500).json({ error: '공지 정보를 불러오지 못했습니다.' });
    }

    const items = Array.isArray(data) ? data.map(mapAnnouncement) : [];
    return res.status(200).json({ items, meta: { missingTable: false } });
  } catch (error) {
    console.error('Unexpected error when loading public announcements:', error);
    return res.status(500).json({ error: '공지 정보를 불러오지 못했습니다.' });
  }
}
