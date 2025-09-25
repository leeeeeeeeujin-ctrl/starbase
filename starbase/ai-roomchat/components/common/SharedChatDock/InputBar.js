import React from 'react'

export function InputBar({
  scope,
  setScope,
  whisperTarget,
  setWhisperTarget,
  availableTargets,
  input,
  setInput,
  send,
  canSend,
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: 12,
        borderTop: '1px solid #e5e7eb',
        background: '#fafafa',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #d1d5db' }}
        >
          <option value="global">전체 공개</option>
          <option value="whisper">귓속말</option>
        </select>
        {scope === 'whisper' && (
          <select
            value={whisperTarget || ''}
            onChange={(event) => setWhisperTarget(event.target.value || null)}
            style={{ borderRadius: 8, padding: '8px 10px', border: '1px solid #d1d5db', minWidth: 160 }}
          >
            <option value="">대상 선택</option>
            {availableTargets.map((target) => (
              <option key={target.heroId} value={target.heroId}>
                {target.username}
              </option>
            ))}
          </select>
        )}
      </div>
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            send()
          }
        }}
        placeholder="메시지를 입력…"
        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}
      />
      <button
        onClick={send}
        disabled={!canSend}
        style={{
          padding: '8px 12px',
          borderRadius: 8,
          background: canSend ? '#2563eb' : '#93c5fd',
          color: '#fff',
          cursor: canSend ? 'pointer' : 'not-allowed',
        }}
      >
        보내기
      </button>
    </div>
  )
}

//
