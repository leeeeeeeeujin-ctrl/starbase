export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const cookies = parseCookies(req);
  const raw = cookies.gh_oauth;
  if (!raw) {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8') || '{}'
    );
    if (!decoded || !decoded.login) {
      return res.status(401).json({ ok: false, error: 'not_connected' });
    }
    return res.status(200).json({
      ok: true,
      user: {
        login: decoded.login,
        avatarUrl: decoded.avatarUrl || null,
      },
    });
  } catch {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx);
    const val = trimmed.slice(idx + 1);
    out[key] = decodeURIComponent(val);
  });
  return out;
}

