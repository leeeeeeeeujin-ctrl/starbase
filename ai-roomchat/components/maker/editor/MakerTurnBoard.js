'use client';

import { useMemo, useState } from 'react';

import MobileTextBattlePlayer from '../../battle/MobileTextBattlePlayer.jsx';
import { parseTurnTemplate } from '../../../lib/battle/turnTemplate.js';

function getTypeLabel(slotType) {
  if (slotType === 'user_action') return '유저 입력';
  if (slotType === 'system') return '시스템';
  return 'AI';
}

function getInputLabel(inputMode) {
  if (!inputMode || inputMode === 'none') return '없음';
  if (inputMode === 'text') return '텍스트';
  if (inputMode === 'choice') return '선택지';
  if (inputMode === 'ability') return '능력';
  if (inputMode === 'target') return '대상';
  return inputMode;
}

function createEdgeLabel(data = {}) {
  const parts = [];
  if (Array.isArray(data.conditions) && data.conditions.length) {
    parts.push(`조건 ${data.conditions.length}개`);
  }
  if (Array.isArray(data.trigger_words) && data.trigger_words.length) {
    parts.push(`입력 ${data.trigger_words.join(', ')}`);
  }
  if (data.fallback) {
    parts.push('기본 분기');
  }
  return parts.join(' · ') || '다음 턴';
}

