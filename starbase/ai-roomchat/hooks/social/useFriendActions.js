'use client'

import { useCallback } from 'react'

import { supabase } from '../../lib/supabase'
import { withTable } from '../../lib/supabaseTables'

export function useFriendActions(viewer, refreshSocial) {
  const viewerId = viewer?.user_id

  const addFriend = useCallback(
    async ({ heroId }) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }

      const trimmed = (heroId || '').trim()
      if (!trimmed) return { ok: false, error: '캐릭터 ID를 입력하세요.' }

      const { data: hero, error: heroError } = await withTable(supabase, 'heroes', (table) =>
        supabase
          .from(table)
          .select('id,name,image_url,owner_id')
          .eq('id', trimmed)
          .single(),
      )

      if (heroError || !hero) {
        return { ok: false, error: '해당 캐릭터를 찾을 수 없습니다.' }
      }

      if (hero.owner_id === viewerId) {
        return { ok: false, error: '자신의 캐릭터는 친구로 추가할 수 없습니다.' }
      }

      const { error: requestError } = await withTable(supabase, 'friend_requests', (table) =>
        supabase
          .from(table)
          .insert({
            requester_id: viewerId,
            addressee_id: hero.owner_id,
            status: 'pending',
            message: null,
          })
          .select('id')
          .single(),
      )

      if (requestError) {
        const message =
          requestError.code === '23505'
            ? '이미 대기 중인 친구 요청이 있습니다.'
            : requestError.message || '친구 요청을 보내지 못했습니다.'
        return { ok: false, error: message }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewerId],
  )

  const removeFriend = useCallback(
    async (friend) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }

      const ownerId = friend?.friendOwnerId || friend?.ownerId
      if (!ownerId) {
        return { ok: false, error: '친구 정보를 찾을 수 없습니다.' }
      }

      const { error: deleteError } = await withTable(supabase, 'friendships', (table) =>
        supabase
          .from(table)
          .delete()
          .or(
            `and(user_id_a.eq.${viewerId},user_id_b.eq.${ownerId}),and(user_id_a.eq.${ownerId},user_id_b.eq.${viewerId})`,
          ),
      )

      if (deleteError) {
        return { ok: false, error: deleteError.message || '친구를 삭제하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewerId],
  )

  const acceptFriendRequest = useCallback(
    async (requestId) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('accept_friend_request', {
        p_request_id: requestId,
        p_actor: viewerId,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 수락하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewerId],
  )

  const declineFriendRequest = useCallback(
    async (requestId) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('decline_friend_request', {
        p_request_id: requestId,
        p_actor: viewerId,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 거절하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewerId],
  )

  const cancelFriendRequest = useCallback(
    async (requestId) => {
      if (!viewerId) {
        return { ok: false, error: '로그인이 필요합니다.' }
      }
      if (!requestId) return { ok: false, error: '요청 정보를 찾을 수 없습니다.' }

      const { error: rpcError } = await supabase.rpc('cancel_friend_request', {
        p_request_id: requestId,
        p_actor: viewerId,
      })

      if (rpcError) {
        return { ok: false, error: rpcError.message || '친구 요청을 취소하지 못했습니다.' }
      }

      await refreshSocial()
      return { ok: true }
    },
    [refreshSocial, viewerId],
  )

  return {
    addFriend,
    removeFriend,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
  }
}
