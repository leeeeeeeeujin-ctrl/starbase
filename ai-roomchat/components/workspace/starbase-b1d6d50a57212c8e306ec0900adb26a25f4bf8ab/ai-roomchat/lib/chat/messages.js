'use client';

import { supabase } from '../supabase';
import { createDraftyFromText, inspectDrafty } from './drafty';

export const MESSAGE_LIMIT = 30;

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user || null;
}

export async function fetchRecentMessages({
  limit = MESSAGE_LIMIT,
  sessionId = null,
  matchInstanceId = null,
  chatRoomId = null,
  scope = null,
  targetOwnerId = null,
  targetHeroId = null,
} = {}) {
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const { data, error } = await supabase.rpc('fetch_rank_chat_threads', {
    p_limit: cappedLimit,
    p_session_id: sessionId,
    p_match_instance_id: matchInstanceId,
    p_chat_room_id: chatRoomId,
    p_scope: scope || null,
  });

  if (error) {
    throw error;
  }

  if (!data || typeof data !== 'object') {
    return {
      messages: [],
      viewerRole: null,
      sessionId: sessionId || null,
      matchInstanceId: matchInstanceId || null,
      gameId: null,
    };
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];

  // If user is viewing a DM (whisper), optionally filter to only messages addressed to/from that target
  let filtered = messages;
  if ((scope && scope.toLowerCase() === 'whisper') && (targetOwnerId || targetHeroId)) {
    const toComparable = v => (v ? String(v).trim().toLowerCase() : null);
    const targetOwner = toComparable(targetOwnerId);
    const targetHero = toComparable(targetHeroId);
    filtered = messages.filter(m => {
      const owner = toComparable(m.owner_id || m.user_id);
      const hero = toComparable(m.hero_id);
      const tOwner = toComparable(m.target_owner_id);
      const tHero = toComparable(m.target_hero_id);
      const isToTarget = (tOwner && targetOwner && tOwner === targetOwner) || (tHero && targetHero && tHero === targetHero);
      const isFromTarget = (owner && targetOwner && owner === targetOwner) || (hero && targetHero && hero === targetHero);
      return isToTarget || isFromTarget;
    });
  }

  return {
    messages: filtered,
    viewerRole: data.viewerRole || null,
    sessionId: data.sessionId || sessionId || null,
    matchInstanceId: data.matchInstanceId || matchInstanceId || null,
    gameId: data.gameId || null,
    chatRoomId: chatRoomId || null,
  };
}

