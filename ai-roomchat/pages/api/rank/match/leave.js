import { supabase } from '@/lib/rank/db';
import { removeQueueEntry } from '@/lib/rank/matchmakingService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { gameId, ownerId, mode } = req.body || {};

  if (!gameId || !ownerId) {
    return res.status(400).json({ error: 'missing_queue_identifiers' });
  }

  try {
    const result = await removeQueueEntry(supabase, {
      gameId,
      ownerId,
      mode: mode || null,
    });

    if (!result?.ok) {
      const message = result?.error || '대기열에서 제거하지 못했습니다.';
      return res.status(500).json({ error: message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[match/leave] 큐 제거 실패:', error);
    return res.status(500).json({ error: 'queue_leave_failed' });
  }
}
