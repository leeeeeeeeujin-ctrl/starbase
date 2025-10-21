// 테스트 시뮬레이션 생성 API
import { parseCookies } from '@/lib/server/cookies';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createTestSimulation } from '@/lib/testGameSimulator';

const COOKIE_NAME = 'rank_admin_portal_session';

function ensureAuthorised(req) {
  const password = process.env.ADMIN_PORTAL_PASSWORD;
  if (!password || !password.trim()) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' };
  }
  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  const expected = require('crypto').createHash('sha256').update(password).digest('hex');
  if (!token || token !== expected) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '메소드가 허용되지 않습니다.' });
  }

  const auth = ensureAuthorised(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  try {
    const { gameId, mode, heroIds, turnLimit, config } = req.body;

    if (!gameId || !mode || !Array.isArray(heroIds) || heroIds.length === 0) {
      return res.status(400).json({ 
        error: '게임 ID, 모드, 히어로 ID가 필요합니다.' 
      });
    }

    const supabase = supabaseAdmin;
    const result = await createTestSimulation(supabase, {
      gameId,
      mode,
      heroIds,
      turnLimit: turnLimit || 10,
      config: config || {},
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('테스트 시뮬레이션 생성 오류:', error);
    return res.status(500).json({ 
      error: error.message || '시뮬레이션 생성 실패' 
    });
  }
}
