export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const cookies = parseCookies(req);
  const raw = cookies.gh_oauth;
  if (!raw) {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8') || '{}');
  } catch {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }

  if (!decoded || !decoded.token) {
    return res.status(401).json({ ok: false, error: 'not_connected' });
  }

  const body = req.body || {};
  const owner = String(body.owner || decoded.login || '').trim();
  const repo = String(body.repo || '').trim();
  const branch = String(body.branch || 'main').trim();
  const message = String(body.message || 'Update from Starbase workspace').trim();
  const workspaceId = String(body.workspaceId || '').trim();
  const files = Array.isArray(body.files) ? body.files : [];

  if (!owner || !repo || !workspaceId) {
    return res.status(400).json({ ok: false, error: 'missing_owner_repo_or_workspace' });
  }

  const token = decoded.token;

  const filePath = `workspace/${encodePathSegment(workspaceId)}.json`;

  try {
    const existing = await fetchGithubContent({
      token,
      owner,
      repo,
      path: filePath,
      ref: branch,
    }).catch(() => null);

    const sha = existing && existing.sha ? existing.sha : null;

    const payload = {
      workspaceId,
      updatedAt: new Date().toISOString(),
      files,
    };
    const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64');

    const resp = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/contents/${encodeURIComponent(filePath)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'starbase-runtime',
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          content,
          branch,
          sha: sha || undefined,
        }),
      },
    );
    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      const errMsg = (json && json.message) || resp.statusText || String(resp.status);
      return res.status(resp.status).json({ ok: false, error: errMsg });
    }

    const commitSha = json && json.commit && json.commit.sha;
    const htmlUrl = json && json.content && json.content.html_url;

    return res.status(200).json({
      ok: true,
      commitSha: commitSha || null,
      htmlUrl: htmlUrl || null,
      path: filePath,
    });
  } catch (e) {
    const errMsg = e && e.message ? e.message : 'commit_failed';
    return res.status(500).json({ ok: false, error: errMsg });
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

function encodePathSegment(value) {
  return String(value || '')
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

async function fetchGithubContent({ token, owner, repo, path, ref }) {
  const resp = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
      repo,
    )}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'starbase-runtime',
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (resp.status === 404) return null;
  const json = await resp.json();
  if (!resp.ok) {
    const err = new Error(json && json.message ? json.message : 'github_content_error');
    err.status = resp.status;
    throw err;
  }
  return json;
}

