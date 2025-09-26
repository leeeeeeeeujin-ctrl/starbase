'use client'

import React, { useCallback, useMemo, useState } from 'react'

import ProfileActionSheet from '../common/ProfileActionSheet'
import SurfaceOverlay from '../common/SurfaceOverlay'

function formatPageLabel(page) {
  if (!page) return '현재 위치 미확인'
  if (page.startsWith('character:')) {
    const section = page.split(':')[1]
    if (section === 'game') return '캐릭터 화면 · 게임 찾기'
    if (section === 'ranking') return '캐릭터 화면 · 랭킹'
    return '캐릭터 화면'
  }
  if (page === 'roster') return '로스터'
  if (page === 'maker') return '메이커'
  if (page === 'rank') return '랭킹 허브'
  return page
}

export default function FriendOverlay({
  open,
  onClose,
  viewer,
  friends = [],
  loading,
  error,
  onAddFriend,
  onRemoveFriend,
  onOpenWhisper,
}) {
  const [input, setInput] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      const trimmed = input.trim()
      if (!trimmed) return
      const result = await onAddFriend?.({ heroId: trimmed })
      if (result?.ok) {
        setInput('')
      } else if (result?.error) {
        alert(result.error)
      }
    },
    [input, onAddFriend],
  )

  const handleRemove = useCallback(
    async (friend) => {
      const result = await onRemoveFriend?.(friend)
      if (result?.error) {
        alert(result.error)
      }
    },
    [onRemoveFriend],
  )

  const sheetHero = useMemo(() => {
    if (!selectedFriend) return null
    const heroId = selectedFriend.currentHeroId || selectedFriend.friendHeroId
    return {
      heroId,
      heroName: selectedFriend.currentHeroName || selectedFriend.friendHeroName,
      avatarUrl: selectedFriend.currentHeroAvatar || selectedFriend.friendHeroAvatar,
      isSelf: false,
      isFriend: true,
      onWhisper: () => {
        if (heroId) onOpenWhisper?.(heroId)
        setSheetOpen(false)
      },
      onRemoveFriend: () => handleRemove(selectedFriend),
      onViewDetail: () => {
        if (!heroId) return
        window.open(`/character/${heroId}`, '_blank', 'noopener')
        setSheetOpen(false)
      },
    }
  }, [handleRemove, onOpenWhisper, selectedFriend])

  const sortedFriends = useMemo(() => {
    const copy = [...friends]
    copy.sort((a, b) => {
      if (a.online && !b.online) return -1
      if (!a.online && b.online) return 1
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '')
    })
    return copy
  }, [friends])

  return (
    <SurfaceOverlay open={open} onClose={onClose} title="친구 관리" width={420} contentStyle={{ background: 'transparent', padding: 0 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <section
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            borderRadius: 18,
            border: '1px solid rgba(148,163,184,0.35)',
            padding: '16px 18px',
            color: '#e2e8f0',
            display: 'grid',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 12, color: '#94a3b8' }}>내 캐릭터 ID</span>
          <code style={{ fontSize: 16, fontWeight: 600 }}>{viewer?.hero_id || '선택된 캐릭터 없음'}</code>
        </section>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'grid',
            gap: 10,
            padding: '16px 18px',
            borderRadius: 18,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15, 23, 42, 0.78)',
            color: '#e2e8f0',
          }}
        >
          <label style={{ fontSize: 13, color: '#cbd5f5' }}>
            친구로 추가할 캐릭터 ID
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="예: 00000000-0000-0000-0000-000000000000"
              style={{
                marginTop: 6,
                width: '100%',
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.45)',
                background: 'rgba(15,23,42,0.6)',
                color: '#e2e8f0',
                padding: '10px 12px',
                fontSize: 13,
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              borderRadius: 12,
              border: 'none',
              padding: '10px 14px',
              background: '#38bdf8',
              color: '#020617',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            친구 추가
          </button>
        </form>

        {loading ? (
          <p style={{ color: '#cbd5f5', fontSize: 13 }}>친구 목록을 불러오는 중…</p>
        ) : null}
        {error ? (
          <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {sortedFriends.map((friend) => {
            const heroId = friend.currentHeroId || friend.friendHeroId
            const heroName = friend.currentHeroName || friend.friendHeroName
            return (
              <div
                key={friend.friendOwnerId || heroId}
                style={{
                  border: '1px solid rgba(148,163,184,0.35)',
                  borderRadius: 18,
                  padding: '14px 16px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  color: '#e2e8f0',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ fontSize: 15 }}>{heroName}</strong>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{heroId || 'ID 미확인'}</span>
                  </div>
                  <span style={{ fontSize: 12, color: friend.online ? '#22d3ee' : '#94a3b8' }}>
                    {friend.online ? '온라인' : '오프라인'}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#cbd5f5' }}>{formatPageLabel(friend.currentPage)}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => heroId && onOpenWhisper?.(heroId)}
                    style={{
                      borderRadius: 10,
                      border: 'none',
                      padding: '8px 12px',
                      background: '#38bdf8',
                      color: '#020617',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: heroId ? 'pointer' : 'not-allowed',
                      opacity: heroId ? 1 : 0.4,
                    }}
                  >
                    귓속말
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(friend)}
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(248, 113, 113, 0.6)',
                      padding: '8px 12px',
                      background: 'rgba(248, 113, 113, 0.15)',
                      color: '#fca5a5',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    친구 삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFriend(friend)
                      setSheetOpen(true)
                    }}
                    style={{
                      borderRadius: 10,
                      border: '1px solid rgba(148,163,184,0.45)',
                      padding: '8px 12px',
                      background: 'rgba(15,23,42,0.55)',
                      color: '#cbd5f5',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    상세
                  </button>
                </div>
              </div>
            )
          })}
          {!sortedFriends.length && !loading ? (
            <p style={{ color: '#cbd5f5', fontSize: 13 }}>등록된 친구가 없습니다.</p>
          ) : null}
        </div>
      </div>

      <ProfileActionSheet
        open={sheetOpen}
        hero={sheetHero}
        onClose={() => setSheetOpen(false)}
        onAddFriend={sheetHero?.onAddFriend}
        onWhisper={sheetHero?.onWhisper}
        onViewDetail={sheetHero?.onViewDetail}
        isFriend={sheetHero?.isFriend}
        onRemoveFriend={sheetHero?.onRemoveFriend}
      />
    </SurfaceOverlay>
  )
}
