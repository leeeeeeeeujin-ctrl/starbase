export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

  try {
    const resp = await fetch(
      'https://api.github.com/user/repos?per_page=50&sort=updated',
      {
        headers: {
          Authorization: `Bearer ${decoded.token}`,
          'User-Agent': 'starbase-runtime',
          Accept: 'application/vnd.github+json',
        },
      }
    );
    const json = await resp.json();
    if (!resp.ok || !Array.isArray(json)) {
      return res
        .status(resp.status || 500)
        .json({ ok: false, error: 'github_error' });
    }
    const repos = json.map((r) => ({
      fullName: r.full_name,
      owner: r.owner?.login,
      repo: r.name,
      branch: r.default_branch || 'main',
      htmlUrl: r.html_url,
    }));
    return res.status(200).json({ ok: true, repos });
  } catch {
    return res.status(500).json({ ok: false, error: 'list_repos_failed' });
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

