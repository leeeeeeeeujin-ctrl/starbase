// components/maker/PromptNode.js
import { useMemo } from 'react';
import { Handle, Position } from 'reactflow';

export default function PromptNode({ id, data, selected }) {
  const d = data || {};

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

  const sphereStyle = useMemo(() => {
    const baseGlow = isStart
      ? 'radial-gradient(circle at 48% 42%, rgba(224,231,255,0.96) 0%, rgba(196,181,253,0.82) 32%, rgba(109,40,217,0.62) 68%, rgba(15,23,42,0.92) 100%)'
      : 'radial-gradient(circle at 50% 44%, rgba(248,250,252,0.96) 0%, rgba(236,233,254,0.74) 30%, rgba(148,163,184,0.38) 66%, rgba(15,23,42,0.92) 100%)';

    const highlightShadow = selected
      ? '0 0 0 6px rgba(253, 224, 71, 0.45), 0 28px 60px -24px rgba(15, 23, 42, 0.82)'
      : isInvisible
        ? '0 0 0 4px rgba(248, 250, 252, 0.55), 0 20px 48px -30px rgba(15, 23, 42, 0.78)'
        : '0 24px 52px -32px rgba(15, 23, 42, 0.75)';

    const borderColor = selected
      ? '1px solid rgba(252, 211, 77, 0.75)'
      : isInvisible
        ? '2px dashed rgba(251, 191, 36, 0.85)'
        : '1px solid rgba(148, 163, 184, 0.45)';

    return {
      width: 92,
      height: 92,
      borderRadius: '50%',
      background: baseGlow,
      boxShadow: highlightShadow,
      border: borderColor,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      transition: 'transform 140ms ease, box-shadow 140ms ease, border 140ms ease',
      transform: selected ? 'scale(1.06)' : 'scale(1)',
    };
  }, [isInvisible, isStart, selected]);

  const coreGlowStyle = useMemo(
    () => ({
      position: 'absolute',
      inset: selected ? 6 : 8,
      borderRadius: '50%',
      background: isStart ? 'rgba(129, 140, 248, 0.42)' : 'rgba(148, 163, 184, 0.32)',
      filter: 'blur(0.75px)',
      transition: 'inset 140ms ease, background 140ms ease',
    }),
    [isStart, selected]
  );

  const starColor = selected ? '#fef08a' : '#f8fafc';

  return (
    <div
      style={{
        minWidth: 140,
        maxWidth: 180,
        padding: '12px 8px',
        display: 'grid',
        justifyItems: 'center',
        alignItems: 'center',
        gap: 10,
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
      <div style={sphereStyle}>
        <div style={coreGlowStyle} />
        <span
          style={{
            fontSize: 34,
            color: starColor,
            lineHeight: 1,
            textShadow: selected
              ? '0 0 14px rgba(253,224,71,0.6), 0 6px 18px rgba(15,23,42,0.85)'
              : '0 4px 12px rgba(15,23,42,0.85)',
            transition: 'color 120ms ease, text-shadow 140ms ease',
          }}
        >
          ★
        </span>
      </div>

      <div style={{ display: 'grid', gap: 4, textAlign: 'center' }}>
        {slotLabel && (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              background: '#1d4ed8',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {slotLabel}
          </span>
        )}
        <span style={{ fontSize: 12, color: '#cbd5f5', fontWeight: 600 }}>{typeLabel}</span>
        {isInvisible && (
          <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>숨김</span>
        )}
      </div>
    </div>
  );
}
