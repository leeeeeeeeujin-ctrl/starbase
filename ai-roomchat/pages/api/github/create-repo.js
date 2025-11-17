export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const cookies = parseCookies(req);
  const raw = cookies.gh_oauth;
  if (!raw) {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }
  let decoded;
  try {
    decoded = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8') || '{}'
    );
  } catch {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }
  if (!decoded || !decoded.token) {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ ok: false, error: 'missing_name' });
  }

  try {
    const resp = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${decoded.token}`,
        'User-Agent': 'starbase-runtime',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        private: true,
      }),
    });
    const json = await resp.json();
    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ ok: false, error: json?.message || 'github_error' });
    }
    const fullName = json.full_name || '';
    const [owner, repo] = fullName.split('/');
    const branch = json.default_branch || 'main';
    return res.status(200).json({
      ok: true,
      owner: owner || decoded.login,
      repo: repo || name,
      branch,
      htmlUrl: json.html_url || null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'create_repo_failed' });
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

