import { URLSearchParams } from 'url';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const { code, state } = req.query || {};
  if (!code) {
    return res.status(400).send('Missing code');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send('Missing GitHub OAuth env');
  }

  const cookies = parseCookies(req);
  const expectedState = cookies.gh_oauth_state || null;
  if (expectedState && state && expectedState !== state) {
    return res.status(400).send('Invalid state');
  }

  const origin = getOrigin(req);
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || `${origin}/api/github/oauth/callback`;

  try {
    const token = await exchangeCodeForToken({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const user = await fetchGithubUser(token);

    const payload = {
      token,
      login: user.login,
      avatarUrl: user.avatar_url || null,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64'
    );

    res.setHeader('Set-Cookie', [
      `gh_oauth=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
        60 * 60 * 24 * 30
      }`,
      'gh_oauth_state=; Path=/; Max-Age=0',
    ]);

    const html = `<!doctype html>
<html>
  <body>
    <script>
      (function () {
        try {
          if (window.opener && window.opener.postMessage) {
            window.opener.postMessage(
              { type: 'github-connected', user: { login: ${JSON.stringify(
                user.login
              )}, avatarUrl: ${JSON.stringify(user.avatar_url || null)} } },
              '*'
            );
          }
        } catch (e) {}
        window.close();
      })();
    </script>
    <p>GitHub connection completed. You can close this window.</p>
  </body>
</html>`;
    res.status(200).send(html);
  } catch (error) {
    res.status(500).send('GitHub OAuth failed');
  }
}

async function exchangeCodeForToken({
  code,
  clientId,
  clientSecret,
  redirectUri,
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: params,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error('token_exchange_failed');
  }
  return json.access_token;
}

async function fetchGithubUser(token) {
  const resp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'starbase-runtime',
      Accept: 'application/vnd.github+json',
    },
  });
  const json = await resp.json();
  if (!resp.ok || !json.login) {
    throw new Error('user_fetch_failed');
  }
  return json;
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

function getOrigin(req) {
  const host = req.headers.host;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || 'http';
  if (!host) {
    return `${proto}://localhost`;
  }
  return `${proto}://${host}`;
}

