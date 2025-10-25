'use client';

import { supabase } from '@/lib/supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value) {
  if (!value && value !== 0) {
    return null;
  }
  const token = String(value).trim();
  if (!token || !UUID_PATTERN.test(token)) {
    return null;
  }
  return token;
}

function normalizePollOption(option) {
  if (!option || typeof option !== 'object') {
    return null;
  }

  const rawId = option.id ?? option.option_id ?? null;
  const id = rawId !== null && rawId !== undefined ? String(rawId).trim() : null;
  if (!id) {
    return null;
  }

  const rawLabel = option.label ?? option.text ?? '';
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  if (!label) {
    return null;
  }

  const positionCandidates = [option.position, option.index, option.option_index];
  let position = 0;
  for (const candidate of positionCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      position = parsed;
      break;
    }
  }

  const voteCountCandidates = [option.voteCount, option.vote_count];
  let voteCount = 0;
  for (const candidate of voteCountCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > voteCount) {
      voteCount = parsed;
    }
  }

  return {
    id,
    label,
    position: Number.isFinite(position) ? position : 0,
    voteCount: Math.max(0, Math.trunc(voteCount)),
    viewerVoted: option.viewerVoted === true || option.viewer_voted === true,
  };
}

function normalizeAnnouncementPoll(poll) {
  if (!poll || typeof poll !== 'object') {
    return null;
  }

  const rawId = poll.id ?? poll.poll_id ?? null;
  const id = rawId !== null && rawId !== undefined ? String(rawId).trim() : null;
  if (!id) {
    return null;
  }

  const rawQuestion = poll.question ?? poll.title ?? '';
  const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : '';
  if (!question) {
    return null;
  }

  const options = Array.isArray(poll.options)
    ? poll.options.map(normalizePollOption).filter(Boolean)
    : [];

  if (options.length < 2) {
    return null;
  }

  options.sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });

  const totalVotesCandidates = [poll.totalVotes, poll.total_votes];
  let totalVotes = 0;
  for (const candidate of totalVotesCandidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > totalVotes) {
      totalVotes = parsed;
    }
  }

  const optionVoteSum = options.reduce(
    (sum, option) => sum + (Number.isFinite(option.voteCount) ? option.voteCount : 0),
    0
  );
  const resolvedTotalVotes = Math.max(totalVotes, optionVoteSum);

  const viewerOptionRaw =
    poll.viewerOptionId ?? poll.viewer_option_id ?? poll.viewer_option ?? poll.viewerOption ?? null;
  let viewerOptionId = null;
  if (viewerOptionRaw !== null && viewerOptionRaw !== undefined) {
    const normalized = String(viewerOptionRaw).trim();
    if (normalized) {
      viewerOptionId = normalized;
    }
  }

  const normalizedOptions = options.map(option => ({
    ...option,
    viewerVoted: option.viewerVoted || (viewerOptionId ? option.id === viewerOptionId : false),
  }));

  if (viewerOptionId && !normalizedOptions.some(option => option.id === viewerOptionId)) {
    viewerOptionId = null;
  }

  return {
    id,
    question,
    totalVotes: resolvedTotalVotes,
    viewerOptionId,
    options: normalizedOptions,
  };
}

function normalizeAnnouncementEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const polls = Array.isArray(entry.polls)
    ? entry.polls.map(normalizeAnnouncementPoll).filter(Boolean)
    : [];

  const idRaw = entry.id ?? entry.announcement_id ?? null;
  const id = idRaw !== null && idRaw !== undefined ? String(idRaw).trim() : null;

  const titleRaw = entry.title ?? entry.subject ?? '';
  const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';

  const contentRaw = entry.content ?? entry.body ?? '';
  const content = typeof contentRaw === 'string' ? contentRaw : '';

  const imageUrlRaw = entry.image_url ?? entry.imageUrl ?? entry.cover_url ?? null;
  const imageUrl = imageUrlRaw ? String(imageUrlRaw).trim() : '';

  const pinned = entry.pinned === true || entry.pinned === 'true';

  const createdAt = entry.created_at ?? entry.createdAt ?? null;
  const updatedAt = entry.updated_at ?? entry.updatedAt ?? null;

  const commentCountRaw = entry.comment_count ?? entry.commentCount;
  const commentCount = Number.isFinite(Number(commentCountRaw)) ? Number(commentCountRaw) : 0;

  const heartCountRaw = entry.heart_count ?? entry.heartCount;
  const heartCount = Number.isFinite(Number(heartCountRaw)) ? Number(heartCountRaw) : 0;

  return {
    ...entry,
    id,
    announcement_id: id,
    title,
    content,
    imageUrl: imageUrl || null,
    image_url: imageUrl || null,
    pinned,
    createdAt: createdAt ?? null,
    created_at: createdAt ?? null,
    updatedAt: updatedAt ?? null,
    updated_at: updatedAt ?? null,
    heart_count: heartCount,
    heartCount,
    comment_count: commentCount,
    commentCount,
    polls,
  };
}

