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
  friendRequests = { incoming: [], outgoing: [] },
  loading,
  error,
  onAddFriend,
  onRemoveFriend,
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
  onOpenWhisper,
  blockedHeroes = [],
  onToggleBlockedHero,
}) {
  const [input, setInput] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [activeTab, setActiveTab] = useState('friends')

  const incomingRequests = friendRequests?.incoming ?? []
  const outgoingRequests = friendRequests?.outgoing ?? []
  const blockedHeroSet = useMemo(
    () => new Set((blockedHeroes || []).filter(Boolean)),
    [blockedHeroes],
  )

  const heroMetaMap = useMemo(() => {
    const map = new Map()
    for (const friend of friends) {
      if (friend.currentHeroId) {
        map.set(friend.currentHeroId, {
          name: friend.currentHeroName || friend.friendHeroName || '이름 미확인',
          avatar: friend.currentHeroAvatar || friend.friendHeroAvatar || null,
        })
      }
      if (friend.friendHeroId) {
        map.set(friend.friendHeroId, {
          name: friend.friendHeroName || friend.currentHeroName || '이름 미확인',
          avatar: friend.friendHeroAvatar || friend.currentHeroAvatar || null,
        })
      }
    }
    for (const request of incomingRequests) {
      if (request.partnerHeroId) {
        map.set(request.partnerHeroId, {
          name: request.partnerHeroName || '이름 미확인',
          avatar: request.partnerHeroAvatar || null,
        })
      }
    }
    for (const request of outgoingRequests) {
      if (request.partnerHeroId) {
        map.set(request.partnerHeroId, {
          name: request.partnerHeroName || '이름 미확인',
          avatar: request.partnerHeroAvatar || null,
        })
      }
    }
    return map
  }, [friends, incomingRequests, outgoingRequests])

  const blockedEntries = useMemo(() => {
    if (!blockedHeroes?.length) return []
    return blockedHeroes
      .filter(Boolean)
      .map((heroId) => {
        const meta = heroMetaMap.get(heroId) || {}
        return {
          heroId,
          heroName: meta.name || '이름 미확인',
          avatarUrl: meta.avatar || null,
        }
      })
  }, [blockedHeroes, heroMetaMap])

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

  const handleAcceptRequest = useCallback(
    async (request) => {
      if (!request?.id) return
      const result = await onAcceptRequest?.(request.id)
      if (result?.error) {
        alert(result.error)
      }
    },
    [onAcceptRequest],
  )

  const handleDeclineRequest = useCallback(
    async (request) => {
      if (!request?.id) return
      const result = await onDeclineRequest?.(request.id)
      if (result?.error) {
        alert(result.error)
      }
    },
    [onDeclineRequest],
  )

  const handleCancelRequest = useCallback(
    async (request) => {
      if (!request?.id) return
      const result = await onCancelRequest?.(request.id)
      if (result?.error) {
        alert(result.error)
      }
    },
    [onCancelRequest],
  )

  const handleToggleBlockedHero = useCallback(
    async (heroId) => {
      if (!heroId || typeof onToggleBlockedHero !== 'function') return
      const result = await onToggleBlockedHero(heroId)
      if (result?.error) {
        alert(result.error)
      }
    },
    [onToggleBlockedHero],
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
      blocked: heroId ? blockedHeroSet.has(heroId) : false,
      onToggleBlock: heroId ? () => handleToggleBlockedHero(heroId) : undefined,
      onViewDetail: () => {
        if (!heroId) return
        window.open(`/character/${heroId}`, '_blank', 'noopener')
        setSheetOpen(false)
      },
    }
  }, [blockedHeroSet, handleRemove, handleToggleBlockedHero, onOpenWhisper, selectedFriend])

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
    <SurfaceOverlay
      open={open}
      onClose={onClose}
      title="친구 관리"
      width={420}
      contentStyle={{ background: 'transparent', padding: 0 }}
    >
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

        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 4px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            style={{
              flex: 1,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.4)',
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'friends' ? 'rgba(56,189,248,0.16)' : 'rgba(15,23,42,0.7)',
              color: activeTab === 'friends' ? '#e0f2fe' : '#cbd5f5',
            }}
          >
            친구 목록
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            style={{
              flex: 1,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.4)',
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'requests' ? 'rgba(56,189,248,0.16)' : 'rgba(15,23,42,0.7)',
              color: activeTab === 'requests' ? '#e0f2fe' : '#cbd5f5',
            }}
          >
            친구 요청
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blocked')}
            style={{
              flex: 1,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.4)',
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'blocked' ? 'rgba(248,113,113,0.18)' : 'rgba(15,23,42,0.7)',
              color: activeTab === 'blocked' ? '#fecaca' : '#fca5a5',
            }}
          >
            차단 목록
          </button>
        </div>

        {loading ? <p style={{ color: '#cbd5f5', fontSize: 13 }}>친구 정보를 불러오는 중…</p> : null}
        {error ? <p style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p> : null}

        {activeTab === 'friends' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {sortedFriends.map((friend) => {
              const heroId = friend.currentHeroId || friend.friendHeroId
              const heroName = friend.currentHeroName || friend.friendHeroName
              const heroBlocked = heroId ? blockedHeroSet.has(heroId) : false
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 15 }}>{heroName}</strong>
                        {heroBlocked ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#fecaca',
                              background: 'rgba(248,113,113,0.25)',
                              borderRadius: 999,
                              padding: '2px 8px',
                              fontWeight: 600,
                            }}
                          >
                            차단됨
                          </span>
                        ) : null}
                      </div>
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
        ) : activeTab === 'requests' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <section
              style={{
                display: 'grid',
                gap: 12,
                border: '1px solid rgba(148,163,184,0.35)',
                borderRadius: 18,
                padding: '14px 16px',
                background: 'rgba(15, 23, 42, 0.7)',
                color: '#e2e8f0',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>받은 친구 요청</strong>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{incomingRequests.length}건</span>
              </header>
              <div style={{ display: 'grid', gap: 12 }}>
                {incomingRequests.map((request) => (
                  <article
                    key={request.id}
                    style={{
                      border: '1px solid rgba(148,163,184,0.35)',
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: 'rgba(15,23,42,0.6)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <strong style={{ fontSize: 14 }}>{request.partnerHeroName}</strong>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{request.partnerHeroId || 'ID 미확인'}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#f8fafc' }}>대기 중</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleAcceptRequest(request)}
                        style={{
                          borderRadius: 10,
                          border: 'none',
                          padding: '8px 12px',
                          background: '#4ade80',
                          color: '#022c22',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineRequest(request)}
                        style={{
                          borderRadius: 10,
                          border: '1px solid rgba(248,113,113,0.6)',
                          padding: '8px 12px',
                          background: 'transparent',
                          color: '#fca5a5',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        거절
                      </button>
                    </div>
                  </article>
                ))}
                {incomingRequests.length === 0 ? (
                  <p style={{ color: '#cbd5f5', fontSize: 13 }}>받은 친구 요청이 없습니다.</p>
                ) : null}
              </div>
            </section>

            <section
              style={{
                display: 'grid',
                gap: 12,
                border: '1px solid rgba(148,163,184,0.35)',
                borderRadius: 18,
                padding: '14px 16px',
                background: 'rgba(15, 23, 42, 0.7)',
                color: '#e2e8f0',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>보낸 친구 요청</strong>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{outgoingRequests.length}건</span>
              </header>
              <div style={{ display: 'grid', gap: 12 }}>
                {outgoingRequests.map((request) => (
                  <article
                    key={request.id}
                    style={{
                      border: '1px solid rgba(148,163,184,0.35)',
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: 'rgba(15,23,42,0.6)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <strong style={{ fontSize: 14 }}>{request.partnerHeroName}</strong>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{request.partnerHeroId || 'ID 미확인'}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#f8fafc' }}>대기 중</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelRequest(request)}
                      style={{
                        borderRadius: 10,
                        border: '1px solid rgba(148,163,184,0.6)',
                        padding: '8px 12px',
                        background: 'transparent',
                        color: '#cbd5f5',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        justifySelf: 'flex-start',
                      }}
                    >
                      요청 취소
                    </button>
                  </article>
                ))}
                {outgoingRequests.length === 0 ? (
                  <p style={{ color: '#cbd5f5', fontSize: 13 }}>보낸 친구 요청이 없습니다.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {blockedEntries.map((entry) => (
              <div
                key={entry.heroId}
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
                    <strong style={{ fontSize: 15 }}>{entry.heroName}</strong>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{entry.heroId}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#fca5a5' }}>차단됨</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleBlockedHero(entry.heroId)}
                    style={{
                      borderRadius: 10,
                      border: 'none',
                      padding: '8px 12px',
                      background: '#fca5a5',
                      color: '#021626',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    차단 해제
                  </button>
                </div>
              </div>
            ))}
            {!blockedEntries.length ? (
              <p style={{ color: '#fca5a5', fontSize: 13 }}>차단한 캐릭터가 없습니다.</p>
            ) : null}
          </div>
        )}
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
        blocked={sheetHero?.blocked}
        onToggleBlock={sheetHero?.onToggleBlock}
      />
    </SurfaceOverlay>
  )
}
