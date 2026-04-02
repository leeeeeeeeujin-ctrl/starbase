import { supabaseAdmin } from '../../../lib/supabaseAdmin.js';
import { buildHeroGameContext } from '../../../lib/characters/agentContext.js';
import { rehydrateBattleSession } from '../../../lib/battle/session.js';

function normalizeBootstrapSession(value) {
  if (!value || typeof value !== 'object') return null;
  return rehydrateBattleSession(value);
}

function buildRuntimeParticipantMap(runtimeSession) {
  const participants = Array.isArray(runtimeSession?.participants?.list)
    ? runtimeSession.participants.list
    : Array.isArray(runtimeSession?.participants)
      ? runtimeSession.participants
      : [];
  return new Map(
    participants
      .filter(participant => participant?.heroId)
      .map(participant => [String(participant.heroId), participant])
  );
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { id, sessionId } = req.query || {};
  const sid = id || sessionId;

  if (!sid) {
    return res.status(400).json({ ok: false, error: 'missing_session_id' });
  }

  if (!supabaseAdmin || typeof supabaseAdmin.from !== 'function') {
    return res
      .status(500)
      .json({ ok: false, error: 'supabase_not_configured' });
  }

  try {
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('text_battle_sessions')
      .select('*')
      .eq('id', sid)
      .maybeSingle?.();

    if (sessionError) {
      return res.status(500).json({
        ok: false,
        error: 'session_query_failed',
        detail: sessionError.message || null,
      });
    }

    if (!session) {
      return res
        .status(404)
        .json({ ok: false, error: 'session_not_found' });
    }

    const { data: turns, error: turnsError } = await supabaseAdmin
      .from('text_battle_turns')
      .select('*')
      .eq('session_id', sid)
      .order('turn_index', { ascending: true });

    if (turnsError) {
      return res.status(500).json({
        ok: false,
        error: 'turns_query_failed',
        detail: turnsError.message || null,
      });
    }

    const bootstrapTurn = Array.isArray(turns)
      ? turns.find(turn => Number(turn?.turn_index) < 0 && turn?.node_id === '__bootstrap__')
      : null;
    const runtimeSession = normalizeBootstrapSession(bootstrapTurn?.effects?.session || null);
    const runtimeParticipantMap = buildRuntimeParticipantMap(runtimeSession);
    const bootstrapParticipants = Array.isArray(bootstrapTurn?.effects?.participants)
      ? bootstrapTurn.effects.participants
      : [];
    const bootstrapParticipantMap = new Map(
      bootstrapParticipants
        .filter(participant => participant?.heroId)
        .map(participant => [String(participant.heroId), participant])
    );
    const visibleTurns = Array.isArray(turns)
      ? turns.filter(turn => Number(turn?.turn_index) >= 0)
      : [];

    const heroIds = Array.from(
      new Set(
        [
          ...visibleTurns.flatMap(turn => [turn?.hero_id, turn?.rival_id]),
          ...((Array.isArray(runtimeSession?.participants) ? runtimeSession.participants : [])
            .map(participant => participant?.heroId || null)),
        ]
          .filter(Boolean)
          .map(value => String(value))
      )
    );

    let participants = [];
    let agentContexts = [];

    if (heroIds.length) {
      const { data: heroRows, error: heroError } = await supabaseAdmin
        .from('heroes')
        .select(
          [
            'id',
            'name',
            'description',
            'ability1',
            'ability2',
            'ability3',
            'ability4',
            'image_url',
            'background_url',
            'bgm_url',
            'agent_profile',
          ].join(',')
        )
        .in('id', heroIds);

      if (heroError) {
        return res.status(500).json({
          ok: false,
          error: 'heroes_query_failed',
          detail: heroError.message || null,
        });
      }

      participants = Array.isArray(heroRows)
        ? heroRows.map(row => {
            const runtimeParticipant =
              runtimeParticipantMap.get(String(row.id)) ||
              bootstrapParticipantMap.get(String(row.id)) ||
              null;
            const runtimeMeta =
              runtimeParticipant?.meta && typeof runtimeParticipant.meta === 'object'
                ? runtimeParticipant.meta
                : {};
            return {
              id: runtimeParticipant?.id || row.id,
              hero_id: row.id,
              slot_no:
                Number.isFinite(Number(runtimeParticipant?.slotNo))
                  ? Number(runtimeParticipant.slotNo)
                  : null,
              role_slot_no:
                Number.isFinite(Number(runtimeParticipant?.roleSlotNo))
                  ? Number(runtimeParticipant.roleSlotNo)
                  : null,
              slot_label:
                runtimeParticipant?.slotLabel ||
                null,
              name:
                runtimeParticipant?.name ||
                row.name ||
                '이름 없는 캐릭터',
              role: runtimeParticipant?.role || null,
              team: runtimeParticipant?.team || null,
              description:
                row.description ||
                runtimeMeta.description ||
                '',
              abilities: [row.ability1, row.ability2, row.ability3, row.ability4]
                .filter(Boolean)
                .length
                ? [row.ability1, row.ability2, row.ability3, row.ability4].filter(Boolean)
                : Array.isArray(runtimeMeta.abilities)
                  ? runtimeMeta.abilities.filter(Boolean)
                  : [],
              image_url: row.image_url || runtimeMeta.image_url || null,
              background_url:
                row.background_url || runtimeMeta.background_url || null,
              bgm_url: row.bgm_url || runtimeMeta.bgm_url || null,
              owner_id: runtimeParticipant?.ownerId || runtimeMeta.ownerId || null,
              agent_profile:
                row.agent_profile && typeof row.agent_profile === 'object'
                  ? row.agent_profile
                  : runtimeMeta.agent_profile &&
                      typeof runtimeMeta.agent_profile === 'object'
                    ? runtimeMeta.agent_profile
                    : {},
            };
          })
        : [];

      const participantPrompt = participants
        .map(entry =>
          [
            entry.name,
            entry.description ? `설명: ${entry.description}` : '',
            entry.abilities.length ? `능력: ${entry.abilities.join(' / ')}` : '',
          ]
            .filter(Boolean)
            .join(' | ')
        )
        .join('\n');

      const latestTurn = visibleTurns.length ? visibleTurns[visibleTurns.length - 1] : null;

      agentContexts = participants.map(entry => ({
        heroId: entry.id,
        name: entry.name,
        context: buildHeroGameContext({
          heroSummary: {
            name: entry.name,
            description: entry.description,
            abilities: entry.abilities,
          },
          profile: entry.agent_profile || {},
          gamePrompt: [latestTurn?.prompt || '', latestTurn?.ai_response || ''].filter(Boolean).join('\n\n'),
          participantPrompt,
        }),
      }));
    }

    return res.status(200).json({
      ok: true,
      session,
      runtimeSession,
      turns: visibleTurns,
      participants,
      agentContexts,
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: e?.message || String(e),
    });
  }
}
