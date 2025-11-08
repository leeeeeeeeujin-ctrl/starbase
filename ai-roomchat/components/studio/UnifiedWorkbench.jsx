"use client";

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { useStudioTemplate } from '../../contexts/StudioStore';
import { emit } from '../../contexts/StudioBus';

// Reuse existing studio panels (client-only)
const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
const NodesEditor = dynamic(() => import('./NodesEditor'), { ssr: false });
const VariablesPanel = dynamic(() => import('./VariablesPanel'), { ssr: false });
const AIPanel = dynamic(() => import('./AIPanel'), { ssr: false });
const RunnerPanel = dynamic(() => import('./RunnerPanel'), { ssr: false });
const ImageUiPanel = dynamic(() => import('./ImageUiPanel'), { ssr: false });
const BlockCodingPanel = dynamic(() => import('./BlockCodingPanel'), { ssr: false });

export default function UnifiedWorkbench() {
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const fileInputRef = useRef(null);
  const [showImageUi, setShowImageUi] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const info = useMemo(() => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
      const edges = Array.isArray(obj.edges) ? obj.edges : [];
      return { ok: true, nodes: nodes.length, edges: edges.length };
    } catch (e) {
      return { ok: false, error: e?.message || 'Invalid JSON' };
    }
  }, [templateText]);

  const switcher = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {[
        ['nodes', '프롬프트·노드'],
        ['blocks', '블록코딩'],
        ['code', '코드 에디터'],
        ['test', '테스트'],
      ].map(([id, label]) => {
        const active = (mode || 'nodes') === id;
        return (
          <button
            key={id}
            onClick={() => setMode(id)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.35)',
              background: active ? 'rgba(59,130,246,0.25)' : 'transparent',
              color: active ? '#0f172a' : '#0f172a',
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8, height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {switcher}
          <div style={{ fontSize: 12, color: info.ok ? '#059669' : '#b91c1c' }}>
            {info.ok ? `nodes: ${info.nodes}, edges: ${info.edges}` : `JSON 오류: ${info.error}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setToolsOpen(v => !v)}
              style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}
            >
              도구
            </button>
            {toolsOpen && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 6, display: 'grid', gap: 6, minWidth: 200, zIndex: 20 }}>
                <button onClick={() => setShowImageUi(true)} style={{ textAlign: 'left', padding: 6 }}>이미지로 UI 생성</button>
                <button onClick={() => setShowBlocks(true)} style={{ textAlign: 'left', padding: 6 }}>블록코딩</button>
                <button onClick={() => fileInputRef.current?.click()} style={{ textAlign: 'left', padding: 6 }}>Import JSON</button>
                <button onClick={() => {
                  const blob = new Blob([templateText || '{}'], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'template.json'; a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                }} style={{ textAlign: 'left', padding: 6 }}>Export JSON</button>
                <VariablesPanel />
                <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const text = await f.text();
                  try { JSON.parse(text); setTemplateText(text); } catch {}
                  e.target.value = '';
                }} />
              </div>
            )}
          </div>

          <button
            onClick={() => emit('studio:ai:toggle')}
            title="AI 패널"
            style={{ width: 36, height: 36, borderRadius: 18, border: '1px solid #cbd5e1', background: '#fff' }}
          >▶
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ position: 'relative', minHeight: 0 }}>
        {mode === 'code' && (
          <div style={{ height: '100%' }}>
            <CodeEditor value={templateText} onChange={setTemplateText} />
            <div style={{ position: 'absolute', right: 12, bottom: 12 }}>
              <RunnerPanel />
            </div>
          </div>
        )}
        {mode === 'nodes' && <NodesEditor />}
        {mode === 'test' && (
          <div style={{ position: 'absolute', right: 12, bottom: 12 }}>
            <RunnerPanel />
          </div>
        )}
      </div>

      {/* Floating/Slide panels */}
      <AIPanel />
      {showImageUi && <ImageUiPanel onClose={() => setShowImageUi(false)} />}
      {showBlocks && <BlockCodingPanel onClose={() => setShowBlocks(false)} />}
    </div>
  );
}