export default function MakerTurnBoard({
  definition,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onOpenInspector,
  onDeleteNode,
  onMarkAsStart,
  setEdges,
}) {
  const [connectTargets, setConnectTargets] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);

  const orderedNodes = useMemo(() => {
    const list = Array.isArray(nodes) ? [...nodes] : [];
    return list.sort((left, right) => {
      const leftNo = Number(left?.data?.slotNo) || 0;
      const rightNo = Number(right?.data?.slotNo) || 0;
      return leftNo - rightNo;
    });
  }, [nodes]);

  const outgoingMap = useMemo(() => {
    const map = new Map();
    (edges || []).forEach(edge => {
      if (!edge?.source) return;
      const current = map.get(edge.source) || [];
      current.push(edge);
      map.set(edge.source, current);
    });
    return map;
  }, [edges]);

  const handleConnect = sourceId => {
    const targetId = connectTargets[sourceId];
    if (!sourceId || !targetId || sourceId === targetId) return;

    setEdges(current => {
      const next = Array.isArray(current) ? [...current] : [];
      const existingIndex = next.findIndex(
        edge =>
          edge?.source === sourceId &&
          edge?.data?.action === 'continue' &&
          !edge?.data?.fallback
      );
      const nextEdge = {
        id: existingIndex >= 0 ? next[existingIndex].id : `edge_${sourceId}_${targetId}`,
        source: sourceId,
        target: targetId,
        type: 'default',
        animated: false,
        label: '다음 턴',
        data: {
          trigger_words: [],
          conditions: [],
          priority: 0,
          probability: 1,
          fallback: false,
          action: 'continue',
        },
      };

      if (existingIndex >= 0) {
        next[existingIndex] = nextEdge;
      } else {
        next.push(nextEdge);
      }

      return next;
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          borderRadius: 20,
          background: '#0f172a',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 24px 58px -42px rgba(15, 23, 42, 0.82)',
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setPreviewOpen(current => !current)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            background: 'rgba(255,255,255,0.04)',
            color: '#f8fafc',
            borderRadius: 14,
            padding: '10px 12px',
            fontWeight: 700,
          }}
        >
          <span>실행 프리뷰</span>
          <span style={{ fontSize: 12, color: '#93c5fd' }}>{previewOpen ? '접기' : '펼치기'}</span>
        </button>
        {previewOpen ? <MobileTextBattlePlayer definition={definition} /> : null}
      </div>

      <div
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          boxShadow: '0 24px 58px -42px rgba(15, 23, 42, 0.82)',
          display: 'grid',
          gridTemplateRows: 'auto auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 14px 12px',
            borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
            color: '#e2e8f0',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 16 }}>턴 보드</strong>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              카드를 선택해 설정하고, 아래 버튼으로 다음 턴을 연결합니다.
            </span>
          </div>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(59, 130, 246, 0.16)',
              color: '#dbeafe',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {orderedNodes.length}개 턴
          </div>
        </div>

        <div
          style={{
            padding: 12,
            display: 'grid',
            gap: 12,
            alignContent: 'start',
          }}
        >
          {!orderedNodes.length && (
            <div
              style={{
                display: 'grid',
                gap: 8,
                padding: '20px 18px',
                borderRadius: 18,
                background: 'rgba(15, 23, 42, 0.78)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                color: '#e2e8f0',
              }}
            >
              <strong style={{ fontSize: 18 }}>아직 턴이 없습니다</strong>
              <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
                아래 `+` 버튼으로 AI 턴, 유저 입력 턴, 시스템 턴을 추가하면 여기에 카드가 생깁니다.
              </div>
            </div>
          )}

          {orderedNodes.map(node => {
            const nodeData = node?.data || {};
            const parsed = parseTurnTemplate(nodeData.template || '', nodeData.slot_type || 'ai');
            const outgoing = outgoingMap.get(node.id) || [];
            const selected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  borderRadius: 16,
                  background: selected ? 'rgba(30, 41, 59, 0.92)' : 'rgba(15, 23, 42, 0.78)',
                  border: selected
                    ? '1px solid rgba(59, 130, 246, 0.75)'
                    : '1px solid rgba(148, 163, 184, 0.18)',
                  boxShadow: selected
                    ? '0 24px 56px -38px rgba(37, 99, 235, 0.82)'
                    : 'none',
                  color: '#e2e8f0',
                }}
              >
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background:
                            nodeData.slot_type === 'user_action'
                              ? '#0ea5e9'
                              : nodeData.slot_type === 'system'
                                ? '#ef4444'
                                : '#22c55e',
                          color: '#020617',
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {getTypeLabel(nodeData.slot_type)}
                      </span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        #{nodeData.slotNo || '?'}
                      </span>
                      {nodeData.isStart ? (
                        <span style={{ fontSize: 11, color: '#fde68a', fontWeight: 800 }}>시작 턴</span>
                      ) : null}
                    </div>
                    <strong style={{ fontSize: 18, lineHeight: 1.3 }}>
                      {nodeData.name || parsed.meta?.title || '이름 없는 턴'}
                    </strong>
                    <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
                      {parsed.meta?.display || parsed.body || '아직 작성된 안내문이 없습니다.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNode(node);
                        onOpenInspector?.('selection');
                      }}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(148, 163, 184, 0.24)',
                        background: selected ? '#1d4ed8' : 'rgba(255,255,255,0.04)',
                        color: '#f8fafc',
                        fontWeight: 700,
                      }}
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkAsStart?.(node.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(148, 163, 184, 0.24)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#e2e8f0',
                        fontWeight: 700,
                      }}
                    >
                      시작 지정
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNode?.(node.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(248, 113, 113, 0.28)',
                        background: 'rgba(127, 29, 29, 0.18)',
                        color: '#fecaca',
                        fontWeight: 700,
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(148,163,184,0.12)', fontSize: 12, color: '#cbd5e1' }}>
                    입력 {getInputLabel(parsed.meta?.inputMode)}
                  </span>
                  {parsed.meta?.resultKey ? (
                    <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(148,163,184,0.12)', fontSize: 12, color: '#cbd5e1' }}>
                      저장 {parsed.meta.resultKey}
                    </span>
                  ) : null}
                  {Array.isArray(parsed.meta?.participantScope) && parsed.meta.participantScope.length ? (
                    <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(148,163,184,0.12)', fontSize: 12, color: '#cbd5e1' }}>
                      AI {parsed.meta.participantScope.join(', ')}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(2, 6, 23, 0.34)',
                    border: '1px solid rgba(148, 163, 184, 0.14)',
                  }}
                >
                  <strong style={{ fontSize: 13, color: '#f8fafc' }}>다음 턴 연결</strong>
                  {outgoing.length ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {outgoing.map(edge => (
                        <div
                          key={edge.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            alignItems: 'center',
                            fontSize: 12,
                            color: '#cbd5e1',
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: 'rgba(15, 23, 42, 0.56)',
                          }}
                        >
                          <span>{createEdgeLabel(edge.data)}</span>
                          <strong>
                            {orderedNodes.find(entry => entry.id === edge.target)?.data?.name ||
                              orderedNodes.find(entry => entry.id === edge.target)?.data?.slotNo ||
                              edge.target}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>아직 연결된 다음 턴이 없습니다.</div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      name={`connect-target-${node.id}`}
                      value={connectTargets[node.id] || ''}
                      onChange={event =>
                        setConnectTargets(current => ({
                          ...current,
                          [node.id]: event.target.value,
                        }))
                      }
                      style={{
                        flex: '1 1 220px',
                        minWidth: 0,
                        borderRadius: 10,
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        padding: '8px 10px',
                      }}
                    >
                      <option value="">연결할 다음 턴 선택</option>
                      {orderedNodes
                        .filter(target => target.id !== node.id)
                        .map(target => (
                          <option key={target.id} value={target.id}>
                            {target.data?.name || parsed.meta?.title || target.id}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleConnect(node.id)}
                      disabled={!connectTargets[node.id]}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: connectTargets[node.id] ? '#2563eb' : '#475569',
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      연결
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
