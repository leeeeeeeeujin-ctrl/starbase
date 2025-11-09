'use client';

import { useRef, useState } from 'react';
import { uploadAsset } from '../../utils/uploader';

export default function HeroImageUploadCard({ preview, onSelect, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
          {busy ? '업로드 중…' : '이미지 업로드'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={event => {
            const file = event.target.files?.[0];
            if (!file) return;
            onSelect?.(file);
            setBusy(true); setError('');
            uploadAsset(file, { gameId: 'characters' })
              .then(res => { onUploaded?.(res); })
              .catch(e => { setError(e?.message || '업로드 실패'); })
              .finally(() => setBusy(false));
          }}
          style={{ display: 'none' }}
        />
        {error ? <span style={{ color:'#fca5a5', fontSize:12 }}>{error}</span> : null}
        <span style={{ fontSize: 12, color: '#cbd5f5' }}>정사각형 이미지가 가장 잘 어울려요.</span>
      </div>
    </div>
  );
}

//
