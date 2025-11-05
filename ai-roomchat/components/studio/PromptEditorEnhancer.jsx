import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import StudioPersistentProvider, { } from '../../contexts/StudioPersistentProvider.jsx';
import { useStudioTemplate } from '../../contexts/StudioStore';
import { emit } from '../../contexts/StudioBus';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
const AIPanel = dynamic(() => import('./AIPanel'), { ssr: false });
const RunnerPanel = dynamic(() => import('./RunnerPanel'), { ssr: false });
const ImageUiPanel = dynamic(() => import('./ImageUiPanel'), { ssr: false });
const BlockCodingPanel = dynamic(() => import('./BlockCodingPanel'), { ssr: false });

function Inner({ children, externalText, onExternalChange }){
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const fileInputRef = useRef(null);
  const [showImageUi, setShowImageUi] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [showPlay, setShowPlay] = useState(false);

  // Bridge external prop/state if provided
  useEffect(() => {
    if (typeof externalText === 'string' && externalText !== templateText) {
      setTemplateText(externalText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalText]);
  useEffect(() => {
    if (typeof onExternalChange === 'function') onExternalChange(templateText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateText]);

  const info = useMemo(() => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const nodes = Array.isArray(obj.nodes) ? obj.nodes.length : 0;
      const edges = Array.isArray(obj.edges) ? obj.edges.length : 0;
      const resources = obj.resources ? Object.keys(obj.resources).length : 0;
      return { ok: true, nodes, edges, resources };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }, [templateText]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', position:'relative' }}>
      <div style={{ display:'flex', gap:8, padding:8, borderBottom:'1px solid #eee', alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={() => setMode(mode === 'code' ? 'nodes' : 'code')}>{mode === 'code' ? '프롬프트 편집으로' : '코드 편집으로'}</button>
        <span style={{ flex:1 }} />
        <button onClick={() => setShowPlay(true)}>플레이(오버레이)</button>
        <select onChange={e => {
          const v = e.target.value; e.target.selectedIndex = 0;
          if (v === 'ui-preset-main') {
            try {
              const obj = JSON.parse(templateText || '{}');
              const next = {
                ...obj,
                ui: {
                  ...(obj.ui||{}),
                  main: {
                    modules: [
                      { type:'MainGameChat', id:'gameChat' },
                      { type:'SharedChat', id:'sharedChat', enabled:true, realtimeOnly:true },
                      { type:'NextBar', id:'nextBar', policy:{ timeoutSec:60, roleThreshold:0.5 } },
                      { type:'CharacterCards', id:'charCards', behavior:{ tapCycle:['desc','abilities','score','image'], darkenOnOverlay:true } },
                      { type:'WidgetRow', id:'widgetRow' },
                    ],
                  }
                }
              };
              setTemplateText(JSON.stringify(next, null, 2));
            } catch {}
          } else if (v === 'image-ui') {
            setShowImageUi(true);
          } else if (v === 'blocks') {
            setShowBlocks(true);
          }
        }} defaultValue="">
          <option value="" disabled>도구…</option>
          <option value="ui-preset-main">UI 제작(메인게임 기본)</option>
          <option value="image-ui">이미지로 UI 생성</option>
          <option value="blocks">블록코딩</option>
        </select>
        <button onClick={() => fileInputRef.current?.click()}>Import JSON</button>
        <button onClick={() => {
          const blob = new Blob([templateText || '{}'], { type:'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href=url; a.download='template.json'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }}>Export JSON</button>
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display:'none' }} onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
          try { JSON.parse(text); setTemplateText(text); } catch {}
          e.target.value = '';
        }} />
      </div>

      <div style={{ padding:'4px 8px', borderBottom:'1px solid #f2f2f2', fontSize:12, color: info.ok ? '#2d7' : '#d33' }}>
        {info.ok ? `Valid JSON • nodes: ${info.nodes}, edges: ${info.edges}, resource groups: ${info.resources}` : `Invalid JSON: ${info.error}`}
      </div>

      <div style={{ flex:1, minHeight:0, position:'relative' }}>
        {mode === 'code' ? (
          <div style={{ height:'100%', position:'relative' }}>
            <div style={{ position:'absolute', left:0, top:'50%', transform:'translate(-30%, -50%)', zIndex:5 }}>
              <button title="AI 코딩" onClick={() => emit('studio:ai:toggle')}>{'<'}</button>
            </div>
            <CodeEditor value={templateText} onChange={setTemplateText} />
            <div style={{ position:'absolute', right: 12, bottom: 12 }}>
              <RunnerPanel />
            </div>
          </div>
        ) : (
          <div style={{ height:'100%' }}>
            {children}
          </div>
        )}
      </div>

      {/* floating panels */}
      <AIPanel />
      {showPlay && (
        <div style={{ position:'fixed', inset:0, background:'#fff', zIndex:1000 }}>
          <div style={{ position:'absolute', top:8, right:8 }}>
            <button onClick={() => setShowPlay(false)}>닫기</button>
          </div>
          {/* Embedding via dynamic import to avoid SSR */}
          <div style={{ height:'100%' }}>
            {(() => {
              const Comp = dynamic(() => import('../game/MainGameMobileUI.jsx'), { ssr:false });
              try {
                const obj = JSON.parse(templateText || '{}');
                return <Comp template={obj} />;
              } catch {
                return <Comp template={{}} />;
              }
            })()}
          </div>
        </div>
      )}
      {showImageUi && <ImageUiPanel onClose={() => setShowImageUi(false)} />}
      {showBlocks && <BlockCodingPanel onClose={() => setShowBlocks(false)} />}
    </div>
  );
}

export default function PromptEditorEnhancer({ children, templateText, onTemplateTextChange }){
  return (
    <StudioPersistentProvider>
      <Inner externalText={templateText} onExternalChange={onTemplateTextChange}>
        {children}
      </Inner>
    </StudioPersistentProvider>
  );
}

