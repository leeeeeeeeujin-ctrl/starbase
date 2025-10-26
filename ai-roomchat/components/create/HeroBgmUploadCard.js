'use client';

import { useRef } from 'react';

export default function HeroBgmUploadCard({ label, duration, error, onSelect, onReset }) {
  const inputRef = useRef(null);

  const handleReset = () => {
    onReset();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>배경 음악</div>
      <div
        style={{
          borderRadius: 18,
          border: '1px dashed rgba(148, 163, 184, 0.45)',
          background: 'rgba(15, 23, 42, 0.65)',
          padding: '18px 16px',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
          {label || '선택된 파일이 없습니다.'}
        </div>
        <div style={{ fontSize: 12, color: '#cbd5f5' }}>
          MP3 등 스트리밍형 오디오만 지원하며 WAV 형식과 4분을 초과하는 곡은 사용할 수 없습니다.
        </div>
        {duration != null && (
          <div style={{ fontSize: 12, color: '#38bdf8' }}>재생 시간: {duration}초</div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              background: '#fb7185',
              color: '#0f172a',
              fontWeight: 700,
            }}
          >
            배경 음악 업로드
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
            음악 제거
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          onChange={event => onSelect(event.target.files?.[0] || null)}
          style={{ display: 'none' }}
        />
        {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

//
