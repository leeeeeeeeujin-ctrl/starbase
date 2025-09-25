import { supabase } from '@/lib/rank/db'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  const limit = Number(limitParam) > 0 ? Math.min(Number(limitParam), 500) : 200

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(200).json({ data: data ?? [] })
}

// 
