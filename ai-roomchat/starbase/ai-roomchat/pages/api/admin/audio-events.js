import crypto from 'crypto';

import { parseCookies } from '@/lib/server/cookies';
import { isMissingSupabaseFunction, isMissingSupabaseTable } from '@/lib/server/supabaseErrors';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const COOKIE_NAME = 'rank_admin_portal_session';
const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 500;
const DEFAULT_TREND_WEEKS = 12;

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

function isAuthorised(req) {
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

function parseDateQuery(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function parseArrayQuery(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildCsv(items) {
  const header = [
    'id',
    'created_at',
    'owner_id',
    'profile_key',
    'hero_id',
    'hero_name',
    'hero_source',
    'event_type',
    'changed_fields',
    'track_id',
    'preset_id',
    'manual_override',
  ];

  const escapeCell = value => {
    if (value == null) {
      return '';
    }
    const stringified = String(value);
    if (/[",\n]/.test(stringified)) {
      return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
  };

  const rows = items.map(item => {
    const details = item?.details || {};
    const preference = details.preference || {};
    const changedFields = Array.isArray(details.changedFields)
      ? details.changedFields.join('|')
      : '';

    const cells = [
      item.id,
      item.created_at,
      item.owner_id,
      item.profile_key,
      item.hero_id || '',
      item.hero_name || '',
      item.hero_source || '',
      item.event_type,
      changedFields,
      preference.trackId || '',
      preference.presetId || '',
      preference.manualOverride ? 'true' : 'false',
    ];

    return cells.map(escapeCell).join(',');
  });

  return [header.join(','), ...rows].join('\n');
}

function normaliseStats(items) {
  const stats = {
    total: 0,
    uniqueOwners: 0,
    uniqueProfiles: 0,
    byEventType: {},
  };

  const owners = new Set();
  const profiles = new Set();

  for (const item of items) {
    stats.total += 1;
    owners.add(item.owner_id);
    profiles.add(`${item.owner_id}::${item.profile_key}`);
    const eventType = (item.event_type || 'unknown').toLowerCase();
    stats.byEventType[eventType] = (stats.byEventType[eventType] || 0) + 1;
  }

  stats.uniqueOwners = owners.size;
  stats.uniqueProfiles = profiles.size;

  return stats;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = isAuthorised(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.message });
  }

  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId.trim() : '';
  const profileKey = typeof req.query.profileKey === 'string' ? req.query.profileKey.trim() : '';
  const heroId = typeof req.query.heroId === 'string' ? req.query.heroId.trim() : '';
  const eventTypes = parseArrayQuery(req.query.eventType);
  const since = parseDateQuery(req.query.since);
  const until = parseDateQuery(req.query.until);
  const searchTerm =
    typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const trendMode =
    typeof req.query.trend === 'string' ? req.query.trend.trim().toLowerCase() : null;

  try {
    if (trendMode === 'weekly') {
      const now = new Date();
      const end = until || now.toISOString();
      const lookbackWeeksParam = Number.parseInt(req.query.lookbackWeeks, 10);
      const lookbackWeeks =
        Number.isFinite(lookbackWeeksParam) && lookbackWeeksParam > 0
          ? Math.min(lookbackWeeksParam, 52)
          : DEFAULT_TREND_WEEKS;
      const startDate =
        since || new Date(now.getTime() - lookbackWeeks * 7 * 24 * 60 * 60 * 1000).toISOString();

      const rpcParams = {
        start_timestamp: startDate,
        end_timestamp: end,
        owner_filter: ownerId || null,
        profile_filter: profileKey || null,
        hero_filter: heroId || null,
        event_type_filter: eventTypes.length ? eventTypes : null,
      };

      const [trendResponse, heroBreakdownResponse, ownerBreakdownResponse] = await Promise.all([
        supabaseAdmin.rpc('rank_audio_events_weekly_trend', rpcParams),
        supabaseAdmin.rpc('rank_audio_events_weekly_breakdown', { ...rpcParams, mode: 'hero' }),
        supabaseAdmin.rpc('rank_audio_events_weekly_breakdown', { ...rpcParams, mode: 'owner' }),
      ]);

      const trendMeta = {};

      if (trendResponse.error) {
        if (
          isMissingSupabaseFunction(trendResponse.error) ||
          isMissingSupabaseTable(trendResponse.error)
        ) {
          trendMeta.missingWeeklyTrend = true;
          if (isMissingSupabaseTable(trendResponse.error)) {
            trendMeta.missingTable = true;
          }
        } else {
          console.error('[admin/audio-events] failed to fetch weekly trend', trendResponse.error);
          return res.status(500).json({ error: 'Failed to fetch weekly trend' });
        }
      }

      if (heroBreakdownResponse.error) {
        if (
          isMissingSupabaseFunction(heroBreakdownResponse.error) ||
          isMissingSupabaseTable(heroBreakdownResponse.error)
        ) {
          trendMeta.missingWeeklyHeroBreakdown = true;
          if (isMissingSupabaseTable(heroBreakdownResponse.error)) {
            trendMeta.missingTable = true;
          }
        } else {
          console.error(
            '[admin/audio-events] failed to fetch hero breakdown',
            heroBreakdownResponse.error
          );
        }
      }

      if (ownerBreakdownResponse.error) {
        if (
          isMissingSupabaseFunction(ownerBreakdownResponse.error) ||
          isMissingSupabaseTable(ownerBreakdownResponse.error)
        ) {
          trendMeta.missingWeeklyOwnerBreakdown = true;
          if (isMissingSupabaseTable(ownerBreakdownResponse.error)) {
            trendMeta.missingTable = true;
          }
        } else {
          console.error(
            '[admin/audio-events] failed to fetch owner breakdown',
            ownerBreakdownResponse.error
          );
        }
      }

      const buckets = Array.isArray(trendResponse.data)
        ? trendResponse.data.map(bucket => ({
            weekStart: bucket.week_start,
            eventCount: Number.isFinite(bucket.event_count)
              ? Number(bucket.event_count)
              : Number.parseInt(bucket.event_count, 10) || 0,
            uniqueOwners: Number.isFinite(bucket.unique_owners)
              ? Number(bucket.unique_owners)
              : Number.parseInt(bucket.unique_owners, 10) || 0,
            uniqueProfiles: Number.isFinite(bucket.unique_profiles)
              ? Number(bucket.unique_profiles)
              : Number.parseInt(bucket.unique_profiles, 10) || 0,
          }))
        : [];

      const normaliseBreakdown = (entries = [], fallbackLabel) =>
        Array.isArray(entries)
          ? entries.map(entry => ({
              weekStart: entry.week_start,
              dimensionId: entry.dimension_id || 'unknown',
              dimensionLabel: entry.dimension_label || fallbackLabel || '미지정',
              eventCount: Number.isFinite(entry.event_count)
                ? Number(entry.event_count)
                : Number.parseInt(entry.event_count, 10) || 0,
            }))
          : [];

      return res.status(200).json({
        buckets,
        range: {
          since: startDate,
          until: end,
          lookbackWeeks,
        },
        breakdown: {
          hero: normaliseBreakdown(heroBreakdownResponse.data, '히어로 미지정'),
          owner: normaliseBreakdown(ownerBreakdownResponse.data, '운영자 미지정'),
        },
        meta: trendMeta,
      });
    }

    let query = supabaseAdmin
      .from('rank_audio_events')
      .select(
        'id, owner_id, profile_key, hero_id, hero_name, hero_source, event_type, details, created_at'
      );

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }
    if (profileKey) {
      query = query.eq('profile_key', profileKey);
    }
    if (heroId) {
      query = query.eq('hero_id', heroId);
    }
    if (eventTypes.length) {
      query = query.in('event_type', eventTypes);
    }
    if (since) {
      query = query.gte('created_at', since);
    }
    if (until) {
      query = query.lte('created_at', until);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      if (isMissingSupabaseTable(error)) {
        return res.status(200).json({
          items: [],
          stats: { total: 0, uniqueOwners: 0, uniqueProfiles: 0, byEventType: {} },
          availableEventTypes: [],
          meta: { missingTable: true },
        });
      }

      console.error('[admin/audio-events] failed to fetch events', error);
      return res.status(500).json({ error: 'Failed to fetch audio events' });
    }

    const items = Array.isArray(data) ? data : [];
    const filtered = searchTerm
      ? items.filter(item => {
          const haystacks = [
            item.hero_name,
            item.hero_source,
            item.profile_key,
            item.event_type,
            item.details?.preference?.trackId,
            item.details?.preference?.presetId,
            ...(Array.isArray(item.details?.changedFields) ? item.details.changedFields : []),
          ]
            .filter(Boolean)
            .map(value => String(value).toLowerCase());
          return haystacks.some(value => value.includes(searchTerm));
        })
      : items;

    const stats = normaliseStats(filtered);
    const responsePayload = {
      items: filtered,
      stats,
      availableEventTypes: Array.from(
        new Set(items.map(item => (item.event_type || '').trim()).filter(Boolean))
      ).sort(),
    };

    if (req.query.format === 'csv') {
      const csv = buildCsv(filtered);
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rank-audio-events-${timestamp}.csv"`
      );
      return res.status(200).send(csv);
    }

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('[admin/audio-events] unexpected failure', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
