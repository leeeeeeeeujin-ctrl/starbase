'use client'

import { useRef } from 'react'

export default function HeroImageUploadCard({ preview, onSelect }) {
  const inputRef = useRef(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div
        style={{
          width: 260,
          height: 260,
          borderRadius: 32,
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(15, 23, 42, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt="미리보기"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 13 }}>이미지를 선택하세요</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '10px 20px',
            borderRadius: 999,
            background: '#38bdf8',
            color: '#0f172a',
            fontWeight: 700,
          }}
        >
          이미지 업로드
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              onSelect(file)
            }
          }}
          style={{ display: 'none' }}
        />
        <span style={{ fontSize: 12, color: '#cbd5f5' }}>정사각형 이미지가 가장 잘 어울려요.</span>
      </div>
    </div>
  )
}

//
