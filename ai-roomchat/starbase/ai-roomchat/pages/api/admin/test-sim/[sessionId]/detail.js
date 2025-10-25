// 테스트 시뮬레이션 상세 조회 API
import { parseCookies } from '@/lib/server/cookies';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getTestSimulation } from '@/lib/testGameSimulator';

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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '메소드가 허용되지 않습니다.' });
  }

  const auth = ensureAuthorised(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: '세션 ID가 필요합니다.' });
    }

    const data = await getTestSimulation(supabaseAdmin, sessionId);
    return res.status(200).json(data);
  } catch (error) {
    console.error('시뮬레이션 조회 오류:', error);
    return res.status(500).json({
      error: error.message || '조회 실패',
    });
  }
}