function serializeAnnouncementPolls(polls) {
  if (!Array.isArray(polls)) {
    return [];
  }

  return polls
    .map((poll, pollIndex) => {
      if (!poll || typeof poll !== 'object') {
        return null;
      }
      const question = typeof poll.question === 'string' ? poll.question.trim() : '';
      if (!question) {
        return null;
      }
      const options = Array.isArray(poll.options)
        ? poll.options
            .map((option, optionIndex) => {
              if (!option || typeof option !== 'object') {
                return null;
              }
              const label = typeof option.label === 'string' ? option.label.trim() : '';
              if (!label) {
                return null;
              }
              return {
                id: option.id || null,
                label,
                position: option.position ?? optionIndex + 1,
              };
            })
            .filter(Boolean)
        : [];

      if (options.length < 2) {
        return null;
      }

      return {
        id: poll.id || null,
        question,
        options,
        position: poll.position ?? pollIndex,
      };
    })
    .filter(Boolean);
}

export async function fetchChatDashboard({ limit = 24 } = {}) {
  const { data, error } = await supabase.rpc('fetch_chat_dashboard', {
    p_limit: Math.max(8, Math.min(limit || 24, 120)),
  });

  if (error) {
    throw error;
  }

  return (
    data || {
      heroes: [],
      rooms: [],
      publicRooms: [],
      sessions: [],
      contacts: [],
    }
  );
}

export async function fetchChatRooms({ search = '', limit = 24 } = {}) {
  const { data, error } = await supabase.rpc('fetch_chat_rooms', {
    p_search: search && search.trim() ? search.trim() : null,
    p_limit: Math.max(5, Math.min(limit || 24, 120)),
  });

  if (error) {
    throw error;
  }

  return data || { joined: [], available: [] };
}

