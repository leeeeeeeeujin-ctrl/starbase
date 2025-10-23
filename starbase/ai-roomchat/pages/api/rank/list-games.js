import { supabase } from '@/lib/rank/db';
import { DEFAULT_SORT_KEY, METRIC_SORT_KEYS, SORT_OPTIONS } from '@/components/lobby/constants';
import { isMissingColumnError } from '@/lib/supabaseErrors';

const SORT_PLANS = SORT_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option.orders.map(order => ({ column: order.column, ascending: order.asc }));
  return acc;
}, {});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const queryParam = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const sortParam = Array.isArray(req.query.sort) ? req.query.sort[0] : req.query.sort;
  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

  const q = typeof queryParam === 'string' ? queryParam.trim() : '';
  const sortKey = SORT_PLANS[sortParam] ? sortParam : 'latest';
  const limit = Number(limitParam) > 0 ? Math.min(Number(limitParam), 100) : 50;

  let query = supabase
    .from('rank_games')
    .select('id,name,description,image_url,created_at,likes_count,play_count');

  if (q) {
    const value = `%${q}%`;
    query = query.or(`name.ilike.${value},description.ilike.${value}`);
  }

  const plan = SORT_PLANS[sortKey];
  for (const order of plan) {
    query = query.order(order.column, { ascending: order.ascending });
  }

  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    if (isMissingColumnError(error, ['likes_count', 'play_count'])) {
      const fallbackSortKey = METRIC_SORT_KEYS.has(sortKey) ? DEFAULT_SORT_KEY : sortKey;
      const fallbackPlan = SORT_PLANS[fallbackSortKey] || SORT_PLANS[DEFAULT_SORT_KEY];

      let fallbackQuery = supabase
        .from('rank_games')
        .select('id,name,description,image_url,created_at');

      if (q) {
        const value = `%${q}%`;
        fallbackQuery = fallbackQuery.or(`name.ilike.${value},description.ilike.${value}`);
      }

      for (const order of fallbackPlan) {
        fallbackQuery = fallbackQuery.order(order.column, { ascending: order.ascending });
      }

      fallbackQuery = fallbackQuery.limit(limit);

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) {
        res.status(500).json({ error: fallbackError.message });
        return;
      }

      res.status(200).json({ data: fallbackData ?? [] });
      return;
    }

    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ data: data ?? [] });
}

//
