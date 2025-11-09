"use client";

import { useCallback, useMemo } from 'react';
import { useStudioTemplate as useTemplate } from '@/contexts/StudioStore';

export default function ResourceManagerPanel({ onClose }) {
  const { templateText, setTemplateText } = useTemplate();
  const list = useMemo(() => {
    try {
      const obj = JSON.parse(templateText || '{}');
      return Array.isArray(obj?.resources?.files) ? obj.resources.files : [];
    } catch { return []; }
  }, [templateText]);

  const removeLocal = useCallback((keyOrUrl) => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const prev = Array.isArray(obj?.resources?.files) ? obj.resources.files : [];
      const next = prev.filter(it => it && it.key !== keyOrUrl && it.url !== keyOrUrl);
      const out = { ...obj, resources: { ...(obj.resources||{}), files: next } };
      setTemplateText(JSON.stringify(out, null, 2));
    } catch {}
  }, [templateText, setTemplateText]);

  const handleDelete = useCallback(async (item) => {
    if (!item) return;
    try {
      await fetch('/api/storage/delete', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: item.key || null, url: item.url || null })
      });
    } catch {}
    removeLocal(item.key || item.url);
  }, [removeLocal]);

  return (
    <div style={backdrop}>
      <div style={panel}>
        <div style={header}>
          <strong>리소스 관리</strong>
          <button onClick={onClose} style={buttonGhost}>닫기</button>
        </div>
        {list.length === 0 && <div style={{ color: '#64748b', fontSize: 12 }}>등록된 리소스가 없습니다.</div>}
        {list.length > 0 && (
          <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
            {list.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name || it.key || it.url}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{it.mime || it.type} · {fmtBytes(it.size || 0)}</div>
                </div>
                <button onClick={() => handleDelete(it)} style={buttonDanger}>삭제</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={buttonGhost}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const u = ['B','KB','MB','GB'];
  const e = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), u.length-1);
  const v = bytes / 1024**e; return `${v.toFixed(v>=10||e===0?0:1)} ${u[e]}`;
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const panel = { width: 640, maxWidth: '96vw', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 32px rgba(0,0,0,0.2)', padding: 12, display: 'grid', gap: 10 };
const header = { display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const buttonGhost = { padding: '6px 12px', border: '1px solid #e2e8f0', background: '#fff', color: '#111827', borderRadius: 8, cursor: 'pointer' };
const buttonDanger = { padding: '6px 10px', border: '1px solid #fecaca', background: '#fee2e2', color: '#7f1d1d', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
