// Placeholder for committing curated changes back to GitHub
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  // TODO: implement create/update tree + commit via GitHub API using a token stored locally on client
  return res.status(501).json({ ok: false, error: 'not_implemented' });
}

