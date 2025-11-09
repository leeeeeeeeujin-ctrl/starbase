export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '';
    const buildId = process.env.NEXT_BUILD_ID || '';
    const publicVersion = process.env.NEXT_PUBLIC_APP_VERSION || '';
    const version = publicVersion || (commit ? commit.slice(0, 12) : buildId || 'dev');
    const deployedAt = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || process.env.BUILD_AT || new Date().toISOString();
    return res.status(200).json({ ok: true, version, deployedAt });
  } catch (e) {
    return res.status(200).json({ ok: true, version: 'dev', deployedAt: new Date().toISOString() });
  }
}

