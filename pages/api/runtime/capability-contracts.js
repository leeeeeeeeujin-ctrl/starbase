// Flattened API route that proxies to the ai-roomchat runtime capability contracts.
//
// This keeps the external URL `/api/runtime/capability-contracts` working
// for the main app, while the implementation lives under `ai-roomchat`.

const {
  getCapabilityContracts,
} = require('../../../ai-roomchat/lib/runtime/capabilityContracts.js');

/**
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const raw = getCapabilityContracts() || [];
    const capabilities = raw.map((c) => {
      const refs = Array.isArray(c.references) ? c.references : [];
      return {
        ...c,
        references: refs
          .map((r) => {
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
          })
          .filter(Boolean),
      };
    });
    return res.status(200).json({
      capabilities,
      count: capabilities.length,
    });
  } catch (err) {
    // Fallback 500 with minimal surface; this should be rare because the
    // underlying contracts file is static.
    // eslint-disable-next-line no-console
    console.error('[api/runtime/capability-contracts] failed', err);
    return res.status(500).json({ error: 'Failed to load capability contracts' });
  }
}

