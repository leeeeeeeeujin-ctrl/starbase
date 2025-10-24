'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ProfileActionSheet from '../common/ProfileActionSheet';
import SurfaceOverlay from '../common/SurfaceOverlay';

function friendDisplayName(friend) {
  return (
    friend?.friendHeroName ||
    friend?.currentHeroName ||
    friend?.displayName ||
    friend?.username ||
    '이름 미확인'
  );
}

function friendKey(friend) {
  return (
    friend?.friendOwnerId ||
    friend?.ownerId ||
    friend?.friendHeroId ||
    friend?.currentHeroId ||
    friendDisplayName(friend)
  );
}

function requestDisplayName(request) {
  return request?.partnerHeroName || request?.partnerName || '이름 미확인';
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
  overlayZIndex,
}) {
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState('friends');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [copied, setCopied] = useState(false);

  const incomingRequests = friendRequests?.incoming ?? [];
  const outgoingRequests = friendRequests?.outgoing ?? [];
  const viewerHeroId = viewer?.hero_id || viewer?.heroId || '';

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const sortedFriends = useMemo(() => {
    if (!Array.isArray(friends)) return [];
    return [...friends].sort((a, b) => {
      const aOnline = a?.online ? 1 : 0;
      const bOnline = b?.online ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return friendDisplayName(a).localeCompare(friendDisplayName(b));
    });
  }, [friends]);

  const handleSubmit = useCallback(
    async event => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || typeof onAddFriend !== 'function') return;
      const result = await onAddFriend({ heroId: trimmed });
      if (result?.ok) {
        setInput('');
      } else if (result?.error) {
        alert(result.error);
      }
    },
    [input, onAddFriend]
  );

  const handleRemoveFriend = useCallback(
    async friend => {
      if (typeof onRemoveFriend !== 'function') return;
      const result = await onRemoveFriend(friend);
      if (result?.error) {
        alert(result.error);
      }
    },
    [onRemoveFriend]
  );

  const handleAcceptRequest = useCallback(
    async request => {
      if (typeof onAcceptRequest !== 'function') return;
      const result = await onAcceptRequest(request?.id);
      if (result?.error) {
        alert(result.error);
      }
    },
    [onAcceptRequest]
  );

  const handleDeclineRequest = useCallback(
    async request => {
      if (typeof onDeclineRequest !== 'function') return;
      const result = await onDeclineRequest(request?.id);
      if (result?.error) {
        alert(result.error);
      }
    },
    [onDeclineRequest]
  );

  const handleCancelRequest = useCallback(
    async request => {
      if (typeof onCancelRequest !== 'function') return;
      const result = await onCancelRequest(request?.id);
      if (result?.error) {
        alert(result.error);
      }
    },
    [onCancelRequest]
  );

  const openFriendSheet = useCallback(friend => {
    setSelectedFriend(friend || null);
    setSheetOpen(Boolean(friend));
  }, []);

  const handleCopyViewerHeroId = useCallback(async () => {
    if (!viewerHeroId) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(viewerHeroId);
        setCopied(true);
        return;
      }
    } catch (error) {
      console.error('친구창 캐릭터 ID 복사 실패:', error);
    }
    if (typeof window !== 'undefined') {
      window.prompt('아래 캐릭터 ID를 복사해 주세요.', viewerHeroId);
    }
  }, [viewerHeroId]);

  const closeFriendSheet = useCallback(() => {
    setSheetOpen(false);
    setSelectedFriend(null);
  }, []);

  const sheetHero = useMemo(() => {
    if (!selectedFriend) return null;

    const heroId = selectedFriend.currentHeroId || selectedFriend.friendHeroId;
    const heroName = friendDisplayName(selectedFriend);
    const avatarUrl = selectedFriend.currentHeroAvatar || selectedFriend.friendHeroAvatar || null;

    const viewDetail = () => {
      if (!heroId) return;
      window.open(`/character/${heroId}`, '_blank', 'noopener');
    };

    return {
      heroId,
      heroName,
      avatarUrl,
      isSelf: viewer?.hero_id === heroId,
      isFriend: true,
      onRemoveFriend: () => handleRemoveFriend(selectedFriend),
      onViewDetail: viewDetail,
    };
  }, [handleRemoveFriend, selectedFriend, viewer?.hero_id]);

  const friendSection = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!sortedFriends.length ? <p style={styles.hint}>친구 목록이 비어 있습니다.</p> : null}
      {sortedFriends.map(friend => {
        const heroName = friendDisplayName(friend);
        const status = friend.online ? '온라인' : '오프라인';
        return (
          <div key={friendKey(friend)} style={styles.listItem}>
            <div>
              <p style={styles.listTitle}>{heroName}</p>
              <p style={styles.listMeta}>{status}</p>
            </div>
            <div style={styles.itemActions}>
              <button
                type="button"
                style={styles.ghostButton}
                onClick={() => openFriendSheet(friend)}
              >
                보기
              </button>
              <button
                type="button"
                style={styles.dangerButton}
                onClick={() => handleRemoveFriend(friend)}
              >
                삭제
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const incomingSection = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!incomingRequests.length ? <p style={styles.hint}>받은 친구 요청이 없습니다.</p> : null}
      {incomingRequests.map(request => (
        <div key={request?.id || requestDisplayName(request)} style={styles.listItem}>
          <div>
            <p style={styles.listTitle}>{requestDisplayName(request)}</p>
            <p style={styles.listMeta}>요청 수신</p>
          </div>
          <div style={styles.itemActions}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => handleAcceptRequest(request)}
            >
              수락
            </button>
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => handleDeclineRequest(request)}
            >
              거절
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  const outgoingSection = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!outgoingRequests.length ? <p style={styles.hint}>보낸 친구 요청이 없습니다.</p> : null}
      {outgoingRequests.map(request => (
        <div key={request?.id || requestDisplayName(request)} style={styles.listItem}>
          <div>
            <p style={styles.listTitle}>{requestDisplayName(request)}</p>
            <p style={styles.listMeta}>요청 보냄</p>
          </div>
          <button
            type="button"
            style={styles.ghostButton}
            onClick={() => handleCancelRequest(request)}
          >
            취소
          </button>
        </div>
      ))}
    </div>
  );

  let body = friendSection;
  if (activeTab === 'incoming') {
    body = incomingSection;
  } else if (activeTab === 'outgoing') {
    body = outgoingSection;
  }

  const sheetHeroRemove = sheetHero ? sheetHero.onRemoveFriend : undefined;
  const sheetHeroView = sheetHero ? sheetHero.onViewDetail : undefined;

  return (
    <SurfaceOverlay
      open={open}
      onClose={onClose}
      title="친구 관리"
      width={460}
      contentStyle={{ background: 'transparent', padding: 0 }}
      zIndex={overlayZIndex}
    >
      <div style={styles.container}>
        {viewerHeroId ? (
          <button
            type="button"
            style={styles.viewerIdBadge(copied)}
            onClick={handleCopyViewerHeroId}
          >
            {copied ? '내 캐릭터 ID 복사됨!' : `내 캐릭터 ID: ${viewerHeroId}`}
          </button>
        ) : null}

        <form style={styles.addRow} onSubmit={handleSubmit}>
          <input
            type="text"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="추가할 캐릭터 ID 입력"
            style={styles.input}
          />
          <button type="submit" style={styles.primaryButton} disabled={!input.trim()}>
            친구 추가
          </button>
        </form>

        <div style={styles.tabRow}>
          <button
            type="button"
            style={styles.tabButton(activeTab === 'friends')}
            onClick={() => setActiveTab('friends')}
          >
            친구 목록
          </button>
          <button
            type="button"
            style={styles.tabButton(activeTab === 'incoming')}
            onClick={() => setActiveTab('incoming')}
          >
            받은 요청
          </button>
          <button
            type="button"
            style={styles.tabButton(activeTab === 'outgoing')}
            onClick={() => setActiveTab('outgoing')}
          >
            보낸 요청
          </button>
        </div>

        {loading ? <p style={styles.hint}>친구 정보를 불러오는 중입니다…</p> : null}
        {error ? (
          <p style={{ ...styles.hint, color: '#fca5a5' }} role="alert">
            {error}
          </p>
        ) : null}

        {body}
      </div>

      <ProfileActionSheet
        open={sheetOpen}
        hero={sheetHero}
        onClose={closeFriendSheet}
        onRemoveFriend={sheetHeroRemove}
        onViewDetail={sheetHeroView}
      />
    </SurfaceOverlay>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 20,
    background: 'rgba(15,23,42,0.92)',
    borderRadius: 24,
    border: '1px solid rgba(148,163,184,0.2)',
    color: '#e2e8f0',
  },
  viewerIdBadge: copied => ({
    alignSelf: 'flex-start',
    appearance: 'none',
    borderRadius: 999,
    border: '1px solid rgba(96,165,250,0.5)',
    padding: '6px 14px',
    background: copied ? 'rgba(59,130,246,0.35)' : 'rgba(30,58,138,0.35)',
    color: copied ? '#f8fafc' : '#bfdbfe',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease, color 0.2s ease',
  }),
  addRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: 180,
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.35)',
    background: 'rgba(15,23,42,0.6)',
    color: '#f8fafc',
    fontSize: 14,
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  tabButton: active => ({
    padding: '8px 16px',
    borderRadius: 999,
    border: active ? '1px solid rgba(96,165,250,0.6)' : '1px solid rgba(148,163,184,0.35)',
    background: active ? 'rgba(30,64,175,0.55)' : 'rgba(15,23,42,0.55)',
    color: active ? '#dbeafe' : '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 16,
    background: 'rgba(15,23,42,0.65)',
    border: '1px solid rgba(148,163,184,0.25)',
  },
  listTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#f8fafc',
  },
  listMeta: {
    margin: 0,
    fontSize: 12,
    color: '#94a3b8',
  },
  itemActions: {
    display: 'flex',
    gap: 8,
  },
  primaryButton: {
    appearance: 'none',
    border: 'none',
    borderRadius: 12,
    padding: '8px 14px',
    background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  ghostButton: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.4)',
    borderRadius: 12,
    padding: '8px 14px',
    background: 'rgba(15,23,42,0.55)',
    color: '#e2e8f0',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerButton: {
    appearance: 'none',
    border: '1px solid rgba(248,113,113,0.5)',
    borderRadius: 12,
    padding: '8px 14px',
    background: 'rgba(127,29,29,0.4)',
    color: '#fecaca',
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
  },
};
