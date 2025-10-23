'use client';

import { useCallback } from 'react';

import {
  acceptFriendRequest as acceptFriendRequestRpc,
  cancelFriendRequest as cancelFriendRequestRpc,
  declineFriendRequest as declineFriendRequestRpc,
  deleteFriendshipByOwner,
  requestFriendshipByHero,
} from '../../lib/social/friends';

export function useFriendActions(viewer, refreshSocial) {
  const viewerId = viewer?.user_id;

  const addFriend = useCallback(
    async ({ heroId }) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' };
      }

      try {
        await requestFriendshipByHero({ viewerId, heroId });
        await refreshSocial();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '친구 요청을 보내지 못했습니다.' };
      }
    },
    [refreshSocial, viewerId]
  );

  const removeFriend = useCallback(
    async friend => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' };
      }

      const ownerId = friend?.friendOwnerId || friend?.ownerId;
      if (!ownerId) {
        return { ok: false, error: '친구 정보를 찾을 수 없습니다.' };
      }

      try {
        await deleteFriendshipByOwner({ viewerId, friendOwnerId: ownerId });
        await refreshSocial();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '친구를 삭제하지 못했습니다.' };
      }
    },
    [refreshSocial, viewerId]
  );

  const acceptFriendRequest = useCallback(
    async requestId => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' };
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' };

      try {
        await acceptFriendRequestRpc({ requestId, actorId: viewerId });
        await refreshSocial();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '친구 요청을 수락하지 못했습니다.' };
      }
    },
    [refreshSocial, viewerId]
  );

  const declineFriendRequest = useCallback(
    async requestId => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' };
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' };

      try {
        await declineFriendRequestRpc({ requestId, actorId: viewerId });
        await refreshSocial();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '친구 요청을 거절하지 못했습니다.' };
      }
    },
    [refreshSocial, viewerId]
  );

  const cancelFriendRequest = useCallback(
    async requestId => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' };
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' };

      try {
        await cancelFriendRequestRpc({ requestId, actorId: viewerId });
        await refreshSocial();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error?.message || '친구 요청을 취소하지 못했습니다.' };
      }
    },
    [refreshSocial, viewerId]
  );

  return {
    addFriend,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  };
}
