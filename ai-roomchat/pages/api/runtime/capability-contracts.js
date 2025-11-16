// Next.js API route: returns the static capability contracts that
// describe how workspace sets plug into the runtime.
//
// This is intentionally light‑weight and purely read‑only for now.

const {
  getCapabilityContracts,
} = require('../../../lib/runtime/capabilityContracts');

/**
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const raw = getCapabilityContracts() || [];
  const capabilities = raw.map((c) => {
    const refs = Array.isArray(c.references) ? c.references : [];
    return {
      ...c,
      references: refs.map((r) => {
        if (!r) return null;
        if (typeof r === 'string') {
          return { href: r, title: r };
        }
        if (typeof r === 'object') {
          return {
            href: r.href || r.url || '#',
            title: r.title || r.label || r.href || r.url || '#',
          };
        }
        return null;
      }).filter(Boolean),
    };
  });
  res.status(200).json({
    capabilities,
    count: capabilities.length,
  });
};
