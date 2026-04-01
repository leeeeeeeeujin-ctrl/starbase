import { createClient } from '@supabase/supabase-js';

import {
  findActiveTextBattleSessionForOwner,
  formatActiveTextBattleSessionRecord,
} from '@/lib/battle/activeTextSession';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    const viewer = authData?.user || null;
    if (authError || !viewer) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const activeSession = await findActiveTextBattleSessionForOwner(viewer.id);
    return res.status(200).json({
      ok: true,
      session: formatActiveTextBattleSessionRecord(activeSession),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      detail: error?.message || String(error),
    });
  }
}
