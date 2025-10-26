import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const TABLE_NAME = 'rank_title_settings';
const TITLE_SLUG = 'main';

function mapSettings(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    backgroundUrl: row.background_url || '',
    updatedAt: row.updated_at || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('slug, background_url, updated_at')
      .eq('slug', TITLE_SLUG)
      .limit(1);

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ settings: null, meta: { missingTable: true } });
      }
      console.error('Failed to fetch public title settings:', error);
      return res.status(500).json({ error: '타이틀 정보를 불러오지 못했습니다.' });
    }

    const settings = Array.isArray(data) && data.length > 0 ? mapSettings(data[0]) : null;
    return res.status(200).json({ settings, meta: { missingTable: false } });
  } catch (error) {
    console.error('Unexpected error when loading public title settings:', error);
    return res.status(500).json({ error: '타이틀 정보를 불러오지 못했습니다.' });
  }
}
