// Thin client to post to our server AI endpoint. No direct Supabase usage here.

export async function postGemini({ messages, model, prefer, apiKey, token }) {
  const res = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { 'X-AI-API-KEY': apiKey } : {}),
    },
    body: JSON.stringify({
      prefer: prefer || (token ? 'keyring' : (apiKey ? 'direct' : undefined)),
      contents: messages || [],
      model: model,
    }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* noop */ }
  if (!res.ok) {
    throw Object.assign(new Error('AI request failed'), { status: res.status, data: data || text });
  }
  return data;
}