export async function insertMessage(payload, context = {}) {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const attachments = Array.isArray(payload?.attachments)
    ? payload.attachments.filter(Boolean)
    : [];
  const hasAttachments = attachments.length > 0;

  if (!text && !hasAttachments) {
    throw new Error('메시지가 비어 있습니다.');
  }

  const scope = payload?.scope || 'global';
  const draftyDoc = createDraftyFromText(text);
  const summary = inspectDrafty(draftyDoc);
  const metadataBase =
    payload?.metadata && typeof payload.metadata === 'object' ? { ...payload.metadata } : {};
  metadataBase.drafty = metadataBase.drafty || draftyDoc;
  metadataBase.plain_text = metadataBase.plain_text || summary.plainText || text || '';
  if (!metadataBase.summary) {
    metadataBase.summary = {
      has_links: summary.hasLinks,
      has_mentions: summary.hasMentions,
      has_hashtags: summary.hasHashtags,
    };
  }

  if (hasAttachments) {
    metadataBase.attachments = attachments.map(attachment => ({ ...attachment }));
  }

  const { data, error } = await supabase.rpc('send_rank_chat_message', {
    p_scope: scope,
    p_text: text,
    p_session_id: context.sessionId || null,
    p_match_instance_id: context.matchInstanceId || null,
    p_game_id: context.gameId || null,
    p_room_id: context.roomId || null,
    p_chat_room_id: context.chatRoomId || null,
    p_hero_id: payload?.hero_id || null,
    p_target_hero_id: payload?.target_hero_id || null,
    p_target_role: payload?.target_role || null,
    p_metadata: metadataBase,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    hero_name: data.hero_name || data.username || payload?.hero_name || payload?.username || '익명',
  };
}

function toComparable(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const token = String(value).trim();
  return token.length ? token.toLowerCase() : null;
}

function listIncludesIdentifier(list, identifier) {
  if (!identifier) return false;
  if (!Array.isArray(list) || !list.length) return false;
  const target = toComparable(identifier);
  if (!target) return false;
  return list.some(entry => toComparable(entry) === target);
}

function messageMatchesContext(record, context) {
  if (!record) {
    return false;
  }

  const {
    scope,
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    chatRoomId,
    heroId,
    ownerId,
    userId,
    targetOwnerId,
    targetHeroId,
  } = context;

  const recordScope = toComparable(record.scope);
  const recordSession = toComparable(record.session_id);
  const recordMatch = toComparable(record.match_instance_id);
  const recordGame = toComparable(record.game_id);
  const recordRoom = toComparable(record.room_id);
  const recordChatRoom = toComparable(record.chat_room_id);
  const recordHero = toComparable(record.hero_id);
  const recordTargetHero = toComparable(record.target_hero_id);
  const recordOwner = toComparable(record.owner_id);
  const recordTargetOwner = toComparable(record.target_owner_id);
  const recordUser = toComparable(record.user_id);
  const viewerTargetOwner = toComparable(targetOwnerId);
  const viewerTargetHero = toComparable(targetHeroId);
  const viewerScope = toComparable(scope);
  const viewerSession = toComparable(sessionId);
  const viewerMatch = toComparable(matchInstanceId);
  const viewerGame = toComparable(gameId);
  const viewerRoom = toComparable(roomId);
  const viewerChatRoom = toComparable(chatRoomId);
  const viewerHero = toComparable(heroId);
  const viewerOwner = toComparable(ownerId);
  const viewerUser = toComparable(userId);

  const matchesScope = !viewerScope || viewerScope === recordScope;
  const matchesSession = !viewerSession || viewerSession === recordSession;
  const matchesMatch = !viewerMatch || viewerMatch === recordMatch;
  const matchesGame = !viewerGame || viewerGame === recordGame;
  const matchesRoom = !viewerRoom || viewerRoom === recordRoom;
  const matchesChatRoom = !viewerChatRoom || viewerChatRoom === recordChatRoom;

  const visibility = Array.isArray(record.visible_owner_ids) ? record.visible_owner_ids : [];
  const visibilityAllowsViewer =
    !visibility.length ||
    (viewerOwner && listIncludesIdentifier(visibility, viewerOwner)) ||
    (viewerUser && listIncludesIdentifier(visibility, viewerUser));

  const heroAllowed =
    !viewerHero ||
    recordHero === viewerHero ||
    recordTargetHero === viewerHero ||
    visibilityAllowsViewer;

  const ownerAllowed =
    !viewerOwner ||
    recordOwner === viewerOwner ||
    recordTargetOwner === viewerOwner ||
    visibilityAllowsViewer;

  const userAllowed = !viewerUser || recordUser === viewerUser || visibilityAllowsViewer;

  return (
    matchesScope &&
    matchesSession &&
    matchesMatch &&
    matchesGame &&
    matchesRoom &&
    matchesChatRoom &&
    heroAllowed &&
    ownerAllowed &&
    userAllowed &&
    visibilityAllowsViewer &&
    // If viewing a DM thread, ensure message is to/from that target
    (!(toComparable(scope) === 'whisper' && (viewerTargetOwner || viewerTargetHero)) ||
      (
        // from target to me or to target from me
        (viewerTargetOwner && (recordOwner === viewerTargetOwner || recordTargetOwner === viewerTargetOwner)) ||
        (viewerTargetHero && (recordHero === viewerTargetHero || recordTargetHero === viewerTargetHero))
      ))
  );
}

export function subscribeToMessages({
  onInsert,
  sessionId = null,
  matchInstanceId = null,
  gameId = null,
  roomId = null,
  chatRoomId = null,
  scope = null,
  heroId = null,
  ownerId = null,
  userId = null,
  targetOwnerId = null,
  targetHeroId = null,
  channelName = null,
} = {}) {
  const handler = typeof onInsert === 'function' ? onInsert : () => {};

  const context = {
    scope,
    sessionId,
    matchInstanceId,
    gameId,
    roomId,
    chatRoomId,
    heroId,
    ownerId,
    userId,
    targetOwnerId,
    targetHeroId,
  };

  const topic = channelName
    ? String(channelName)
    : `pgchanges:messages:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase.channel(topic);

  const forwardChange = payload => {
    if (!payload || !payload.new) {
      return;
    }

    const record = payload.new;
    if (!messageMatchesContext(record, context)) {
      return;
    }

    try {
      handler(record, payload);
    } catch (error) {
      console.error('[realtime] 메시지 핸들러 실행 중 오류가 발생했습니다.', error);
    }
  };

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    forwardChange
  );
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'messages' },
    forwardChange
  );

  let active = true;

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[realtime] 메시지 채널 상태 이상이 감지되었습니다.', {
        topic,
        status,
        error: err || null,
      });
    }

    if (status === 'CLOSED') {
      console.info('[realtime] 메시지 채널이 종료되었습니다.', { topic });
    }
  });

  return () => {
    if (!active) {
      return;
    }
    active = false;

    try {
      channel.unsubscribe();
    } catch (error) {
      console.warn('[realtime] 메시지 채널 구독 해제에 실패했습니다.', {
        topic: channelName,
        error,
      });
    }

    try {
      supabase.removeChannel(channel);
    } catch (error) {
      console.warn('[realtime] 메시지 채널 제거 중 오류가 발생했습니다.', {
        topic: channelName,
        error,
      });
    }
  };
}
