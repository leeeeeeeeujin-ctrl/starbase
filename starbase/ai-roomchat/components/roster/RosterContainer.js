'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'

import { useRoster } from '../../hooks/roster/useRoster'
import { useHeroSocial } from '../../hooks/social/useHeroSocial'
import { SharedChatDockProvider, useSharedChatDock } from '../common/SharedChatDock'
import ChatOverlay from '../social/ChatOverlay'
import FriendOverlay from '../social/FriendOverlay'
import RosterView from './RosterView'

export default function RosterContainer() {
  const router = useRouter()
  const handleUnauthorized = useCallback(() => {
    router.replace('/')
  }, [router])

  const {
    loading,
    error,
    heroes,
    displayName,
    avatarUrl,
    setError,
    deleteHero,
    reload,
  } = useRoster({
    onUnauthorized: handleUnauthorized,
  })

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const social = useHeroSocial({ heroId: null, heroName: null, page: 'roster' })

  const viewerHeroHint = useMemo(() => {
    if (!social.viewer) return null
    return {
      heroId: social.viewer.hero_id,
      heroName: social.viewer.name,
      avatarUrl: social.viewer.avatar_url,
      ownerId: social.viewer.owner_id,
      userId: social.viewer.user_id,
    }
  }, [social.viewer])

  const friendByOwner = useMemo(() => social.friendByOwner ?? new Map(), [social.friendByOwner])
  const friendByHero = useMemo(() => social.friendByHero ?? new Map(), [social.friendByHero])

  const extraWhisperTargets = useMemo(() => {
    if (!social.friends?.length) return []
    const seen = new Set()
    const entries = []
    for (const friend of social.friends) {
      if (friend.currentHeroId && !seen.has(friend.currentHeroId)) {
        entries.push({
          heroId: friend.currentHeroId,
          username: friend.currentHeroName || `${friend.friendHeroName || '친구'} (현재)`,
        })
        seen.add(friend.currentHeroId)
      }
      if (friend.friendHeroId && !seen.has(friend.friendHeroId)) {
        entries.push({ heroId: friend.friendHeroId, username: friend.friendHeroName || '친구' })
        seen.add(friend.friendHeroId)
      }
    }
    return entries
  }, [social.friends])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || deleting) return

    try {
      setDeleting(true)
      await deleteHero(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
      alert(err?.message || '영웅을 삭제하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setDeleting(false)
    }
  }, [deleteHero, deleteTarget, deleting, setDeleteTarget, setDeleting])

  const handleResetError = useCallback(() => {
    setError('')
    reload()
  }, [reload, setError])

  return (
    <SharedChatDockProvider
      heroId={null}
      viewerHero={viewerHeroHint}
      extraWhisperTargets={extraWhisperTargets}
    >
      <RosterContent
        loading={loading}
        error={error}
        heroes={heroes}
        displayName={displayName}
        avatarUrl={avatarUrl}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        deleting={deleting}
        onConfirmDelete={handleConfirmDelete}
        onResetError={handleResetError}
        onLogout={() => router.replace('/')}
        social={social}
        friendByOwner={friendByOwner}
        friendByHero={friendByHero}
        viewerHeroHint={viewerHeroHint}
        extraWhisperTargets={extraWhisperTargets}
      />
    </SharedChatDockProvider>
  )
}

function RosterContent({
  loading,
  error,
  heroes,
  displayName,
  avatarUrl,
  deleteTarget,
  setDeleteTarget,
  deleting,
  onConfirmDelete,
  onResetError,
  onLogout,
  social,
  friendByOwner,
  friendByHero,
  viewerHeroHint,
  extraWhisperTargets,
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const chatOverlayRef = useRef(null)

  const { blockedHeroes, setBlockedHeroes, totalUnread } = useSharedChatDock()
  const blockedHeroSet = useMemo(() => new Set(blockedHeroes || []), [blockedHeroes])

  const isFriendHero = useCallback(
    (hero) => {
      if (!hero) return false
      if (hero.ownerId && friendByOwner.get(hero.ownerId)) return true
      if (hero.heroId && friendByHero.get(hero.heroId)) return true
      return false
    },
    [friendByHero, friendByOwner],
  )

  const handleAddFriendFromChat = useCallback(
    async (hero) => {
      const targetId = hero?.heroId
      if (!targetId) return { ok: false, error: '캐릭터 ID를 확인할 수 없습니다.' }
      if (blockedHeroSet.has(targetId)) {
        return { ok: false, error: '차단한 캐릭터입니다.' }
      }
      return social.addFriend({ heroId: targetId })
    },
    [blockedHeroSet, social],
  )

  const handleRemoveFriendFromChat = useCallback(
    async (hero) => {
      const friend =
        (hero?.ownerId && friendByOwner.get(hero.ownerId)) ||
        (hero?.heroId && friendByHero.get(hero.heroId))
      if (!friend) {
        return { ok: false, error: '친구 목록에서 찾을 수 없습니다.' }
      }
      return social.removeFriend(friend)
    },
    [friendByHero, friendByOwner, social],
  )

  const handleFriendOverlayAdd = useCallback(
    async ({ heroId: targetHeroId }) => social.addFriend({ heroId: targetHeroId }),
    [social],
  )

  const handleOpenWhisper = useCallback((heroId) => {
    if (!heroId) return
    setChatOpen(true)
    chatOverlayRef.current?.openThread(heroId)
  }, [])

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
    chatOverlayRef.current?.resetThread?.()
  }, [])

  const handleToggleBlockedHero = useCallback(
    (heroId) => {
      if (!heroId) return
      setBlockedHeroes((prev) => {
        const prevList = Array.isArray(prev) ? prev : []
        if (prevList.includes(heroId)) {
          return prevList.filter((id) => id !== heroId)
        }
        return [...prevList, heroId]
      })
    },
    [setBlockedHeroes],
  )

  return (
    <>
      <RosterView
        loading={loading}
        error={error}
        heroes={heroes}
        displayName={displayName}
        avatarUrl={avatarUrl}
        deleteTarget={deleteTarget}
        deleting={deleting}
        onRequestDelete={setDeleteTarget}
        onCancelDelete={() => setDeleteTarget(null)}
        onConfirmDelete={onConfirmDelete}
        onLogoutComplete={onLogout}
        onResetError={onResetError}
        onOpenChat={() => setChatOpen(true)}
        onOpenFriends={() => setFriendsOpen(true)}
        chatUnreadCount={totalUnread}
      />
      <ChatOverlay
        ref={chatOverlayRef}
        open={chatOpen}
        onClose={handleCloseChat}
        heroId={null}
        viewerHero={viewerHeroHint}
        extraWhisperTargets={extraWhisperTargets}
        blockedHeroes={blockedHeroes}
        onBlockedHeroesChange={setBlockedHeroes}
        onRequestAddFriend={handleAddFriendFromChat}
        onRequestRemoveFriend={handleRemoveFriendFromChat}
        isFriend={isFriendHero}
      />
      <FriendOverlay
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        viewer={social.viewer}
        friends={social.friends}
        friendRequests={social.friendRequests}
        loading={social.loading}
        error={social.error}
        onAddFriend={handleFriendOverlayAdd}
        onRemoveFriend={social.removeFriend}
        onAcceptRequest={social.acceptFriendRequest}
        onDeclineRequest={social.declineFriendRequest}
        onCancelRequest={social.cancelFriendRequest}
        onOpenWhisper={handleOpenWhisper}
        blockedHeroes={blockedHeroes}
        onToggleBlockedHero={handleToggleBlockedHero}
      />
    </>
  )
}

