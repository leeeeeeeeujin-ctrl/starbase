// Prevent 500s by serving a stable capabilities list.
// If runtime modules exist, we can attempt to load minimal metadata on the server.
// Otherwise, respond with an empty list (client can handle absence).

export const config = { api: { bodyParser: false } };

function json(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  try {
    // Try to import a metadata module if present; keep optional.
    let contracts = [];
    try {
      const mod = await import('../../../lib/runtime/capabilityContracts.js');
      contracts = Array.isArray(mod?.contracts) ? mod.contracts : (mod?.default || []);
    } catch {
      contracts = [];
    }
    return json(res, 200, { items: contracts });
  } catch (e) {
    return json(res, 200, { items: [] });
  }
}

