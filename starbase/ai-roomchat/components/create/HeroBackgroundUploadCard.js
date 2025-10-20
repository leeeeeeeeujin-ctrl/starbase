'use client'

import { useRef } from 'react'

export default function HeroBackgroundUploadCard({
  preview,
  error,
  onSelect,
  onReset,
}) {
  const inputRef = useRef(null)

  const handleReset = () => {
    onReset()
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>배경 이미지</div>
      <div
        style={{
          width: '100%',
          borderRadius: 18,
          border: '1px dashed rgba(148, 163, 184, 0.45)',
          background: 'rgba(15, 23, 42, 0.65)',
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt="배경 미리보기"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>배경 이미지를 선택하세요 (움짤 제외)</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            background: '#38bdf8',
            color: '#0f172a',
            fontWeight: 700,
          }}
        >
          배경 업로드
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            background: 'rgba(148, 163, 184, 0.25)',
            color: '#e2e8f0',
            fontWeight: 600,
          }}
        >
          초기화
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(event) => onSelect(event.target.files?.[0] || null)}
        style={{ display: 'none' }}
      />
      {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
    </div>
  )
}

//
