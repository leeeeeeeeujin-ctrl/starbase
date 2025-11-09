export default function handler(req, res) {
  // Fast, safe health check for uptime/CI. No secrets or heavy work.
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  try {
    const uptimeSec = Math.round(process.uptime());
    let version = null;
    try {
      // Resolve app version from package.json (best-effort)
      // ../../ from pages/api -> ai-roomchat/package.json
      ({ version } = require('../../package.json'));
    } catch (_) {}

    const commit =
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      null;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, status: 'ok', time: new Date().toISOString(), uptimeSec, version, commit });
  } catch (err) {
    res.status(500).json({ ok: false, status: 'error', error: 'health_check_failed' });
  }
}
