'use client'

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'

import ProfileActionSheet from '../common/ProfileActionSheet'
import SharedChatDock from '../common/SharedChatDock'
import SurfaceOverlay from '../common/SurfaceOverlay'

const ChatOverlay = forwardRef(function ChatOverlay(
  {
    open,
    onClose,
    heroId,
    viewerHero = null,
    extraWhisperTargets = [],
    blockedHeroes,
    onUnreadChange,
    onBlockedHeroesChange,
    onRequestAddFriend,
    onRequestRemoveFriend,
    isFriend,
    onMessageAlert,
  },
  ref,
) {
  const [selectedHero, setSelectedHero] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [externalThread, setExternalThread] = useState('global')

  useImperativeHandle(
    ref,
    () => ({
      openThread: (heroId) => {
        if (!heroId) return
        setExternalThread(heroId)
      },
      resetThread: () => setExternalThread('global'),
    }),
    [],
  )

  useEffect(() => {
    if (!open) {
      setSelectedHero(null)
      setSheetOpen(false)
    }
  }, [open])

  const handleSelectHero = useCallback(
    (hero) => {
      if (!hero) return
      const friend = isFriend?.(hero) ?? false
      setSelectedHero({
        ...hero,
        isFriend: friend,
        blocked: hero.blocked,
      })
      setSheetOpen(true)
    },
    [isFriend],
  )

  const handleCloseSheet = useCallback(() => {
    setSheetOpen(false)
  }, [])

  const handleAddFriend = useCallback(async () => {
    if (!selectedHero || typeof onRequestAddFriend !== 'function') return
    const result = await onRequestAddFriend(selectedHero)
    if (result?.ok) {
      setSelectedHero((prev) => (prev ? { ...prev, isFriend: true } : prev))
      setSheetOpen(false)
    } else if (result?.error) {
      alert(result.error)
    }
  }, [onRequestAddFriend, selectedHero])

  const handleRemoveFriend = useCallback(async () => {
    if (!selectedHero || typeof onRequestRemoveFriend !== 'function') return
    const result = await onRequestRemoveFriend(selectedHero)
    if (result?.ok) {
      setSelectedHero((prev) => (prev ? { ...prev, isFriend: false } : prev))
      setSheetOpen(false)
    } else if (result?.error) {
      alert(result.error)
    }
  }, [onRequestRemoveFriend, selectedHero])

  const handleWhisper = useCallback(() => {
    if (!selectedHero?.heroId) return
    setExternalThread(selectedHero.heroId)
    setSheetOpen(false)
  }, [selectedHero])

  const sheetHero = useMemo(() => {
    if (!selectedHero) return null
    return {
      heroId: selectedHero.heroId,
      heroName: selectedHero.heroName,
      avatarUrl: selectedHero.avatarUrl,
      isSelf: false,
      isFriend: selectedHero.isFriend,
      onAddFriend: selectedHero.isFriend ? undefined : handleAddFriend,
      onRemoveFriend: selectedHero.isFriend ? handleRemoveFriend : undefined,
      onWhisper: handleWhisper,
      onToggleBlock: selectedHero.onToggleBlock,
      blocked: selectedHero.blocked,
      ownerId: selectedHero.ownerId,
      onViewDetail: () => {
        if (!selectedHero.heroId) return
        window.open(`/character/${selectedHero.heroId}`, '_blank', 'noopener')
        setSheetOpen(false)
      },
    }
  }, [handleAddFriend, handleRemoveFriend, handleWhisper, selectedHero])

  return (
    <SurfaceOverlay open={open} onClose={onClose} title="신경망 채널" width={460} contentStyle={{ background: 'transparent', padding: 0 }}>
      <SharedChatDock
        height="min(75vh, 560px)"
        heroId={heroId}
        viewerHero={viewerHero}
        extraWhisperTargets={extraWhisperTargets}
        blockedHeroes={blockedHeroes}
        onSelectHero={handleSelectHero}
        onUnreadChange={onUnreadChange}
        onBlockedHeroesChange={onBlockedHeroesChange}
        activeThreadId={externalThread}
        onThreadChange={setExternalThread}
        onMessageAlert={onMessageAlert}
        pollingEnabled={open}
      />
      <ProfileActionSheet
        open={sheetOpen}
        hero={sheetHero}
        onClose={handleCloseSheet}
        onAddFriend={sheetHero?.onAddFriend}
        onWhisper={sheetHero?.onWhisper}
        onViewDetail={sheetHero?.onViewDetail}
        isFriend={sheetHero?.isFriend}
        onRemoveFriend={sheetHero?.onRemoveFriend}
        blocked={sheetHero?.blocked}
        onToggleBlock={sheetHero?.onToggleBlock}
      />
    </SurfaceOverlay>
  )
})

export default ChatOverlay
