// components/common/ProfileActionSheet.js
'use client'

export default function ProfileActionSheet({
  open,
  hero,
  onClose,
  onAddFriend,
  onWhisper,
  onViewDetail,
  isFriend,
  onRemoveFriend,
  blocked,
  onToggleBlock,
}) {
  if (!open || !hero) return null

  const { heroId, heroName, avatarUrl, isSelf } = hero
  const displayName = heroName || '이름 없는 영웅'

  function handleAction(action) {
    if (typeof action === 'function') {
      action(hero)
    }
    if (typeof onClose === 'function') {
      onClose()
    }
  }

  const disabledLabel = isSelf ? '자신의 캐릭터입니다.' : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        background: 'rgba(2, 6, 23, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 24,
          border: '1px solid rgba(148, 163, 184, 0.45)',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: 20,
          display: 'grid',
          gap: 16,
          color: '#e2e8f0',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.55)',
              flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                }}
              >
                🛰️
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 18 }}>{displayName}</strong>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>ID: {heroId}</span>
          </div>
        </header>

        {isSelf ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{disabledLabel}</div>
        ) : null}

        <div style={{ display: 'grid', gap: 10 }}>
          {isFriend ? (
            <button
              type="button"
              onClick={() => handleAction(onRemoveFriend)}
              disabled={isSelf || typeof onRemoveFriend !== 'function'}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(248, 113, 113, 0.55)',
                background: isSelf ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 113, 113, 0.18)',
                color: '#fecaca',
                fontWeight: 600,
                cursor: isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              친구 삭제
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleAction(onAddFriend)}
              disabled={isSelf || typeof onAddFriend !== 'function'}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: isSelf ? 'rgba(15, 23, 42, 0.4)' : 'rgba(56, 189, 248, 0.18)',
                color: '#bae6fd',
                fontWeight: 600,
                cursor: isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              친구 추가
            </button>
          )}

          <button
            type="button"
            onClick={() => handleAction(onWhisper)}
            disabled={isSelf || typeof onWhisper !== 'function'}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: isSelf ? 'rgba(15, 23, 42, 0.4)' : '#38bdf8',
              color: '#020617',
              fontWeight: 700,
              cursor: isSelf ? 'not-allowed' : 'pointer',
            }}
          >
            귓속말 보내기
          </button>

          <button
            type="button"
            onClick={() => handleAction(onViewDetail)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(148, 163, 184, 0.45)',
              background: 'rgba(15, 23, 42, 0.45)',
              color: '#e2e8f0',
              fontWeight: 600,
            }}
          >
            세부 정보 보기
          </button>

          {!isSelf && typeof onToggleBlock === 'function' ? (
            <button
              type="button"
              onClick={() => handleAction(onToggleBlock)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(239, 68, 68, 0.45)',
                background: blocked ? 'rgba(239,68,68,0.2)' : 'rgba(15,23,42,0.45)',
                color: blocked ? '#fecaca' : '#ef4444',
                fontWeight: 600,
              }}
            >
              {blocked ? '차단 해제' : '차단하기'}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: 'none',
            background: 'rgba(15, 23, 42, 0.6)',
            color: '#cbd5f5',
            fontSize: 13,
          }}
        >
          닫기
        </button>
      </div>
    </div>
  )
}

//
