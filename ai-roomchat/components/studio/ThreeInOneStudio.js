import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useStudioTemplate } from '../../contexts/StudioStore';
import { emit, subscribe } from '../../contexts/StudioBus';
import useIsMobile from '../../utils/useIsMobile';

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
const ResourceUploadPanel = dynamic(() => import('./ResourceUploadPanel'), { ssr: false });
const ResourceManagerPanel = dynamic(() => import('./ResourceManagerPanel'), { ssr: false });
const PlayOverlay = dynamic(() => import('./PlayOverlay.jsx'), { ssr: false });

export default function ThreeInOneStudio() {
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const fileInputRef = useRef(null);
  const isMobile = useIsMobile(820);

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
  const [showResourceUpload, setShowResourceUpload] = useState(false);
  const [showResourceManager, setShowResourceManager] = useState(false);
  const [stagedCount, setStagedCount] = useState(0);
  const [showPlay, setShowPlay] = useState(false);

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
  const RIGHT_GUTTER = isMobile ? 0 : (16 + 420 + 16); // panel right margin + width + inner gap (no gutter on mobile)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Full-bleed
        width: '100vw',
        marginLeft: isMobile ? 0 : 'calc(50% - 50vw)',
        marginRight: isMobile ? 0 : 'calc(50% - 50vw)',
        // Viewport fill
        minHeight: '100svh',
        // Safe-area paddings for mobile
        paddingTop: isMobile ? 'env(safe-area-inset-top)' : 0,
        paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom) + 8px)' : 0,
        // Keep internal UI (headers/content) within visible area left of the AI panel
        paddingRight: RIGHT_GUTTER,
        // Prevent any child from expanding the container due to intrinsic width
        maxWidth: '100vw',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: isMobile ? '10px 12px' : 8,
          borderBottom: '1px solid #eee',
          alignItems: 'center',
          // Single row with horizontal scroll
          flexWrap: 'nowrap',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          // Sticky on mobile for full-screen app feel
          position: isMobile ? 'sticky' : 'relative',
          top: isMobile ? 0 : 'auto',
          zIndex: isMobile ? 9 : 'auto',
          background: isMobile ? '#ffffff' : 'transparent',
          maxHeight: 48,
        }}
      >
  <button onClick={() => setMode(mode === 'code' ? 'nodes' : 'code')} style={{ padding: isMobile ? '6px 10px' : undefined }}>{mode === 'code' ? '프롬프트' : '코드'}</button>
  <button onClick={() => setMode('ui')} style={{ padding: isMobile ? '6px 10px' : undefined }} disabled={mode==='ui'}>UI</button>
  <button onClick={() => setShowPlay(true)} title="메인게임 오버레이 미리보기" style={{ padding: isMobile ? '6px 10px' : undefined }}>플레이(오버레이)</button>
        <span style={{ flex: 1 }} />
        {!isMobile && <UndoRedoBar />}
        {!isMobile && <QuickActions />}
        {!isMobile && <button onClick={() => setShowImageUi(true)}>이미지로 UI 생성</button>}
        {!isMobile && <button onClick={() => setShowBlocks(true)}>블록코딩</button>}
        {/* Resource staging & management */}
        <button onClick={() => setShowResourceUpload(true)} style={{ padding: isMobile ? '6px 10px' : undefined }}>리소스 추가</button>
        <button onClick={async () => {
          // commit staged -> upload
          try {
            const { commitStaged, listStaged } = await import('@/utils/resourceStaging');
            const setId = (() => {
              try { const u = new URL(window.location.href); return u.searchParams.get('setId') || u.searchParams.get('pset') || null; } catch { return null; }
            })();
            const res = await commitStaged({ getTemplateText: () => templateText, setTemplateText, setId });
            try { const ls = await listStaged(); setStagedCount(ls.length); } catch {}
            if (res?.uploaded > 0) {
              // brief success hint (non-blocking)
              console.info(`[staging] committed ${res.uploaded} file(s)`);
            }
          } catch (e) { console.warn('[staging] commit failed', e); }
        }} style={{ padding: isMobile ? '6px 10px' : undefined }}>저장(업로드)</button>
        {stagedCount > 0 && (
          <span style={{ fontSize: 11, color: '#475569' }}>대기 {stagedCount}</span>
        )}
        <button onClick={() => setShowResourceManager(true)} style={{ padding: isMobile ? '6px 10px' : undefined }}>리소스 관리</button>
        <button onClick={() => fileInputRef.current?.click()} style={{ padding: isMobile ? '6px 10px' : undefined }}>Import</button>
        <button onClick={() => {
          const blob = new Blob([templateText || '{}'], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'template.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }} style={{ padding: isMobile ? '6px 10px' : undefined }}>Export</button>
        <button onClick={async () => {
          try {
            const text = templateText || '{}';
            const blob = new Blob([text], { type: 'application/json' });
            const file = new File([blob], 'template.json', { type: 'application/json' });
            const { uploadAsset } = await import('@/utils/uploader');
            const res = await uploadAsset(file, { gameId: 'studio', key: `games/templates/${Date.now()}-template.json` });
            console.info('[publish] template uploaded', res);
            let msg = `퍼블리시 완료\nKey: ${res.key}\nURL: ${res.url}`;
            try {
              // Create a stateless play id based on the published URL (prod-safe)
              const r = await fetch('/api/game/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: res.url }) });
              if (r.ok) {
                const data = await r.json();
                if (data?.id) {
                  msg += `\n\n플레이 링크: /game/play/${data.id}`;
                }
              }
            } catch {}
            msg += `\n모바일 뷰어: /game/mobile?tpl=${encodeURIComponent(res.url)}`;
            alert(msg);
          } catch (e) {
            alert('퍼블리시에 실패했습니다: ' + (e?.message || e));
          }
        }} style={{ padding: isMobile ? '6px 10px' : undefined }}>퍼블리시(실험)</button>
        {!isMobile && <VariablesPanel />}
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          try { JSON.parse(text); setTemplateText(text); } catch { /* ignore invalid */ }
          e.target.value = '';
        }} />
      </div>

      <div style={{ padding: '4px 8px', borderBottom: '1px solid #f2f2f2', fontSize: 12, color: info.ok ? '#2d7' : '#d33', display: 'flex', gap: 12, alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
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

      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position:'relative', overflow: 'hidden' }}>
        {mode === 'code' && (
          <div style={{ height: '100%', position:'relative', minWidth: 0, overflow: 'hidden' }}>
            {!isMobile && (
              <div style={{ position:'absolute', left:8, top:'50%', transform:'translate(0, -50%)', zIndex:5 }}>
                <button title="AI 코딩" onClick={() => emit('studio:ai:toggle')}>{'<'}</button>
              </div>
            )}
            <div style={{ position:'absolute', inset:0, minWidth: 0, overflow:'hidden' }}>
              <CodeEditor value={templateText} onChange={setTemplateText} />
            </div>
            {!isMobile && (
              <div style={{ position:'absolute', right: 12, bottom: 12 }}>
                <RunnerPanel />
              </div>
            )}
          </div>
        )}
  {mode === 'nodes' && <NodesEditor />}
  {mode === 'ui' && <UIEditor />}
      </div>

      {/* Floating panels */}
      <AIPanel />
  {showPlay && <PlayOverlay onClose={() => setShowPlay(false)} />}
      {showImageUi && <ImageUiPanel onClose={() => setShowImageUi(false)} />}
      {showBlocks && <BlockCodingPanel onClose={() => setShowBlocks(false)} />}
      {showResourceUpload && (
        <ResourceUploadPanel onClose={async () => {
          setShowResourceUpload(false);
          try {
            const { listStaged } = await import('@/utils/resourceStaging');
            const ls = await listStaged(); setStagedCount(ls.length);
          } catch {}
        }} />
      )}
      {showResourceManager && <ResourceManagerPanel onClose={() => setShowResourceManager(false)} />}
    </div>
  );
}
