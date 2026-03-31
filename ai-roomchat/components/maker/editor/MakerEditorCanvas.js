'use client';

import { useEffect, useRef } from 'react';
import ReactFlow, { Background, Controls, MiniMap, Panel } from 'reactflow';
import 'reactflow/dist/style.css';

import PromptNode from '../PromptNode';

const nodeTypes = { prompt: PromptNode };

export default function MakerEditorCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
  onPaneClick,
  onSelectionChange,
  onNodesDelete,
  onEdgesDelete,
}) {
  const hasNodes = Array.isArray(nodes) && nodes.length > 0;
  const flowRef = useRef(null);
  const previousNodeCountRef = useRef(Array.isArray(nodes) ? nodes.length : 0);

  useEffect(() => {
    const currentCount = Array.isArray(nodes) ? nodes.length : 0;
    const previousCount = previousNodeCountRef.current;
    previousNodeCountRef.current = currentCount;

    if (!flowRef.current) return;
    if (currentCount <= 0) return;
    if (currentCount === previousCount) return;

    const timeoutId = window.setTimeout(() => {
      try {
        flowRef.current.fitView({
          padding: 0.28,
          duration: 420,
          maxZoom: 1.15,
        });
      } catch {}
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [nodes]);

  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 520,
        background: '#0b1120',
        borderRadius: 18,
        boxShadow: '0 20px 45px -36px rgba(15, 23, 42, 0.6)',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        position: 'relative',
      }}
    >
      {!hasNodes && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 'min(440px, calc(100% - 32px))',
              display: 'grid',
              gap: 10,
              padding: '22px 24px',
              borderRadius: 20,
              background: 'rgba(15, 23, 42, 0.86)',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              color: '#e2e8f0',
              boxShadow: '0 30px 80px -40px rgba(15, 23, 42, 0.95)',
            }}
          >
            <strong style={{ fontSize: 22, lineHeight: 1.2 }}>여기에 턴 그래프를 만듭니다</strong>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
              아래 `+` 버튼으로 AI 턴, 유저 입력 턴, 시스템 턴을 추가하면 이 영역에 바로 카드가 생깁니다.
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#94a3b8' }}>
              <div>1. 턴 추가</div>
              <div>2. 카드 선택 후 세부 설정 편집</div>
              <div>3. 카드끼리 연결해 분기와 순서를 구성</div>
            </div>
          </div>
        </div>
      )}

      <ReactFlow
        onInit={instance => {
          flowRef.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        fitView
        minZoom={0.1}
        maxZoom={2.4}
        zoomOnPinch
        zoomOnScroll
        panOnScroll
        panOnDrag
        selectionOnDrag
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        fitViewOptions={{ padding: 0.24, duration: 400 }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      >
        <Panel position="top-left">
          <div
            style={{
              display: 'grid',
              gap: 8,
              minWidth: 250,
              maxWidth: 320,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 16,
                background: 'rgba(2, 6, 23, 0.86)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                color: '#e2e8f0',
                boxShadow: '0 18px 44px -28px rgba(15, 23, 42, 0.9)',
              }}
            >
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14 }}>배틀 그래프</strong>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>턴 카드와 분기 흐름을 이 영역에서 직접 다룹니다.</span>
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
                {nodes?.length || 0} / {edges?.length || 0}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 4,
                padding: '10px 12px',
                borderRadius: 14,
                background: 'rgba(15, 23, 42, 0.78)',
                border: '1px solid rgba(59, 130, 246, 0.18)',
                color: '#cbd5e1',
                fontSize: 12,
                lineHeight: 1.55,
              }}
            >
              <div>1. 아래 `+` 버튼으로 턴 추가</div>
              <div>2. 카드를 드래그해 위치 조정</div>
              <div>3. 카드 옆 핸들로 다음 턴 연결</div>
            </div>
          </div>
        </Panel>

        <Panel position="bottom-center">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
              padding: '10px 14px',
              borderRadius: 999,
              background: 'rgba(2, 6, 23, 0.82)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              color: '#cbd5e1',
              boxShadow: '0 18px 40px -28px rgba(15, 23, 42, 0.92)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>캔버스 작업</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>드래그 이동</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>휠 확대/축소</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>더블클릭 편집</span>
          </div>
        </Panel>

        <MiniMap
          pannable
          zoomable
          style={{ background: '#0f172a', width: 136, height: 92, right: 8, bottom: 8, borderRadius: 12 }}
          maskColor="rgba(15,23,42,0.85)"
        />
        <Controls style={{ background: 'rgba(15,23,42,0.82)', borderRadius: 14, border: '1px solid rgba(148,163,184,0.18)' }} />
        <Background color="#1e293b" gap={26} size={1.5} />
      </ReactFlow>
    </div>
  );
}
