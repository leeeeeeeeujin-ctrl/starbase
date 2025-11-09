// Stub AI proxy endpoint. Replace body with your provider logic.

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { prompt, sessionId, gameId } = JSON.parse(req.body || '{}');
    // TODO: Integrate with user-provided API securely (server-side key).
    // For now, echo back truncated prompt.
    const text = `[ECHO ${sessionId || ''}/${gameId || ''}] ` + String(prompt || '').slice(0, 256);
    res.status(200).json({ text });
  } catch (e) {
    res.status(400).json({ error: 'Bad request' });
  }
}

export const config = { runtime: 'nodejs' };
