import { supabase } from '@/lib/supabase';
import { runClientAction } from '@/lib/rank/clientActions';

/**
 * Dispatch an action attached to a bridge edge, if any.
 * This helper intentionally stays free of React state and only talks
 * to the outside world via injected arguments and supabase/client APIs.
 */
export async function dispatchEdgeActionIfNeeded({
  edge,
  actorContext,
  participants,
  gameId,
  sessionInfo,
  patchEngineState,
}) {
  if (!edge?.data?.action || edge.data.action === 'continue') {
    return;
  }

  try {
    const actionName = edge.data.action;

    const explicitPayload = edge.data.payload || edge.data.actionPayload || null;
    const defaultPayload = {
      ownerId: actorContext?.participant?.owner_id || null,
      slotIndex: actorContext?.slotIndex ?? null,
      amount: 1,
    };
    const actionPayload = explicitPayload || defaultPayload;

    const runLocally = !!edge.data?.runLocally || !!edge.data?.run_local;

    if (runLocally) {
      await handleLocalAction({
        actionName,
        actionPayload,
        actorContext,
        participants,
        patchEngineState,
        gameId,
        sessionInfo,
      });
      return;
    }

    await handleServerAction({
      actionName,
      actionPayload,
      patchEngineState,
      gameId,
      sessionInfo,
    });
  } catch (err) {
    console.warn('[StartClient] action dispatch error:', err?.message || err);
  }
}

async function handleLocalAction({
  actionName,
  actionPayload,
  actorContext,
  participants,
  patchEngineState,
  gameId,
  sessionInfo,
}) {
  try {
    const localResp = await runClientAction(actionName, {
      payload: actionPayload,
      participants,
      actorContext,
    });

    if (localResp?.ok) {
      const updated = Array.isArray(localResp?.changes?.participants)
        ? localResp.changes.participants
        : null;
      if (updated) {
        patchEngineState({ participants: updated });
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!sessionError && sessionData?.session?.access_token) {
          const token = sessionData.session.access_token;
          const requestId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

          void fetch('/api/rank/log-action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: actionName,
              summary: localResp.summary || null,
              result: localResp.result || null,
              session_id: sessionInfo?.id || null,
              game_id: gameId || null,
              request_id: requestId,
            }),
          }).catch(err => console.warn('[StartClient] log-action fetch failed', err));
        }
      } catch (err) {
        console.warn('[StartClient] log-action error', err?.message || err);
      }
    } else {
      console.warn('[StartClient] local action failed', localResp);
    }
  } catch (err) {
    console.warn('[StartClient] local action error:', err?.message || err);
  }
}

async function handleServerAction({
  actionName,
  actionPayload,
  patchEngineState,
  gameId,
  sessionInfo,
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('missing_session_token');

  const resp = await fetch('/api/rank/handle-action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: actionName,
      payload: actionPayload,
      session_id: sessionInfo?.id || null,
      game_id: gameId || null,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    console.warn('[StartClient] action dispatch failed', detail);
    return;
  }

  const body = await resp.json().catch(() => ({}));
  if (body?.changes && body.changes.participants) {
    const updated = Array.isArray(body.changes.participants)
      ? body.changes.participants
      : null;
    if (updated) {
      patchEngineState({ participants: updated });
    }
  }
}
