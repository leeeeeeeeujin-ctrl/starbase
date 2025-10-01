import { serialize as serializeCookie } from 'cookie';
import crypto from 'crypto';

const COOKIE_NAME = 'rank_admin_portal_session';
const COOKIE_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getConfiguredPassword() {
  const value = process.env.ADMIN_PORTAL_PASSWORD;

  if (!value || !value.trim()) {
    return null;
  }

  return value;
}

function getSessionToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const configuredPassword = getConfiguredPassword();

  if (!configuredPassword) {
    console.error('[admin/login] ADMIN_PORTAL_PASSWORD is not configured');
    return res.status(500).json({ error: 'Admin portal password is not configured' });
  }

  const { password } = req.body || {};

  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'Missing password' });
  }

  if (password !== configuredPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const cookie = serializeCookie(COOKIE_NAME, getSessionToken(configuredPassword), {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_TTL_SECONDS,
  });

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1kb',
    },
  },
};
