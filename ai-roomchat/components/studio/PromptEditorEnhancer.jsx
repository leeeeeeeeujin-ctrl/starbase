import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import StudioPersistentProvider, { } from '../../contexts/StudioPersistentProvider.jsx';
import { useStudioTemplate } from '../../contexts/StudioStore';
import { emit } from '../../contexts/StudioBus';
import { applyMainUiPresetObject, getMainUiModules } from '../../utils/uiPresets';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
const AIPanel = dynamic(() => import('./AIPanel'), { ssr: false });
const RunnerPanel = dynamic(() => import('./RunnerPanel'), { ssr: false });
const BlockCodingPanel = dynamic(() => import('./BlockCodingPanel'), { ssr: false });

function Inner({ children, externalText, onExternalChange }){
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const fileInputRef = useRef(null);
  const [showUiSettings, setShowUiSettings] = useState(false);
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
          if (v === 'ui-settings') {
            setShowUiSettings(true);
          } else if (v === 'blocks') {
            setShowBlocks(true);
          }
        }} defaultValue="">
          <option value="" disabled>도구…</option>
          <option value="ui-settings">UI 설정</option>
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
          <div style={{ height:'100%', display:'grid', placeItems:'center', padding:32, background:'#020617', color:'#e2e8f0' }}>
            <div style={{ maxWidth:560, display:'grid', gap:10, textAlign:'center' }}>
              <div style={{ fontSize:12, letterSpacing:'0.08em', textTransform:'uppercase', color:'#94a3b8' }}>
                Legacy Play Disabled
              </div>
              <div style={{ fontSize:28, fontWeight:700 }}>
                프롬프트 편집기 플레이 프리뷰는 비활성화되었습니다.
              </div>
              <div style={{ fontSize:14, lineHeight:1.7, color:'#cbd5e1' }}>
                기존 게임 미리보기는 새 텍스트 배틀 실행기로 교체할 예정입니다.
              </div>
            </div>
          </div>
        </div>
      )}
      {showUiSettings && (
        <UiSettingsPanelStudio onClose={() => setShowUiSettings(false)} templateText={templateText} setTemplateText={setTemplateText} />
      )}
      {showBlocks && <BlockCodingPanel onClose={() => setShowBlocks(false)} />}
    </div>
  );
}

function UiSettingsPanelStudio({ onClose, templateText, setTemplateText }){
  const [imageName, setImageName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const getTpl = () => { try { return JSON.parse(templateText || '{}'); } catch { return {}; } };
  const saveTpl = (obj) => { try { setTemplateText(JSON.stringify(obj, null, 2)); } catch {} };
  const onApplyPreset = () => {
    try {
      const next = applyMainUiPresetObject(getTpl());
      saveTpl(next);
      alert('메인 UI 프리셋을 적용했습니다.');
    } catch (e) { alert('적용 실패: ' + String(e?.message||e)); }
  };
  const onAddBackground = () => {
    if (!String(imageUrl||'').trim()) { alert('이미지 URL을 입력하세요.'); return; }
    setBusy(true);
    try {
      const obj = getTpl();
      const bg = Array.isArray(obj?.resources?.backgrounds) ? obj.resources.backgrounds : [];
      const id = `bg_${Math.random().toString(36).slice(2,8)}`;
      const next = {
        ...obj,
        ui: {
          ...(obj.ui||{}),
          main: {
            modules: Array.isArray(obj?.ui?.main?.modules) && obj.ui.main.modules.length > 0 ? obj.ui.main.modules : getMainUiModules(),
          },
        },
        resources: { ...(obj.resources||{}), backgrounds: [...bg, { id, name: imageName || '배경', image: imageUrl }] },
      };
      saveTpl(next);
      setImageName(''); setImageUrl('');
      alert('배경 이미지를 추가했습니다.');
    } catch (e) { alert('추가 실패: ' + String(e?.message||e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1600, background:'rgba(2,6,23,0.65)' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0 }} />
      <div role="dialog" aria-modal="true" onClick={(e)=>e.stopPropagation()} style={{ position:'absolute', left:'env(safe-area-inset-left)', right:'env(safe-area-inset-right)', bottom:'env(safe-area-inset-bottom)', top:'min(8%, 64px)', margin:'auto', maxWidth:600, background:'#0b1220', border:'1px solid rgba(148,163,184,0.35)', borderRadius:12, boxShadow:'0 24px 64px rgba(0,0,0,0.6)', display:'grid', gridTemplateRows:'auto 1fr auto' }}>
        <div style={{ padding:'10px 12px', borderBottom:'1px solid #25314a', color:'#e2e8f0', fontWeight:700 }}>UI 설정</div>
        <div style={{ padding:12, display:'grid', gap:12, overflow:'auto' }}>
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>빠른 작업</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <button onClick={onApplyPreset} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', fontWeight:600 }}>메인 프리셋 적용</button>
            </div>
          </div>
          <div style={{ height:1, background:'rgba(148,163,184,0.2)' }} />
          <div style={{ display:'grid', gap:8 }}>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>배경 이미지 추가</div>
            <label style={{ fontSize:12, color:'#94a3b8' }}>이름</label>
            <input value={imageName} onChange={e=>setImageName(e.target.value)} placeholder="예: 숲-아침" style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <label style={{ fontSize:12, color:'#94a3b8' }}>이미지 URL</label>
            <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..." style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <div>
              <button onClick={onAddBackground} disabled={busy} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #10b981', background:'#065f46', color:'#d1fae5', fontWeight:700 }}>{busy?'추가 중…':'배경 추가'}</button>
            </div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>팁: 이미지 추가 시 메인 UI 모듈이 비어 있다면 기본 프리셋을 자동 적용합니다.</div>
          </div>
        </div>
        <div style={{ padding:12, borderTop:'1px solid #25314a', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>닫기</button>
        </div>
      </div>
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
