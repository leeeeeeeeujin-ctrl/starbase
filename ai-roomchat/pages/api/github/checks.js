// Placeholder for GitHub Checks API integration
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  return res.status(501).json({ ok: false, error: 'not_implemented' });
}

