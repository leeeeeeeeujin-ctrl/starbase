import React, { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { parseTurnTemplate } from '../../lib/battle/turnTemplate';

function summarizePrompt(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '프롬프트 없음';
  return value.length > 84 ? `${value.slice(0, 83)}…` : value;
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
  const actorLabel = meta.actorScope || 'self';
  const saveLabel = meta.resultKey || '-';
  const outputLabel = meta.outputFormat || 'json';
  const cardBorder = selected ? '#2563eb' : '#334155';

  return (
    <div
      style={{
        minWidth: 300,
        maxWidth: 320,
        background: '#0f172a',
        border: `1px solid ${cardBorder}`,
        borderRadius: 18,
        color: '#e2e8f0',
        padding: 14,
        boxShadow: selected
          ? '0 22px 44px -28px rgba(37, 99, 235, 0.75)'
          : '0 18px 36px -28px rgba(15, 23, 42, 0.7)',
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
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
        <div style={{ display: 'grid', gap: 4 }}>
          <strong style={{ fontSize: 16, lineHeight: 1.3 }}>{title}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            {meta.display || '설명 없음'}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <div style={{ background: '#111827', borderRadius: 12, padding: 8, display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>주체</span>
            <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>{actorLabel}</span>
          </div>
          <div style={{ background: '#111827', borderRadius: 12, padding: 8, display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>저장</span>
            <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>{saveLabel}</span>
          </div>
          <div style={{ background: '#111827', borderRadius: 12, padding: 8, display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800 }}>출력</span>
            <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>{outputLabel}</span>
          </div>
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
          {summarizePrompt(parsed.body)}
        </div>
      </div>
    </div>
  );
}
