import { supabase } from '@/lib/rank/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = Number(limitParam) > 0 ? Math.min(Number(limitParam), 500) : 200;

  const sessionIdParam = Array.isArray(req.query.sessionId)
    ? req.query.sessionId[0]
    : req.query.sessionId;
  const matchInstanceIdParam = Array.isArray(req.query.matchInstanceId)
    ? req.query.matchInstanceId[0]
    : req.query.matchInstanceId;

  const { data, error } = await supabase.rpc('fetch_rank_chat_threads', {
    p_limit: limit,
    p_session_id: sessionIdParam || null,
    p_match_instance_id: matchInstanceIdParam || null,
  });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ data: Array.isArray(data?.messages) ? data.messages : [] });
}

//
