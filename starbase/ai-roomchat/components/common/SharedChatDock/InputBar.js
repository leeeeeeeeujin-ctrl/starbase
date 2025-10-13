import React from 'react'

export function InputBar({
  scope,
  setScope,
  scopeOptions = [],
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
        padding: '16px 12px',
        borderTop: '1px solid #e5e7eb',
        background: '#fafafa',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        color: '#0f172a',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          style={{
            borderRadius: 8,
            padding: '8px 10px',
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#0f172a',
          }}
        >
          {(scopeOptions.length
            ? scopeOptions
            : [
                { value: 'global', label: '전체 공개', disabled: false },
                { value: 'whisper', label: '귓속말', disabled: false },
              ]
          ).map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {scope === 'whisper' && (
          <select
            value={whisperTarget || ''}
            onChange={(event) => setWhisperTarget(event.target.value || null)}
            style={{
              borderRadius: 8,
              padding: '8px 10px',
              border: '1px solid #d1d5db',
              minWidth: 160,
              background: '#fff',
              color: '#0f172a',
            }}
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
