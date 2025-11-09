import { supabaseAdmin } from '@/lib/supabaseAdmin';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_EVENTS = 12;
const rateLimitCache = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function normaliseSessionId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function normaliseSeverity(value) {
  const allowed = new Set(['error', 'warn', 'warning', 'info']);
  if (typeof value !== 'string') return 'error';
  const normalised = value.toLowerCase();
  if (allowed.has(normalised)) {
    return normalised === 'warning' ? 'warn' : normalised;
  }
  return 'error';
}

function shouldRateLimit(key) {
  const now = Date.now();
  const entry = rateLimitCache.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitCache.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_EVENTS) {
    return true;
  }

  rateLimitCache.set(key, entry);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ip = getClientIp(req);
  const { message, stack, context, path: reportedPath, sessionId, severity } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing error message' });
  }

  const trimmedMessage = message.trim().slice(0, 1024);
  const sessionKey = normaliseSessionId(sessionId) || 'anonymous';
  const rateKey = `${ip}:${sessionKey}`;

  if (shouldRateLimit(rateKey)) {
    return res.status(429).json({ error: 'Too many error reports, please slow down.' });
  }

  let serialisedContext = {};
  if (context && typeof context === 'object') {
    try {
      serialisedContext = JSON.parse(JSON.stringify(context));
    } catch (error) {
      serialisedContext = { note: 'context_serialization_failed' };
    }
  }

  const severityLabel = normaliseSeverity(severity);
  const insertPayload = {
    session_id: sessionKey,
    path: typeof reportedPath === 'string' ? reportedPath.slice(0, 512) : null,
    message: trimmedMessage,
    stack: typeof stack === 'string' ? stack.slice(0, 4000) : null,
    context: serialisedContext,
    user_agent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 512)
        : null,
    severity: severityLabel,
  };

  try {
    const { error } = await supabaseAdmin.from('rank_user_error_reports').insert(insertPayload);
    if (error) {
      console.error('[errors/report] failed to insert error report', error);
      return res.status(500).json({ error: 'Failed to persist error report' });
    }
  } catch (error) {
    console.error('[errors/report] unexpected failure', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }

  return res.status(201).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '16kb',
    },
  },
};
