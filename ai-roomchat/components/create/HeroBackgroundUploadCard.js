'use client';

import { useRef, useState } from 'react';
import { uploadAsset } from '../../utils/uploader';

export default function HeroBackgroundUploadCard({ preview, error, onSelect, onReset, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleReset = () => {
    onReset();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

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
          <span style={{ color: '#94a3b8', fontSize: 13 }}>
            배경 이미지를 선택하세요 (움짤 제외)
          </span>
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
          {busy ? '업로드 중…' : '배경 업로드'}
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
        onChange={async event => {
          const file = event.target.files?.[0] || null;
          onSelect?.(file);
          if (!file) return;
          setBusy(true); setErr('');
          try {
            const res = await uploadAsset(file, { gameId: 'backgrounds' });
            onUploaded?.(res);
          } catch (e) { setErr(e?.message || '업로드 실패'); }
          finally { setBusy(false); }
        }}
        style={{ display: 'none' }}
      />
      {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
      {err && <div style={{ color: '#fca5a5', fontSize: 12 }}>{err}</div>}
    </div>
  );
}

//
