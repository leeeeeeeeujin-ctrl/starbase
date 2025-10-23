import crypto from 'crypto';

import { parseCookies } from '@/lib/server/cookies';
import { isMissingSupabaseTable } from '@/lib/server/supabaseErrors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const COOKIE_NAME = 'rank_admin_portal_session';
const TABLE_NAME = 'rank_announcements';

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

function ensureAuthorised(req) {
  const password = getConfiguredPassword();
  if (!password) {
    return { ok: false, status: 500, message: 'Admin portal password is not configured' };
  }

  const cookieHeader = req.headers.cookie || '';
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];

  if (!sessionToken) {
    return { ok: false, status: 401, message: 'Missing session token' };
  }

  const expected = getSessionToken(password);
  if (sessionToken !== expected) {
    return { ok: false, status: 401, message: 'Invalid session token' };
  }

  return { ok: true };
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function handleGet(req, res) {
  const auth = ensureAuthorised(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;

  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('id, title, body, published_at, created_at, updated_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ items: [], meta: { missingTable: true } });
      }
      console.error('Failed to load announcements:', error);
      return res.status(500).json({ error: '공지 목록을 불러오지 못했습니다.' });
    }

    const items = Array.isArray(data) ? data.map(mapAnnouncement) : [];
    return res.status(200).json({ items, meta: { missingTable: false } });
  } catch (error) {
    console.error('Unexpected error when loading announcements:', error);
    return res.status(500).json({ error: '공지 목록을 불러오지 못했습니다.' });
  }
}

async function handlePost(req, res) {
  const auth = ensureAuthorised(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  const { title, body, publishedAt } = req.body || {};
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const trimmedBody = typeof body === 'string' ? body.trim() : '';
  const timestamp =
    typeof publishedAt === 'string' && publishedAt.trim()
      ? new Date(publishedAt).toISOString()
      : new Date().toISOString();

  if (!trimmedTitle) {
    return res.status(400).json({ error: '공지 제목을 입력해주세요.' });
  }

  if (!trimmedBody) {
    return res.status(400).json({ error: '공지 본문을 입력해주세요.' });
  }

  try {
    const payload = {
      title: trimmedTitle,
      body: trimmedBody,
      published_at: timestamp,
    };

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .insert(payload)
      .select('id, title, body, published_at, created_at, updated_at')
      .single();

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({ items: [], meta: { missingTable: true } });
      }
      console.error('Failed to create announcement:', error);
      return res.status(500).json({ error: '공지를 저장하지 못했습니다.' });
    }

    return res.status(201).json({ item: mapAnnouncement(data), meta: { missingTable: false } });
  } catch (error) {
    console.error('Unexpected error when creating announcement:', error);
    return res.status(500).json({ error: '공지를 저장하지 못했습니다.' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method Not Allowed' });
}
