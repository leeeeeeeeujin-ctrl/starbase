import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sanitizeSupabaseUrl } from '@/lib/supabaseEnv';
import { buildBattleDefinitionFromGraph } from '@/lib/battle/definition';

const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration for join-game API');
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

function buildRoleRowsFromDefinition(gameId, definition) {
  const roles = Array.isArray(definition?.roles) ? definition.roles : [];
  return roles
    .map(role => {
      const name = String(role?.name || '').trim();
      if (!name) return null;
      const slotCount = Number.isFinite(Number(role?.limit)) ? Math.max(1, Number(role.limit)) : 1;
      return {
        game_id: gameId,
        name,
        slot_count: slotCount,
        active: true,
      };
    })
    .filter(Boolean);
}

function buildSlotRowsFromRoleRows(gameId, roleRows) {
  let slotIndex = 1;
  const rows = [];
  roleRows.forEach(role => {
    const slotCount = Number.isFinite(Number(role.slot_count)) ? Math.max(1, Number(role.slot_count)) : 1;
    for (let index = 0; index < slotCount; index += 1) {
      rows.push({
        game_id: gameId,
        slot_index: slotIndex,
        role: role.name,
        active: true,
      });
      slotIndex += 1;
    }
  });
  return rows;
}

async function hydrateRoleSlotsFromWorkspace(gameId) {
  const { data: workspaceRow, error: workspaceError } = await supabaseAdmin
    .from('rank_game_workspaces')
    .select('game_id, game_name, prompt_set_id, graph, template, runtime_config')
    .eq('game_id', gameId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (workspaceError || !workspaceRow) {
    return { ok: false };
  }

  const graph = workspaceRow.graph && typeof workspaceRow.graph === 'object' ? workspaceRow.graph : {};
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const rawConfig =
    workspaceRow?.template?.battleConfig ||
    workspaceRow?.template?.battle_config ||
    workspaceRow?.runtime_config?.battleConfig ||
    workspaceRow?.runtime_config?.battle_config ||
    {};

  const definition = buildBattleDefinitionFromGraph({
    setInfo: {
      id: workspaceRow?.prompt_set_id || '',
      name: workspaceRow?.game_name || '이름 없는 게임',
      description:
        workspaceRow?.template?.description || workspaceRow?.runtime_config?.description || '',
    },
    nodes,
    edges,
    config: rawConfig,
  });

  const roleRows = buildRoleRowsFromDefinition(gameId, definition);
  if (!roleRows.length) {
    return { ok: false };
  }

  const slotRows = buildSlotRowsFromRoleRows(gameId, roleRows);

  await supabaseAdmin.from('rank_game_roles').delete().eq('game_id', gameId);
  await supabaseAdmin.from('rank_game_slots').delete().eq('game_id', gameId).is('hero_id', null);

  const { error: roleInsertError } = await supabaseAdmin.from('rank_game_roles').insert(roleRows);
  if (roleInsertError) {
    return { ok: false, error: roleInsertError };
  }

  const { error: slotInsertError } = await supabaseAdmin.from('rank_game_slots').insert(slotRows);
  if (slotInsertError) {
    return { ok: false, error: slotInsertError };
  }

  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user || null;
  if (userError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const { game_id, hero_id, role, score } = payload || {};

  if (!game_id || !hero_id || !role) {
    return res.status(400).json({ error: 'missing_fields' });
  }

  const ownerId = user.id;
  const trimmedRole = typeof role === 'string' ? role.trim() : '';
  if (!trimmedRole) {
    return res.status(400).json({ error: 'invalid_role' });
  }

  const now = new Date().toISOString();

  const { data: heroRow, error: heroError } = await supabaseAdmin
    .from('heroes')
    .select('id, owner_id')
    .eq('id', hero_id)
    .maybeSingle();
  if (heroError) {
    return res.status(400).json({ error: heroError.message });
  }
  if (!heroRow || heroRow.owner_id !== ownerId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { data: gameRow, error: gameError } = await supabaseAdmin
    .from('rank_games')
    .select('id')
    .eq('id', game_id)
    .maybeSingle();
  if (gameError) {
    return res.status(400).json({ error: gameError.message });
  }
  if (!gameRow) {
    return res.status(404).json({ error: 'game_not_found' });
  }

  const { data: existingSlots, error: existingSlotsError } = await supabaseAdmin
    .from('rank_game_slots')
    .select('id, role, hero_id, active')
    .eq('game_id', game_id);
  if (existingSlotsError) {
    return res.status(400).json({ error: existingSlotsError.message });
  }

  const activeSlots = (existingSlots || []).filter(slot => slot?.active !== false);
  const hasRequestedRole = activeSlots.some(
    slot => String(slot?.role || '').trim() === trimmedRole
  );
  const hasOccupiedSlots = activeSlots.some(slot => Boolean(slot?.hero_id));

  if (!activeSlots.length || (!hasRequestedRole && !hasOccupiedSlots)) {
    const hydrateResult = await hydrateRoleSlotsFromWorkspace(game_id);
    if (hydrateResult?.error) {
      return res.status(400).json({ error: hydrateResult.error.message || 'failed_to_prepare_slots' });
    }
  }

  const releaseQuery = supabaseAdmin
    .from('rank_game_slots')
    .update({ hero_id: null, hero_owner_id: null, updated_at: now })
    .eq('game_id', game_id)
    .eq('hero_owner_id', ownerId);
  const { error: releaseError } = await releaseQuery;
  if (releaseError) {
    return res.status(400).json({ error: releaseError.message });
  }

  const { data: slotCandidate, error: slotLookupError } = await supabaseAdmin
    .from('rank_game_slots')
    .select('id')
    .eq('game_id', game_id)
    .eq('role', trimmedRole)
    .eq('active', true)
    .is('hero_id', null)
    .order('slot_index', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (slotLookupError) {
    return res.status(400).json({ error: slotLookupError.message });
  }
  let claimedSlot = null;
  if (slotCandidate) {
    const { data: slotRow, error: claimError } = await supabaseAdmin
      .from('rank_game_slots')
      .update({ hero_id, hero_owner_id: ownerId, updated_at: now })
      .eq('id', slotCandidate.id)
      .is('hero_id', null)
      .select('id, slot_index, role')
      .maybeSingle();
    if (claimError) {
      return res.status(400).json({ error: claimError.message });
    }
    claimedSlot = slotRow || null;
  }

  const { data: existingParticipant, error: participantError } = await supabaseAdmin
    .from('rank_participants')
    .select('id, rating, score, battles, win_rate, status')
    .eq('game_id', game_id)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (participantError) {
    if (claimedSlot?.id) {
      await supabaseAdmin
        .from('rank_game_slots')
        .update({ hero_id: null, hero_owner_id: null, updated_at: now })
        .eq('id', claimedSlot.id);
    }
    return res.status(400).json({ error: participantError.message });
  }

  const nextRating = Number.isFinite(Number(existingParticipant?.rating))
    ? Number(existingParticipant.rating)
    : Number.isFinite(Number(score))
      ? Number(score)
      : 1000;

  const participantPayload = {
    id: existingParticipant?.id,
    game_id,
    owner_id: ownerId,
    hero_id,
    hero_ids: [hero_id],
    role: trimmedRole,
    score: Number.isFinite(Number(score)) ? Number(score) : (existingParticipant?.score ?? null),
    rating: nextRating,
    battles: existingParticipant?.battles ?? 0,
    win_rate: existingParticipant?.win_rate ?? null,
    status:
      existingParticipant?.status && existingParticipant.status !== 'out'
        ? existingParticipant.status
        : 'ready',
    updated_at: now,
  };

  const { data: upsertedParticipant, error: upsertError } = await supabaseAdmin
    .from('rank_participants')
    .upsert(participantPayload, { onConflict: 'game_id,owner_id' })
    .select('id, hero_id, role, status')
    .maybeSingle();

  if (upsertError) {
    if (claimedSlot?.id) {
      await supabaseAdmin
        .from('rank_game_slots')
        .update({ hero_id: null, hero_owner_id: null, updated_at: now })
        .eq('id', claimedSlot.id);
    }
    return res.status(400).json({ error: upsertError.message });
  }

  return res.status(200).json({
    ok: true,
    slot: claimedSlot,
    participant: upsertedParticipant || null,
    overflow: !claimedSlot,
  });
}
