// components/maker/PromptNode.js
import React, { useMemo, useRef } from 'react';
import { Handle, Position } from 'reactflow';
import { parseTurnTemplate } from '../../lib/battle/turnTemplate';

export default function PromptNode({ id, data, selected }) {
  const d = data || {};
  const nameInputRef = useRef(null);

  const slotLabel = useMemo(() => {
    if (!d.slotNo) return null;
    return `#${d.slotNo}`;
  }, [d.slotNo]);

  const typeLabel = useMemo(() => {
    if (!d.slot_type) return 'AI';
    if (d.slot_type === 'user_action') return '유저';
    if (d.slot_type === 'system') return '시스템';
    return 'AI';
  }, [d.slot_type]);

  const isInvisible = !!d.invisible;
  const isStart = !!d.isStart;

  // Card styles replacing the old sphere/star icon
  const cardStyle = useMemo(() => {
    const border = selected
      ? '1px solid rgba(37, 99, 235, 0.85)'
      : '1px solid rgba(148, 163, 184, 0.45)';
    const shadow = selected
      ? '0 14px 36px -20px rgba(29, 78, 216, 0.55)'
      : '0 16px 40px -26px rgba(15, 23, 42, 0.65)';
    const bg = '#0b1220';
    return {
      width: 220,
      maxWidth: 260,
      borderRadius: 14,
      background: bg,
      border,
      boxShadow: shadow,
      display: 'grid',
      gridTemplateRows: 'auto auto 1fr',
      gap: 8,
      padding: 10,
      color: '#e2e8f0',
      transition: 'transform 140ms ease, box-shadow 140ms ease, border 140ms ease',
      transform: selected ? 'translateY(-1px)' : 'none',
    };
  }, [selected]);

  const previewText = useMemo(() => {
    const { meta, body } = parseTurnTemplate(d.template ?? d.label ?? '', d.slot_type || 'ai');
    const src = (meta?.display || body || d.label || '').toString();
    const trimmed = src.replace(/\s+/g, ' ').trim();
    if (!trimmed) return '';
    const max = 120;
    return trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed;
  }, [d.template, d.label]);

  const typeBadgeStyle = useMemo(() => ({
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    color: '#0b1220',
    background: d.slot_type === 'user_action' ? '#93c5fd' : d.slot_type === 'system' ? '#fca5a5' : '#86efac'
  }), [d.slot_type]);

  const visibilityLabel = useMemo(() => {
    const { meta } = parseTurnTemplate(d.template ?? d.label ?? '', d.slot_type || 'ai');
    const scope = Array.isArray(meta?.visibilityScope) ? meta.visibilityScope : [];
    if (!scope.length || (scope.length === 1 && scope[0] === 'all')) return null;
    return `공개 ${scope.join(', ')}`;
  }, [d.label, d.slot_type, d.template]);

  const stopDrag = (e) => { e.stopPropagation(); };
  const onNameChange = (e) => {
    const val = e.target.value || '';
    try { d.onChange?.({ name: val }); } catch {}
  };

  return (
    <div
      style={{
        minWidth: 240,
        padding: 6,
        display: 'grid',
        justifyItems: 'center',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        touchAction: 'none',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#38bdf8',
          border: '3px solid #0f172a',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#f97316',
          border: '3px solid #0f172a',
        }}
      />
      <div style={cardStyle}>
        {/* Top row: badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={typeBadgeStyle}>{typeLabel}</span>
          {slotLabel && (
            <span style={{ padding: '2px 6px', borderRadius: 999, background: 'rgba(148,163,184,0.25)', color: '#e2e8f0', fontSize: 11, fontWeight: 700 }}>{slotLabel}</span>
          )}
          {visibilityLabel && (
            <span style={{ padding: '2px 6px', borderRadius: 999, background: 'rgba(191,219,254,0.15)', color: '#bfdbfe', fontSize: 10, fontWeight: 700 }}>
              {visibilityLabel}
            </span>
          )}
          {isStart && (
            <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 999, background: '#fde68a', color: '#7c2d12', fontSize: 10, fontWeight: 900 }}>시작</span>
          )}
          {isInvisible && (
            <span style={{ marginLeft: isStart ? 6 : 'auto', padding: '2px 8px', borderRadius: 999, background: 'rgba(251,191,36,0.18)', color: '#fbbf24', fontSize: 10, fontWeight: 800 }}>숨김</span>
          )}
        </div>
        {/* Name input */}
        <input
          ref={nameInputRef}
          defaultValue={d.name || d.title || ''}
          onPointerDown={stopDrag}
          onMouseDown={stopDrag}
          onTouchStart={stopDrag}
          onDoubleClick={stopDrag}
          onChange={onNameChange}
          placeholder={isStart ? '시작 노드 (초기화 전용)' : '이름 없음'}
          spellCheck={false}
          disabled={isStart}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '6px 8px',
            borderRadius: 10,
            border: '1px solid #334155',
            background: isStart ? '#1e293b' : '#0b1220',
            color: isStart ? '#64748b' : '#e2e8f0',
            fontSize: 12,
            fontWeight: 700,
            outline: 'none',
            cursor: isStart ? 'not-allowed' : 'text',
          }}
          aria-label="노드 이름"
        />
        {/* Preview content */}
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(2,6,23,0.5)',
            borderRadius: 10,
            padding: 8,
            minHeight: 48,
            maxHeight: 120,
            overflow: 'hidden',
            color: '#cbd5e1',
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'normal',
          }}
          title={previewText}
        >
          {previewText || <span style={{ color: '#64748b' }}>내용 없음</span>}
        </div>
      </div>
    </div>
  );
}
