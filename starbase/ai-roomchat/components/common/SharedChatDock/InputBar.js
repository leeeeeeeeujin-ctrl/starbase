import React from 'react'

export function InputBar({
  scope,
  activeThreadMeta,
  onResetThread,
  input,
  setInput,
  send,
  canSend,
}) {
  const isWhisper = scope === 'whisper'
  const label = isWhisper
    ? activeThreadMeta?.label || '귓속말 대상 선택 필요'
    : '전체 대화'

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '16px 12px',
        borderTop: '1px solid #e5e7eb',
        background: '#fafafa',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        color: '#0f172a',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          minWidth: 0,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: isWhisper ? '#0ea5e9' : '#475569',
            fontSize: 12,
            fontWeight: 600,
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {isWhisper ? '귓속말' : '전체'}
          <span
            style={{
              fontWeight: 500,
              color: isWhisper ? '#0284c7' : '#64748b',
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        </span>
        {isWhisper && typeof onResetThread === 'function' ? (
          <button
            type="button"
            onClick={onResetThread}
            style={{
              borderRadius: 8,
              padding: '6px 10px',
              border: '1px solid #94a3b8',
              background: '#f8fafc',
              color: '#475569',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            전체로 전환
          </button>
        ) : null}
      </div>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            send()
          }
        }}
        placeholder="메시지를 입력…"
        rows={2}
        style={{
          flex: 1,
          minHeight: 56,
          maxHeight: 140,
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: '10px 12px',
          lineHeight: 1.5,
          resize: 'vertical',
          color: '#0f172a',
          background: '#fff',
        }}
      />
      <button
        onClick={send}
        disabled={!canSend}
        style={{
          padding: '10px 16px',
          borderRadius: 10,
          background: canSend ? '#2563eb' : '#93c5fd',
          color: '#fff',
          cursor: canSend ? 'pointer' : 'not-allowed',
          minHeight: 44,
        }}
      >
        보내기
      </button>
    </div>
  )
}

//
