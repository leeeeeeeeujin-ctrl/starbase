import { URLSearchParams } from 'url';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('Missing GITHUB_CLIENT_ID env');
  }

  const state = Math.random().toString(36).slice(2);
  const origin = getOrigin(req);
  const redirectUri =
    process.env.GITHUB_REDIRECT_URI || `${origin}/api/github/oauth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo',
    state,
  });

  res.setHeader(
    'Set-Cookie',
    `gh_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
  res.writeHead(302, {
    Location: `https://github.com/login/oauth/authorize?${params.toString()}`,
  });
  res.end();
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

