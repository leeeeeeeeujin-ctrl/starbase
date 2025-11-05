"use client";

import { useCallback, useMemo, useRef, useState } from 'react';
import { useStudioTemplate as useTemplate } from '@/contexts/StudioStore';
import { uploadAsset } from '@/utils/uploader';

export default function ResourceUploadPanel({ onClose }) {
  const { templateText, setTemplateText } = useTemplate();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = useCallback(() => inputRef.current?.click(), []);

  const onFiles = useCallback(async (fileList) => {
    const arr = Array.from(fileList || []);
    setFiles(arr);
  }, []);

  const compressIfNeeded = useCallback(async (file) => {
    try {
      const mod = await import('@/lib/client/media/compress');
      if (file.type.startsWith('image/') && !/gif/i.test(file.type) && mod?.compressImage) {
        const out = await mod.compressImage(file, {});
        if (out && out.size > 0) return out;
      }
      if (file.type.startsWith('video/') && mod?.compressVideo) {
        const out = await mod.compressVideo(file, { format: 'mp4' });
        if (out && out.size > 0) return out;
      }
      if (file.type.startsWith('audio/') && mod?.compressAudio) {
        const out = await mod.compressAudio(file, {});
        if (out && out.size > 0) return out;
      }
    } catch {}
    return file;
  }, []);

  const addToTemplate = useCallback((items) => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const now = new Date().toISOString();
      const prev = obj.resources && Array.isArray(obj.resources.files) ? obj.resources.files : [];
      const next = {
        ...obj,
        resources: {
          ...(obj.resources || {}),
          files: [
            ...prev,
            ...items.map(it => ({
              id: it.id,
              name: it.name,
              type: it.type,
              url: it.url,
              key: it.key,
              hash: it.hash,
              mime: it.mime,
              size: it.size,
              uploadedAt: now,
            })),
          ],
        },
      };
      setTemplateText(JSON.stringify(next, null, 2));
    } catch (e) {
      setError(String(e?.message || e));
    }
  }, [templateText, setTemplateText]);

  const doUpload = useCallback(async () => {
    if (!files.length) return;
    setBusy(true); setError('');
    try {
      const results = [];
      for (const f of files) {
        const compressed = await compressIfNeeded(f);
        const keyFolder = 'studio/resources';
        const res = await uploadAsset(compressed, { gameId: 'studio', key: `${keyFolder}/${Date.now()}-${safeName(compressed.name || 'file')}` });
        results.push({
          id: `res_${Math.random().toString(36).slice(2,8)}`,
          name: compressed.name || f.name,
          type: classifyType(compressed.type || f.type || 'application/octet-stream'),
          url: res.url,
          key: res.key,
          hash: res.hash,
          mime: compressed.type || f.type || 'application/octet-stream',
          size: compressed.size || f.size || 0,
        });
      }
      addToTemplate(results);
      onClose?.();
    } catch (e) {
      // uploader will raise a global quota notice; we also show a local error
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [files, addToTemplate, compressIfNeeded, onClose]);

  const hint = useMemo(() => {
    return '이미지/오디오/비디오/기타 파일을 업로드하면 template.resources.files에 추가됩니다.';
  }, []);

  return (
    <div style={backdrop}>
      <div style={panel}>
        <div style={header}>
          <strong>리소스 업로드</strong>
          <button onClick={onClose} style={buttonGhost}>닫기</button>
        </div>
        <div style={{ fontSize: 12, color: '#475569' }}>{hint}</div>
        <div
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          style={drop}
        >
          <div>파일을 여기로 드래그하거나</div>
          <button onClick={pick} style={button}>파일 선택</button>
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={e => onFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>
        {files.length > 0 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, maxHeight: 180, overflow: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span title={f.name}>{truncate(f.name, 48)}</span>
                <span style={{ color: '#64748b' }}>{fmtBytes(f.size)} · {f.type || 'file'}</span>
              </div>
            ))}
          </div>
        )}
        {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={buttonGhost}>취소</button>
          <button onClick={doUpload} disabled={!files.length || busy} style={button}>
            {busy ? '업로드 중…' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
}

function classifyType(mime) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
}

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const e = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** e;
  return `${v.toFixed(v >= 10 || e === 0 ? 0 : 1)} ${units[e]}`;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.3)'
};
const panel = {
  width: 520, maxWidth: '96vw', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,0.2)',
  padding: 12, display: 'grid', gap: 10
};
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const drop = { display: 'grid', placeItems: 'center', gap: 8, border: '1px dashed #cbd5e1', padding: 16, borderRadius: 10, background: '#f8fafc', color: '#334155' };
const button = { padding: '6px 12px', border: '1px solid #93c5fd', background: '#dbeafe', color: '#111827', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
const buttonGhost = { padding: '6px 12px', border: '1px solid #e2e8f0', background: '#fff', color: '#111827', borderRadius: 8, cursor: 'pointer' };
