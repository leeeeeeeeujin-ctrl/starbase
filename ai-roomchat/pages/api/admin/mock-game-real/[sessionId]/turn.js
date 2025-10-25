import { parseCookies } from '@/lib/server/cookies';
import { getRealGameSimulator } from '@/lib/mockGameServerReal';

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

/**
 * Simple AI client that calls OpenAI-compatible API
 */
async function callAI(messages, { apiKey, model = 'gpt-4' }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'AI API call failed');
  }

  const data = await response.json();
  return { text: data.choices?.[0]?.message?.content || '' };
}

export default async function handler(req, res) {
  const auth = ensureAuthorised(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.message });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { sessionId, userInput } = req.body || {};

  if (!sessionId) return res.status(400).json({ error: 'missing_session_id' });
  if (!userInput || typeof userInput !== 'string') {
    return res.status(400).json({ error: 'missing_user_input' });
  }

  try {
    const simulator = getRealGameSimulator();
    const currentSnapshot = simulator.getSnapshot(sessionId);

    const apiKey = currentSnapshot.config.apiKey;
    if (!apiKey) {
      return res
        .status(400)
        .json({ error: 'api_key_not_configured', detail: 'Provide apiKey in session config' });
    }

    const snapshot = await simulator.advanceTurn(sessionId, userInput, async messages =>
      callAI(messages, {
        apiKey,
        model: currentSnapshot.config.apiVersion || 'gpt-4',
      })
    );

    return res.status(200).json({ snapshot });
  } catch (e) {
    return res.status(500).json({ error: 'turn_failed', detail: e.message });
  }
}
