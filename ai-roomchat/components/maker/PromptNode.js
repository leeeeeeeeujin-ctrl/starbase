import React, { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { parseTurnTemplate } from '../../lib/battle/turnTemplate';

function summarizeText(text, limit = 84, empty = '내용 없음') {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return empty;
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export default function PromptNode({ data, selected }) {
  const slotType = data?.slot_type || 'ai';
  const parsed = useMemo(
    () => parseTurnTemplate(data?.template || '', slotType),
    [data?.template, slotType]
  );
  const meta = parsed.meta || {};
  const isUserNode = meta.executionType === 'user_response' || slotType === 'user_action';
  const title = meta.title || (isUserNode ? '유저 응답' : 'AI 실행');
  const highlightColor = data?.variableHighlightColor || null;
  const cardBorder = highlightColor || (selected ? '#2563eb' : '#334155');
  const displaySummary = summarizeText(meta.display, 72, '설명 없음');
  const bodySummary = summarizeText(parsed.body, 96, '실행 본문 없음');

  return (
    <div
      style={{
        minWidth: 282,
        maxWidth: 304,
        background: '#0f172a',
        border: `1px solid ${cardBorder}`,
        borderRadius: 18,
        color: '#e2e8f0',
        padding: 14,
        boxShadow: selected
          ? '0 22px 44px -28px rgba(37, 99, 235, 0.75)'
          : '0 18px 36px -28px rgba(15, 23, 42, 0.7)',
        outline: highlightColor ? `2px solid ${highlightColor}` : 'none',
        outlineOffset: highlightColor ? 2 : 0,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 12, height: 12, background: '#38bdf8', border: '2px solid #0f172a' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 12, height: 12, background: '#f59e0b', border: '2px solid #0f172a' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: isUserNode ? '#dbeafe' : '#dcfce7',
            color: isUserNode ? '#1d4ed8' : '#166534',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {isUserNode ? '유저 응답' : 'AI 실행'}
        </span>
        {data?.isStart ? (
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 999,
              background: '#fef3c7',
              color: '#92400e',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            시작
          </span>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 16, lineHeight: 1.3 }}>{title}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
            {displaySummary}
          </span>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: '1px solid #1e293b',
            background: '#020617',
            padding: 10,
            fontSize: 12,
            lineHeight: 1.55,
            color: '#cbd5e1',
          }}
        >
          {bodySummary}
        </div>
      </div>
    </div>
  );
}
