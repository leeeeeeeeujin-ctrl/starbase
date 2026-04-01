import { createClient } from '@supabase/supabase-js';

import {
  buildTurnPromptContext,
  createBattleSession,
  getCurrentTurn,
  resolveTurnActorId,
} from '@/lib/battle/session';
import { buildTurnAgentContexts, buildRuntimePromptFromTurn } from '@/lib/battle/agentRuntime';
import { toTextBattleSessionRow } from '@/lib/runtime/textBattlePersistence';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';
import { withTableQuery } from '@/lib/supabaseTables';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for text-battle start API');
}

const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  },
});

function normalizeParticipantsFromHeroes(heroRows = [], definition = {}) {
  const roles = Array.isArray(definition?.roles) ? definition.roles : [];
  return heroRows.map((hero, index) => {
    const assignedRole = roles[index] || null;
    return {
      id: `participant-${hero.id || index + 1}`,
      ownerId: hero.owner_id || '',
      heroId: hero.id || '',
      team: assignedRole?.team || (index % 2 === 0 ? 'alpha' : 'beta'),
      role: assignedRole?.name || assignedRole?.id || (index === 0 ? 'player' : 'opponent'),
      name: hero.name || `참가자 ${index + 1}`,
      meta: {
        description: hero.description || '',
        abilities: [hero.ability1, hero.ability2, hero.ability3, hero.ability4].filter(Boolean),
        image_url: hero.image_url || null,
        background_url: hero.background_url || null,
        bgm_url: hero.bgm_url || null,
        agent_profile:
          hero.agent_profile && typeof hero.agent_profile === 'object' ? hero.agent_profile : {},
      },
    };
  });
}

function serializeSession(session, participants) {
  return {
    id: session.id,
    status: session.status,
    actorId: session.actorId,
    currentTurnId: session.currentTurnId,
    turnIndex: session.turnIndex,
    values: session.values || {},
    logs: Array.isArray(session.logs) ? session.logs : [],
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
    definition: session.definition,
    participants,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    const viewer = authData?.user || null;
    if (authError || !viewer) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload || '{}');
      } catch (error) {
        return res.status(400).json({ ok: false, error: 'invalid_payload' });
      }
    }

    const definition = payload?.definition && typeof payload.definition === 'object' ? payload.definition : null;
    const heroIds = Array.isArray(payload?.heroIds) ? payload.heroIds.filter(Boolean) : [];
    const gameName =
      (typeof payload?.gameName === 'string' && payload.gameName.trim()) ||
      (typeof definition?.name === 'string' && definition.name.trim()) ||
      '새 텍스트 배틀';
    const promptSetId =
      (typeof payload?.promptSetId === 'string' && payload.promptSetId.trim()) || null;

    if (!definition || !Array.isArray(definition.turns) || !definition.turns.length) {
      return res.status(400).json({ ok: false, error: 'missing_definition' });
    }

    if (!heroIds.length) {
      return res.status(400).json({ ok: false, error: 'missing_hero_ids' });
    }

    const { data: heroRows, error: heroesError } = await withTableQuery(
      supabaseAdmin,
      'heroes',
      from =>
        from
          .select(
            'id, owner_id, name, description, ability1, ability2, ability3, ability4, image_url, background_url, bgm_url, agent_profile'
          )
          .in('id', heroIds)
      );

    if (heroesError) {
      return res.status(400).json({ ok: false, error: heroesError.message });
    }

    const heroes = Array.isArray(heroRows) ? heroRows : [];
    if (!heroes.length) {
      return res.status(404).json({ ok: false, error: 'heroes_not_found' });
    }

    const participants = normalizeParticipantsFromHeroes(heroes, definition);
    const session = createBattleSession({
      definition,
      participants,
      actorId: participants[0]?.id || '',
    });
    const currentTurn = getCurrentTurn(session);
    const actorId = resolveTurnActorId(session, currentTurn, session.actorId);
    session.actorId = actorId;
    const promptContext = buildTurnPromptContext(session, currentTurn, actorId);
    const { agentContexts, runtimePrompt } = buildRuntimePromptFromTurn(
      session,
      currentTurn,
      actorId
    );

    const sessionRow = toTextBattleSessionRow({
      externalId: session.id,
      ownerId: viewer.id,
      promptSetId,
      gameName,
      variables: session.values,
    });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('text_battle_sessions')
      .insert(sessionRow)
      .select('id, external_id, owner_id, prompt_set_id, game_name, status, created_at')
      .limit(1)
      .maybeSingle();

    if (insertError) {
      return res.status(502).json({
        ok: false,
        error: 'text_session_insert_failed',
        detail: insertError.message || null,
      });
    }

    return res.status(200).json({
      ok: true,
      textSession: inserted || null,
      session: serializeSession(session, participants),
      currentTurn,
      promptContext,
      agentContexts,
      runtimePrompt,
      participants,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      detail: error?.message || String(error),
    });
  }
}
