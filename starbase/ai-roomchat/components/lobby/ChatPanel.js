import React from 'react'

export default function ChatPanel({
  displayName,
  avatarUrl,
  messages,
  input,
  onInputChange,
  onSend,
  listRef,
}) {
  return (
    <div style={styles.root}>
      <div style={styles.profileRow}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={styles.profileAvatar} />
        ) : (
          <div style={styles.profilePlaceholder} />
        )}
        <div style={styles.profileLabel}>
          <strong style={{ color: '#0f172a' }}>{displayName}</strong>
          <span style={styles.profileCaption}>공용 채팅에 참여 중</span>
        </div>
      </div>
      <div ref={listRef} style={styles.messageList}>
        {messages.map((message) => (
          <div key={message.id} style={styles.messageRow}>
            {message.avatar_url ? (
              <img src={message.avatar_url} alt="" style={styles.messageAvatar} />
            ) : (
              <div style={styles.messageAvatarPlaceholder} />
            )}
            <div>
              <div style={styles.messageHeader}>
                <span style={styles.messageAuthor}>{message.username}</span>
                <span style={styles.messageTime}>{new Date(message.created_at).toLocaleTimeString()}</span>
              </div>
              <p style={styles.messageBody}>{message.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={styles.composerRow}>
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSend()
            }
          }}
          placeholder="메시지를 입력하세요…"
          style={styles.composerInput}
        />
        <button onClick={onSend} style={styles.sendButton}>
          보내기
        </button>
      </div>
    </div>
  )
}

const styles = {
  root: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
    overflow: 'hidden',
  },
  profileRow: {
    padding: '14px 16px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    objectFit: 'cover',
  },
  profilePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#e5e7eb',
  },
  profileLabel: {
    display: 'grid',
  },
  profileCaption: {
    fontSize: 12,
    color: '#64748b',
  },
  messageList: {
    flex: '1 1 auto',
    padding: 14,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  messageRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid #f1f5f9',
  },
  messageAvatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    objectFit: 'cover',
    marginTop: 2,
  },
  messageAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#e5e7eb',
    marginTop: 2,
  },
  messageHeader: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  messageAuthor: {
    fontWeight: 600,
    fontSize: 13,
  },
  messageTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  messageBody: {
    margin: '6px 0 0',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
  },
  composerRow: {
    display: 'flex',
    gap: 10,
    padding: 14,
    borderTop: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  composerInput: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
  },
  sendButton: {
    padding: '12px 18px',
    borderRadius: 12,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    border: 'none',
  },
}
//
