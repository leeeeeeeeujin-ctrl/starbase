export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  res.setHeader('Set-Cookie', [
    'gh_oauth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    'gh_oauth_state=; Path=/; Max-Age=0',
  ]);
  return res.status(200).json({ ok: true });
}