export async function markChatRoomRead({ roomId, messageId = null } = {}) {
  const normalizedRoomId = normalizeUuid(roomId);
  if (!normalizedRoomId) {
    return { ok: false, skipped: true, reason: 'invalid_room_id' };
  }

  const normalizedMessageId = normalizeUuid(messageId);

  const { data, error } = await supabase.rpc('mark_chat_room_read', {
    p_room_id: normalizedRoomId,
    p_message_id: normalizedMessageId,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function createChatRoom(payload) {
  const options = payload || {};
  const name = typeof options.name === 'string' ? options.name.trim() : '';
  if (!name) {
    throw new Error('방 이름을 입력해 주세요.');
  }

  const { data, error } = await supabase.rpc('create_chat_room', {
    p_name: name,
    p_description: typeof options.description === 'string' ? options.description.trim() : '',
    p_visibility: typeof options.visibility === 'string' ? options.visibility.trim() : 'private',
    p_capacity: Number.isFinite(options.capacity) ? options.capacity : 20,
    p_allow_ai: options.allowAi !== false,
    p_require_approval: options.requireApproval === true,
    p_hero_id: options.heroId || null,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function joinChatRoom({ roomId, heroId = null }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('join_chat_room', {
    p_room_id: roomId,
    p_hero_id: heroId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function leaveChatRoom({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('leave_chat_room', {
    p_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  return !!data;
}

export async function deleteChatRoom({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('delete_chat_room', {
    p_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function manageChatRoomRole({
  roomId,
  targetOwnerId,
  action,
  durationMinutes = null,
  reason = null,
}) {
  if (!roomId || !targetOwnerId || !action) {
    throw new Error('roomId, targetOwnerId, action이 필요합니다.');
  }

  const duration = Number.isFinite(durationMinutes)
    ? Math.max(1, Math.floor(durationMinutes))
    : null;

  const { data, error } = await supabase.rpc('manage_chat_room_role', {
    p_room_id: roomId,
    p_target_owner: targetOwnerId,
    p_action: action,
    p_duration_minutes: duration,
    p_reason: typeof reason === 'string' ? reason.trim() || null : null,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function fetchChatRoomBans({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_bans', {
    p_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  return (data?.bans && Array.isArray(data.bans) ? data.bans : []).map(ban => ({
    ...ban,
    expires_at: ban?.expires_at || null,
    owner_name: ban?.owner_name || null,
    owner_email: ban?.owner_email || null,
  }));
}

export async function updateChatRoomBan({
  roomId,
  ownerId,
  durationMinutes = null,
  reason = null,
}) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }
  if (!ownerId) {
    throw new Error('ownerId가 필요합니다.');
  }

  const payload = {
    p_room_id: roomId,
    p_owner_id: ownerId,
    p_duration_minutes:
      durationMinutes === null || durationMinutes === undefined ? null : Number(durationMinutes),
    p_reason: reason ?? null,
  };

  const { data, error } = await supabase.rpc('update_chat_room_ban', payload);

  if (error) {
    throw error;
  }

  return data?.ban || null;
}

export async function fetchChatRoomAnnouncements({ roomId, limit = 20, cursor = null }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_announcements', {
    p_room_id: roomId,
    p_limit: Math.max(5, Math.min(limit || 20, 100)),
    p_cursor: cursor || null,
  });

  if (error) {
    throw error;
  }

  const announcements = Array.isArray(data?.announcements)
    ? data.announcements.map(normalizeAnnouncementEntry).filter(Boolean)
    : [];

  return {
    announcements,
    pinned: data?.pinned ? normalizeAnnouncementEntry(data.pinned) : null,
    hasMore: Boolean(data?.hasMore),
  };
}

export async function fetchChatRoomAnnouncementDetail({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_announcement_detail', {
    p_announcement_id: announcementId,
  });

  if (error) {
    throw error;
  }

  return {
    announcement: data?.announcement ? normalizeAnnouncementEntry(data.announcement) : null,
    comments: Array.isArray(data?.comments) ? data.comments : [],
  };
}

export async function createChatRoomAnnouncement({
  roomId,
  title = '',
  content,
  imageUrl = null,
  pinned = false,
}) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const safeTitle = typeof title === 'string' ? title.trim() : '';
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new Error('공지 내용을 입력해 주세요.');
  }

  const image = typeof imageUrl === 'string' ? imageUrl.trim() : '';

  const { data, error } = await supabase.rpc('create_chat_room_announcement', {
    p_room_id: roomId,
    p_title: safeTitle || null,
    p_content: text,
    p_image_url: image || null,
    p_pinned: pinned === true,
  });

  if (error) {
    throw error;
  }

  return data?.announcement ? normalizeAnnouncementEntry(data.announcement) : null;
}

export async function syncChatRoomAnnouncementPolls({ announcementId, polls }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const payload = serializeAnnouncementPolls(polls);

  const { data, error } = await supabase.rpc('sync_chat_room_announcement_polls', {
    p_announcement_id: announcementId,
    p_polls: payload,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function updateChatRoomAnnouncementPin({ announcementId, pinned }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('update_chat_room_announcement_pin', {
    p_announcement_id: announcementId,
    p_pinned: pinned === true,
  });

  if (error) {
    throw error;
  }

  return data?.announcement || null;
}

export async function deleteChatRoomAnnouncement({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('delete_chat_room_announcement', {
    p_announcement_id: announcementId,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function toggleChatRoomAnnouncementReaction({ announcementId }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('toggle_chat_room_announcement_reaction', {
    p_announcement_id: announcementId,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function createChatRoomAnnouncementComment({ announcementId, content }) {
  if (!announcementId) {
    throw new Error('announcementId가 필요합니다.');
  }

  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new Error('댓글을 입력해 주세요.');
  }

  const { data, error } = await supabase.rpc('create_chat_room_announcement_comment', {
    p_announcement_id: announcementId,
    p_content: text,
  });

  if (error) {
    throw error;
  }

  return data?.comment || null;
}

export async function deleteChatRoomAnnouncementComment({ commentId }) {
  if (!commentId) {
    throw new Error('commentId가 필요합니다.');
  }

  const { error } = await supabase.rpc('delete_chat_room_announcement_comment', {
    p_comment_id: commentId,
  });

  if (error) {
    throw error;
  }

  return { ok: true };
}

export async function voteChatRoomAnnouncementPoll({ pollId, optionId = null }) {
  if (!pollId) {
    throw new Error('pollId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('vote_chat_room_announcement_poll', {
    p_poll_id: pollId,
    p_option_id: optionId || null,
  });

  if (error) {
    throw error;
  }

  return data || { ok: true };
}

export async function fetchChatRoomStats({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('fetch_chat_room_stats', {
    p_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  return data?.stats || {};
}

export async function fetchChatMemberPreferences({ roomId }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('fetch_chat_member_preferences', {
    p_room_id: roomId,
  });

  if (error) {
    throw error;
  }

  return data?.preferences || null;
}

export async function saveChatMemberPreferences({ roomId, preferences = {} }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('upsert_chat_member_preferences', {
    p_room_id: roomId,
    p_preferences: preferences,
  });

  if (error) {
    throw error;
  }

  return data?.preferences || null;
}

export async function updateChatRoomSettings({ roomId, settings = {} }) {
  if (!roomId) {
    throw new Error('roomId가 필요합니다.');
  }

  const { data, error } = await supabase.rpc('update_chat_room_settings', {
    p_room_id: roomId,
    p_settings: settings,
  });

  if (error) {
    throw error;
  }

  return data?.settings || null;
}
