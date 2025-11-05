import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useStudioTemplate } from '../../contexts/StudioStore';
import { emit, subscribe } from '../../contexts/StudioBus';

// Client-only editors and panels
const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
const NodesEditor = dynamic(() => import('./NodesEditor'), { ssr: false });
const UIEditor = dynamic(() => import('./UIEditor'), { ssr: false });
const VariablesPanel = dynamic(() => import('./VariablesPanel'), { ssr: false });
const AIPanel = dynamic(() => import('./AIPanel'), { ssr: false });
const UndoRedoBar = dynamic(() => import('./UndoRedoBar'), { ssr: false });
const RunnerPanel = dynamic(() => import('./RunnerPanel'), { ssr: false });
const QuickActions = dynamic(() => import('./QuickActions'), { ssr: false });
const ImageUiPanel = dynamic(() => import('./ImageUiPanel'), { ssr: false });
const BlockCodingPanel = dynamic(() => import('./BlockCodingPanel'), { ssr: false });

export default function ThreeInOneStudio() {
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const fileInputRef = useRef(null);

  const info = useMemo(() => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const errors = [];
      const issues = [];
      const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
      const edges = Array.isArray(obj.edges) ? obj.edges : [];
      const ids = new Set();
      nodes.forEach((n, i) => {
        if (n?.id && ids.has(n.id)) errors.push(`nodes[${i}]: id 중복(${n.id})`);
        if (n?.id) ids.add(n.id);
      });
      nodes.forEach((n, i) => {
        if (!n || !n.id) { errors.push(`nodes[${i}]: id 누락`); issues.push({ type: 'node', index: i, id: n?.id, message: 'id 누락' }); }
        const p = n?.position;
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') { errors.push(`nodes[${i}]: position.x/y 누락`); issues.push({ type: 'node', index: i, id: n?.id, message: 'position.x/y 누락' }); }
      });
      edges.forEach((e, i) => {
        if (!e || !e.id) { errors.push(`edges[${i}]: id 누락`); issues.push({ type: 'edge', index: i, id: e?.id, message: 'id 누락' }); }
        if (!ids.has(e?.source)) { errors.push(`edges[${i}]: source 미존재`); issues.push({ type: 'edge', index: i, id: e?.id, message: 'source 미존재' }); }
        if (!ids.has(e?.target)) { errors.push(`edges[${i}]: target 미존재`); issues.push({ type: 'edge', index: i, id: e?.id, message: 'target 미존재' }); }
      });
      const res = obj.resources || {};
      ['characters', 'skills', 'items', 'music', 'backgrounds', 'custom'].forEach(key => {
        if (res[key] && !Array.isArray(res[key])) { errors.push(`resources.${key} 은 배열이어야 함`); issues.push({ type: 'resource', id: key, message: '배열 아님' }); }
      });
      return { ok: errors.length === 0, nodes: nodes.length, edges: edges.length, resources: obj.resources ? Object.keys(obj.resources).length : 0, errors, issues };
    } catch (e) {
      return { ok: false, error: String(e.message || e), errors: [], issues: [] };
    }
  }, [templateText]);

  const [showIssues, setShowIssues] = useState(false);
  const [showImageUi, setShowImageUi] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);

  // External event hooks (allow header or other UIs to control this editor)
  useEffect(() => {
    const off1 = subscribe('studio:mode:toggle', () => setMode(m => (m === 'code' ? 'nodes' : 'code')));
    const off2 = subscribe('studio:open:image', () => setShowImageUi(true));
    const off3 = subscribe('studio:open:blocks', () => setShowBlocks(true));
    const off4 = subscribe('studio:import', () => fileInputRef.current?.click());
    return () => {
      off1?.(); off2?.(); off3?.(); off4?.();
    };
  }, [setMode]);

  // Reserve a safe right gutter so content (toolbar/editor) does not extend under the AI panel's close button area.
  const RIGHT_GUTTER = 16 + 420 + 16; // panel right margin + width + inner gap
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Ensure full-bleed horizontally to screen edges even if a parent has max-width constraints
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        // Ensure the workbench fills the viewport vertically
        minHeight: '100vh',
        // Keep internal UI (headers/content) within visible area left of the AI panel
        paddingRight: RIGHT_GUTTER,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 8,
          borderBottom: '1px solid #eee',
          alignItems: 'center',
          // Keep toolbar in a single row; if items overflow, allow horizontal scroll instead of wrapping
          flexWrap: 'nowrap',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          // Prevent the toolbar from increasing overall layout height when content grows
          maxHeight: 48,
        }}
      >
        <button onClick={() => setMode(mode === 'code' ? 'nodes' : 'code')}>{mode === 'code' ? '프롬프트 편집으로' : '코드 편집으로'}</button>
        <span style={{ flex: 1 }} />
        <UndoRedoBar />
        <QuickActions />
        <button onClick={() => setShowImageUi(true)}>이미지로 UI 생성</button>
        <button onClick={() => setShowBlocks(true)}>블록코딩</button>
        <button onClick={() => fileInputRef.current?.click()}>Import JSON</button>
        <button onClick={() => {
          const blob = new Blob([templateText || '{}'], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'template.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }}>Export JSON</button>
        <VariablesPanel />
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          try { JSON.parse(text); setTemplateText(text); } catch { /* ignore invalid */ }
          e.target.value = '';
        }} />
      </div>

  <div style={{ padding: '4px 8px', borderBottom: '1px solid #f2f2f2', fontSize: 12, color: info.ok ? '#2d7' : '#d33', display: 'flex', gap: 12, alignItems: 'center', overflow: 'hidden' }}>
        <div>
          {info.ok ? `Valid JSON • nodes: ${info.nodes}, edges: ${info.edges}, resource groups: ${info.resources}` : `Invalid JSON: ${info.error}`}
          {!info.ok && info.errors?.length === 0 ? null : (
            info.errors?.length > 0 ? ` • ${info.errors.length} validation issue(s)` : null
          )}
        </div>
        {info.errors?.length > 0 && (
          <button style={{ marginLeft: 'auto' }} onClick={() => setShowIssues(v => !v)}>{showIssues ? '숨기기' : '이슈 보기'}</button>
        )}
      </div>

      {showIssues && info.errors?.length > 0 && (
        <div style={{ padding: 8, borderBottom: '1px solid #eee', background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>검증 이슈</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {info.issues.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div>{it.type}[{it.index}]: {it.message}</div>
                <button onClick={() => { setMode('nodes'); emit('studio:focus', it); }}>이동</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position:'relative' }}>
        {mode === 'code' && (
          <div style={{ height: '100%', position:'relative' }}>
            <div style={{ position:'absolute', left:8, top:'50%', transform:'translate(0, -50%)', zIndex:5 }}>
              <button title="AI 코딩" onClick={() => emit('studio:ai:toggle')}>{'<'}</button>
            </div>
            <CodeEditor value={templateText} onChange={setTemplateText} />
            <div style={{ position:'absolute', right: 12, bottom: 12 }}>
              <RunnerPanel />
            </div>
          </div>
        )}
        {mode === 'nodes' && <NodesEditor />}
      </div>

      {/* Floating panels */}
      <AIPanel />
      {showImageUi && <ImageUiPanel onClose={() => setShowImageUi(false)} />}
      {showBlocks && <BlockCodingPanel onClose={() => setShowBlocks(false)} />}
    </div>
  );
}
