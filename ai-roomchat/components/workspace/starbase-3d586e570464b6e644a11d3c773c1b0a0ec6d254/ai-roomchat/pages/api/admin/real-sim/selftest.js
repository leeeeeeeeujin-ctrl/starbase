import { parseCookies } from '@/lib/server/cookies';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  createRealSimulation,
  getRealSimulation,
  autoAdvanceRealSimulation,
  deleteRealSimulation,
} from '@/lib/realTableSimulator';
import fs from 'fs';
import path from 'path';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const auth = ensureAuthorised(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message });

  const steps = [];
  const t0 = Date.now();
  let sessionId = null;

  function pushStep(name, status, extra = {}) {
    steps.push({ name, status, durationMs: Date.now() - t0, ...extra });
  }

  try {
    // 1) 데이터 조회
    const { data: games, error: gamesError } = await supabaseAdmin
      .from('rank_games')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(1);
    if (gamesError) throw gamesError;
    const game = (games && games[0]) || null;

    const { data: heroes, error: heroesError } = await supabaseAdmin
      .from('heroes')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(8);
    if (heroesError) throw heroesError;

    if (!game || !heroes || heroes.length < 2) {
      pushStep('fetch-data', 'fail', {
        reason: 'not_enough_data',
        games: games?.length || 0,
        heroes: heroes?.length || 0,
      });
      return res.status(200).json({ ok: false, steps });
    }

    pushStep('fetch-data', 'ok', { gameId: game.id, heroCount: heroes.length });

    // 2) 생성
    const pickIds = heroes.slice(0, Math.min(4, heroes.length)).map(h => h.id);
    const created = await createRealSimulation(supabaseAdmin, {
      gameId: game.id,
      mode: 'rank_solo',
      heroIds: pickIds,
      turnLimit: 5,
    });
    sessionId = created.sessionId;
    pushStep('create-session', 'ok', { sessionId });

    // 3) 상세
    const detail1 = await getRealSimulation(supabaseAdmin, sessionId);
    pushStep('detail-initial', 'ok', {
      turn: detail1.session.turn,
      battles: (detail1.battles || []).length,
    });

    // 4) 자동 3턴
    const results = await autoAdvanceRealSimulation(supabaseAdmin, sessionId, 3);
    pushStep('auto-advance', 'ok', { results });

    // 5) 상세 재조회
    const detail2 = await getRealSimulation(supabaseAdmin, sessionId);
    pushStep('detail-after', 'ok', {
      turn: detail2.session.turn,
      battles: (detail2.battles || []).length,
    });

    // 6) 삭제
    await deleteRealSimulation(supabaseAdmin, sessionId);
    pushStep('delete-session', 'ok');

    // 로그 파일 저장
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `selftest-${timestamp}.json`);
    fs.writeFileSync(
      logPath,
      JSON.stringify({ ok: true, steps, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log(`[selftest] Log saved: ${logPath}`);

    return res.status(200).json({ ok: true, steps });
  } catch (e) {
    pushStep('error', 'fail', { message: e.message });
    // best-effort cleanup
    if (sessionId) {
      try {
        await deleteRealSimulation(supabaseAdmin, sessionId);
      } catch {}
    }

    // 에러 로그도 저장
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `selftest-${timestamp}.json`);
    fs.writeFileSync(
      logPath,
      JSON.stringify({ ok: false, steps, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log(`[selftest] Error log saved: ${logPath}`);

    return res.status(200).json({ ok: false, steps });
  }
}
