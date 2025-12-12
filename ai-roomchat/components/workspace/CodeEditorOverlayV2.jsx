"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { unifiedSave } from '../../lib/workspace/unifiedSave.js';
import { loadExtensionsMeta } from '../../lib/workspace/extensionsMeta.js';
import { createCoreRuntime } from '../../lib/runtime/coreRuntime.js';
import { loadHooksFromSource } from '../../lib/runtime/safeEvalHookModule.js';
import {
  applySceneFromRank,
  applySpeakerFromRank,
} from '../../lib/runtime/rankStandardSlots.js';
import { loadCapabilitiesMeta } from '../../lib/workspace/capabilitiesMeta.js';
import { validateCapabilities } from '../../lib/workspace/validateCapabilities.js';
import { selectRuntimeFeatures, computeRuntimeFeatureIssues } from '../../lib/runtime/runtimeFeatures.js';
import { isWorkspaceDebug } from '../../lib/workspace/debugFlags.js';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import FileTree from './FileTree.jsx';
import EditorMonaco from '../EditorMonaco.jsx';
import dynamic from 'next/dynamic';
import SyncTemplateToVfs from './SyncTemplateToVfs.jsx';
import AICodeChatPanel from './AICodeChatPanel.jsx';
import PlayDebugPanel from './PlayDebugPanel.jsx';
import { useBuiltinRuntime } from './hooks/useBuiltinRuntime.js';
import { useGridEngine } from './hooks/useGridEngine.js';

const GameShell = dynamic(() => import('../game/GameShell.jsx'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#94a3b8' }}>
      <div>플레이 화면 로딩 중…</div>
    </div>
  ),
});

async function setupRuntimeAdapters({ setId, files, cfg, bus }) {
  const meta = await loadCapabilitiesMeta(String(setId)).catch(() => ({ capabilities: [] }));
  const caps = Array.isArray(meta?.capabilities) ? meta.capabilities : [];
  const { features, flags } = selectRuntimeFeatures({ capabilities: caps, files, config: cfg });
  const issues = computeRuntimeFeatureIssues({ capabilities: caps, files });

  const hasRealtime = flags.wantsRealtimeNetwork;
  const hasYjs = flags.wantsSharedCrdt;
  if (!hasRealtime && !hasYjs) {
    return { features, issues, adapters: null };
  }

  // Build networking config from /game/network.config.json when present
  let networking = null;
  try {
    const netText = files?.['/game/network.config.json']?.content || '';
    if (netText) {
      const netCfg = JSON.parse(netText || '{}');
      const rawEngine = String(netCfg.engine || netCfg.id || '').toLowerCase();
      let id = null;
      if (/socket/i.test(rawEngine)) id = 'socketio';
      else if (/colyseus/i.test(rawEngine)) id = 'colyseus';
      if (id && netCfg.url) {
        networking = {
          id,
          url: netCfg.url,
          token: netCfg.token || null,
        };
      }
    }
  } catch {
    // ignore malformed network.config
  }

  const sync = hasYjs ? { id: 'yjs' } : null;
  if (!networking && !sync) {
    return { features, issues, adapters: null };
  }

  const cfgAdapters = {};
  if (networking) cfgAdapters.networking = networking;
  if (sync) cfgAdapters.sync = sync;

  const { initAdapters } = await import('../../lib/runtime/adapterManager.js');
  const adapters = await initAdapters(cfgAdapters, (evt) => {
    try {
      bus.emit('net:event', evt);
    } catch {
      // ignore bus errors
    }
  });

  return { features, issues, adapters };
}

function useRuntimeAdapters({ storageNamespace, router, files, cfg, bus, setRuntimeFeatures, setRuntimeIssues, setNetAdapters }) {
  React.useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const setId = storageNamespace || router?.query?.id || null;
        if (!setId) return;
        const { features, issues, adapters } = await setupRuntimeAdapters({ setId, files, cfg, bus });
        if (disposed) {
          try { adapters?.dispose?.(); } catch {}
          return;
        }
        setRuntimeFeatures(features);
        setRuntimeIssues(issues);
        setNetAdapters(adapters);
      } catch (e) {
        if (isWorkspaceDebug()) {
          try { console.warn('[PlayOverlay] adapter init failed', e); } catch {}
        }
      }
    })();
    return () => {
      disposed = true;
      setNetAdapters(null);
      setRuntimeIssues([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageNamespace, JSON.stringify(files)]);
}

function useDebugSimUsers({ storageNamespace, debugState, setDebugState }) {
  const LS_KEY = storageNamespace ? `playDebug.simUsers@${storageNamespace}` : 'playDebug.simUsers';
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        setDebugState((s) => ({ ...s, simUsers: arr }));
      }
    } catch {
      // ignore load errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [LS_KEY]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = Array.isArray(debugState.simUsers) ? debugState.simUsers : [];
      window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [LS_KEY, debugState.simUsers]);
}

// Workspace context error boundary used to guard the editor subtree.
class WorkspaceBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error){
    return { hasError: true, error };
  }
  componentDidCatch(error, info){
    try {
      console.warn('[WorkspaceBoundary] workspace context error', {
        message: error?.message || String(error),
        stack: error?.stack || null,
        componentStack: info?.componentStack || null,
      });
    } catch {
      // ignore log errors
    }
  }
  render(){
    if (this.state.hasError) {
      return (
        <div style={{ padding:16, color:'#94a3b8' }}>
          작업공간 컨텍스트가 없어 코드를 표시할 수 없습니다.
        </div>
      );
    }
    return this.props.children;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error){
    return { hasError: true, error };
  }
  componentDidCatch(error, info){
    try { console.error('Play overlay error:', error, info); } catch {}
  }
  render(){
    if (this.state.hasError) {
      const e = this.state.error;
      return (
        <div style={{ height:'100%', display:'grid', placeItems:'center', padding:16 }}>
          <div style={{ maxWidth: 560, background:'#0b1220', border:'1px solid #334155', borderRadius:12, padding:16 }}>
            <div style={{ color:'#e2e8f0', fontWeight:700, marginBottom:8 }}>플레이 로드에 실패했어요</div>
            <div style={{ color:'#cbd5e1', fontSize:13, lineHeight:1.5 }}>
              리소스 청크를 불러오지 못했습니다. 개발 서버 재시작 또는 강력 새로고침(Ctrl+F5)을 시도해 주세요.
              {String(e?.message||'').includes('Loading chunk') || String(e||'').includes('ChunkLoadError') ? (
                <div style={{ marginTop:6, color:'#93c5fd' }}>오래된 번들을 참조 중일 수 있습니다. 서비스워커를 해제하면 해결될 수 있어요.</div>
              ) : null}
            </div>
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={() => { try { location.reload(); } catch {} }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>강력 새로고침</button>
              <button onClick={() => { try { navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())); setTimeout(()=>location.reload(), 300); } catch {} }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>서비스워커 해제</button>
              {this.props.onRetry ? (
                <button onClick={this.props.onRetry} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>다시 시도</button>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function PlayOverlayContent({ templateBinding }) {
  const { files, storageNamespace } = useWorkspace();
  const router = useRouter();
  const [runnerInfo, setRunnerInfo] = React.useState(null);
  const [runnerErr, setRunnerErr] = React.useState(null);
  const [netAdapters, setNetAdapters] = React.useState(null);
  const [runtimeFeatures, setRuntimeFeatures] = React.useState([]);
  const [runtimeIssues, setRuntimeIssues] = React.useState([]);
  const runtimeRef = React.useRef(null);
  const runtimeHooksRef = React.useRef(null);
  const [debugCollapsed, setDebugCollapsed] = React.useState(true);
  const [debugState, setDebugState] = React.useState({
    lastPrompt: null,
    calls: [],
    turnEvents: [],
    simUsers: [],
    debugErrors: [], // hook timeout 등 디버그 에러
    fallbackCount: 0, // AI fallback 발생 횟수
  });
  useDebugSimUsers({ storageNamespace, debugState, setDebugState });
  const bus = React.useMemo(() => {
    const listeners = new Map();
    return {
      on(event, fn){ const arr=listeners.get(event)||[]; listeners.set(event, [...arr, fn]); return () => this.off(event, fn); },
      off(event, fn){ const arr=listeners.get(event)||[]; listeners.set(event, arr.filter(f=>f!==fn)); },
      emit(event, payload){ const arr=listeners.get(event)||[]; arr.forEach(fn=>{ try{ fn(payload);}catch(e){ console.warn('bus handler error', e);} }); },
    };
  }, []);

  // debug:error 이벤트 리스너 (hook timeout 등)
  React.useEffect(() => {
    const off = bus.on('debug:error', (err) => {
      setDebugState((prev) => {
        const errors = Array.isArray(prev.debugErrors) ? prev.debugErrors.slice() : [];
        errors.push({ ...err, ts: Date.now() });
        // 최대 20개까지만 유지
        while (errors.length > 20) errors.shift();
        return { ...prev, debugErrors: errors };
      });
    });
    return off;
  }, [bus]);

  // 디버그용 시뮬레이션 참가자 관리 헬퍼
  const addSimUser = React.useCallback(() => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      list.push({ name: '', apiKey: '' });
      return { ...prev, simUsers: list };
    });
  }, []);

  const updateSimUser = React.useCallback((index, patch) => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      while (list.length <= index) {
        list.push({ name: '', apiKey: '' });
      }
      list[index] = { ...list[index], ...patch };
      return { ...prev, simUsers: list };
    });
  }, []);

  const removeSimUser = React.useCallback((index) => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      if (index < 0 || index >= list.length) return prev;
      list.splice(index, 1);
      return { ...prev, simUsers: list };
    });
  }, []);

  // 템플릿(JSON) 파싱은 별도로 감싸, 파싱 오류만 명확히 표기한다.
  let tpl;
  try {
    const tplText =
      typeof templateBinding?.text === 'string' && templateBinding.text.length > 0
        ? templateBinding.text
        : files?.['/template.json']?.content || '{}';
    tpl = JSON.parse(tplText || '{}');
  } catch (e) {
    try {
      // 개발/디버그용 로그
      // eslint-disable-next-line no-console
      console.error('[PlayOverlay] failed to parse /template.json', e);
    } catch {
      // ignore log errors
    }
    const message = String(e && e.message ? e.message : e || '');
    return (
      <div style={{ padding:16, color:'#94a3b8' }}>
        템플릿 JSON을 파싱할 수 없습니다.
        {message && (
          <div style={{ marginTop:4, fontSize:11, opacity:0.8 }}>
            오류: {message}
          </div>
        )}
      </div>
    );
  }

  const cfgText = files?.['/game/runtime.config.json']?.content || '{}';
  let cfg = {};
  try {
    cfg = JSON.parse(cfgText || '{}');
  } catch {
    // 잘못된 runtime.config.json 은 기본값으로 대체
    cfg = {};
  }
    const engine = String(cfg?.engine || 'builtin').toLowerCase();
    const mode = String(cfg?.mode || (cfg?.durations ? 'turn' : 'realtime')).toLowerCase();

    // Optional play overlay debug config: /debug/play.json (workspace VFS)
    let debugConfig = null;
    try {
      const dbgText = files?.['/debug/play.json']?.content;
      if (dbgText) {
        debugConfig = JSON.parse(dbgText || '{}');
      }
    } catch {
      debugConfig = null;
    }
    const hasCoreTextFeature =
      Array.isArray(runtimeFeatures) &&
      runtimeFeatures.some((f) => f && f.id === 'core.text-runtime');
    // 텍스트 베틀(core.text-runtime) 세트에서는 /debug/play.json이 없어도
    // 기본적으로 프롬프트 인스펙터를 켠 상태로 취급한다.
    const debugPromptEnabled = debugConfig
      ? !!debugConfig.promptInspector
      : hasCoreTextFeature;
  const debugLogCallsEnabled = !!(debugConfig && debugConfig.logAiCalls);

  // Initialize optional adapters (networking, CRDT sync) based on capabilities + config.
  useRuntimeAdapters({
    storageNamespace,
    router,
    files,
    cfg,
    bus,
    setRuntimeFeatures,
    setRuntimeIssues,
    setNetAdapters,
  });

  // Grid engine: extracted to useGridEngine hook
  const gridEngineRef = useGridEngine({
    runtimeFeatures,
    files,
    bus,
    engine,
    runtimeRef,
    hooksRef: runtimeHooksRef,
  });

  // Core runtime: extracted to useBuiltinRuntime hook
  useBuiltinRuntime({
    engine,
    files,
    cfg,
    bus,
    debugState,
    onDebugStateChange: setDebugState,
    debugPromptEnabled,
    debugLogCallsEnabled,
    gridEngineRef,
    runtimeRef,
    hooksRef: runtimeHooksRef,
  });

    // Best-effort invoke Runtime/runner.js when engine === builtin (behind flag)
    React.useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          if (process.env.NEXT_PUBLIC_RUNTIME_RUNNER !== '1') return;
          const runnerPath = '/Runtime/runner.js';
          let src = files?.[runnerPath]?.content;
          // Fallback: search a reference pack runner if user has not created one
          if (!src) {
            try {
              const keys = Object.keys(files || {});
              const refKey = keys.find(k => /\/Reference\/.+\/Runtime\/runner\.js$/.test(k));
              if (refKey) src = files[refKey]?.content;
            } catch {}
          }
          if (!src) return; // no runner present
          if (engine !== 'builtin') return; // only call runner for builtin engine to avoid adapter import errors
          const blob = new Blob([src], { type: 'text/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            const mod = await import(/* webpackIgnore: true */ url);
            if (cancelled) return;
            if (mod && typeof mod.run === 'function') {
              const flatFiles = Object.fromEntries(Object.entries(files||{}).map(([p, m]) => [p, { content: m?.content || '' }]));
              const res = await mod.run(tpl, flatFiles, { ...cfg, bus, setId: String(router?.query?.id || '') });
              if (!cancelled) setRunnerInfo(res || { ok: true });
            }
          } finally {
            try { URL.revokeObjectURL(url); } catch {}
          }
        } catch (e) {
          if (!cancelled) setRunnerErr(String(e?.message||e));
        }
      })();
      return () => { cancelled = true; };
    }, [engine, JSON.stringify(files), tplText, cfgText, bus]);

    const showBanner = process.env.NEXT_PUBLIC_PLAY_BANNER === '1';
    const banner = showBanner ? (
      <div style={{ position:'absolute', left:12, top:12, zIndex:10, padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'rgba(2,6,23,0.75)', color:'#cbd5e1', fontSize:12 }}>
        <span style={{ color:'#93c5fd' }}>Engine:</span> {engine} <span style={{ margin:'0 6px', opacity:0.5 }}>|</span>
        <span style={{ color:'#93c5fd' }}>Mode:</span> {mode}
        {engine !== 'builtin' ? (
          <span style={{ marginLeft:8, color:'#fbbf24' }} title="Adapter stub">
            adapter stub — falling back to builtin UI
          </span>
        ) : null}
        {runnerInfo ? (
          <span style={{ marginLeft:8, color:'#86efac' }} title="Runner result">runner ok</span>
        ) : null}
        {runnerErr ? (
          <span style={{ marginLeft:8, color:'#fca5a5' }} title="Runner error">runner error</span>
        ) : null}
        {Array.isArray(runtimeFeatures) && runtimeFeatures.length > 0 ? (
          <span style={{ marginLeft:8, color:'#a5b4fc' }} title="Active runtime features">
            features: {runtimeFeatures.map((f) => f.id).join(', ')}
          </span>
        ) : null}
      </div>
    ) : null;

    const issuesPanel = Array.isArray(runtimeIssues) && runtimeIssues.length > 0 ? (
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: showBanner ? 52 : 12,
          zIndex: 11,
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid rgba(248,113,113,0.4)',
          background: 'rgba(120,40,40,0.85)',
          color: '#fee2e2',
          fontSize: 11,
          maxWidth: 480,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>기능이 꺼진 이유</div>
        <ul style={{ margin: 0, paddingLeft: 14, display: 'grid', gap: 4 }}>
          {runtimeIssues.map((issue, idx) => (
            <li key={`${issue.id}-${idx}`} style={{ lineHeight: 1.5 }}>
              <span style={{ color: '#fca5a5' }}>{issue.id}</span>{' '}
              {issue.missingFiles?.length ? (
                <span>파일 없음: {issue.missingFiles.join(', ')}</span>
              ) : null}
              {issue.missingFiles?.length && issue.missingCaps?.length ? ' / ' : null}
              {issue.missingCaps?.length ? (
                <span>capability 누락: {issue.missingCaps.join(', ')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

    const enableDebugUi = !!(debugConfig || hasCoreTextFeature);
  const debugPanel = (
    <PlayDebugPanel
      enableDebugUi={enableDebugUi}
      debugCollapsed={debugCollapsed}
      setDebugCollapsed={setDebugCollapsed}
      debugPromptEnabled={debugPromptEnabled}
      debugState={debugState}
      debugLogCallsEnabled={debugLogCallsEnabled}
      addSimUser={addSimUser}
      updateSimUser={updateSimUser}
      removeSimUser={removeSimUser}
    />
  );

  return (
    <div style={{ position:'relative', height:'100%', width:'100%' }}>
      {banner}
      {issuesPanel}
      {debugPanel}
      <ErrorBoundary onRetry={() => { try { window.dispatchEvent(new Event('play:retry')); } catch {} }}>
        <GameShell
          template={tpl}
          runtimeBus={bus}
          runtimeFeatures={runtimeFeatures}
          shellConfig={
            files?.['/game/ui.shell.json']
              ? (() => {
                  try {
                    return JSON.parse(files['/game/ui.shell.json'].content || '{}');
                  } catch {
                    return null;
                  }
                })()
              : null
          }
          mode="play"
        />
      </ErrorBoundary>
    </div>
  );
}

function EditorHost({ path, language, value, onChange, onSave }) {
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <EditorMonaco
          value={value}
          onChange={onChange}
          onSave={onSave}
          language={language}
          theme="vs-dark"
          height="100%"
          currentPath={path}
        />
      </div>
    </div>
  );
}

function EditorPane() {
  const { files, drafts, setDraft, activePath, inferLang, writeFile, saveFile, saveFileAndPush, storageNamespace } = useWorkspace();
  const instanceRef = useRef(null);
  if (instanceRef.current == null) {
    instanceRef.current = Math.random().toString(36).slice(2, 8);
  }
  const file = files[activePath];
  const lang = useMemo(() => inferLang(activePath), [activePath, inferLang]);
  const initialBuf = drafts?.[activePath] ?? (file?.content ?? '');
  const [buf, setBuf] = useState(() => initialBuf);
  if (isWorkspaceDebug()) {
    try {
      console.log('[EditorPane] render', { path: activePath, instance: instanceRef.current });
    } catch {}
  }
  useEffect(() => {
    if (isWorkspaceDebug()) {
      try {
        console.log('[EditorPane] mount', { path: activePath, instance: instanceRef.current });
      } catch {}
    }
    return () => {
      if (isWorkspaceDebug()) {
        try {
          console.log('[EditorPane] unmount', { path: activePath, instance: instanceRef.current });
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 파일 전환이나 외부에서 파일 내용이 갱신될 때만 버퍼를 재동기화한다.
  // drafts 변경(키 입력)은 여기서 다시 적용하지 않는다.
  useEffect(() => {
    setBuf(drafts?.[activePath] ?? (file?.content ?? ''));
  }, [activePath, file]);
  if (!file) return <div style={{ padding: 16, color: '#e2e8f0' }}>파일을 선택하세요.</div>;
  const doSave = async () => {
    try {
      if (file.readonly) return;
      // 현재 버퍼 내용을 워크스페이스 VFS에 한 번에 반영하고 저장합니다.
      writeFile(activePath, buf);
      const id = storageNamespace || '';
      // saveFile은 로컬 시그니처/드래프트 정리만 담당하고,
      // 서버 전송에는 현재 버퍼 내용을 명시적으로 넘긴다.
      saveFile(activePath);
      if (id) await saveFileAndPush(id, activePath, buf);
    } catch {}
  };
  const handleChange = (val) => {
    // 로컬 버퍼를 갱신하고, drafts 에도 기록해
    // saveAll(filesForSave) 같은 경로에서 최신 내용을 사용할 수 있게 한다.
    setBuf(val);
    try {
      setDraft(activePath, val);
    } catch {
      // ignore draft errors
    }
  };
  return (
    <EditorHost
      path={activePath}
      language={lang}
      value={buf}
      onChange={handleChange}
      onSave={doSave}
    />
  );
}

export default function CodeEditorOverlayV2({ templateBinding, onRequestClose }){
  const overlayInstanceRef = useRef(null);
  if (overlayInstanceRef.current == null) {
    overlayInstanceRef.current = Math.random().toString(36).slice(2, 8);
  }
  // Trace overlay-level remounts
  useEffect(() => {
    if (isWorkspaceDebug()) {
      try {
        console.log('[CodeEditorOverlay] mount', { instance: overlayInstanceRef.current });
      } catch {}
    }
    return () => {
      if (isWorkspaceDebug()) {
        try {
          console.log('[CodeEditorOverlay] unmount', { instance: overlayInstanceRef.current });
        } catch {}
      }
    };
  }, []);
  const [showTree, setShowTree] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(true);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [creating, setCreating] = useState(null);
  const [createPath, setCreatePath] = useState('');
  const fileMenuRef = useRef(null);
  const aiMenuRef = useRef(null);
  const treeRef = useRef(null);
  const [showPlay, setShowPlay] = useState(false);
  const [showCodeChat, setShowCodeChat] = useState(false);
  const [chatSize, setChatSize] = useState({ w: 360, h: 360 });
  const [resizing, setResizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [chatPos, setChatPos] = useState({ x: 16, y: 16 });
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const dragLastRef = useRef(null);
  const resizeLastRef = useRef(null);
  const [playKey, setPlayKey] = useState(0);

  if (isWorkspaceDebug()) {
    try {
      console.log('[CodeEditorOverlay] render', {
        instance: overlayInstanceRef.current,
        showTree,
        showPlay,
        showCodeChat,
      });
    } catch {
      // ignore debug log errors
    }
  }

  const LS_CHAT_POS = 'workspace:aiChat:pos';
  const LS_CHAT_SIZE = 'workspace:aiChat:size';
  const LS_SHOW_TREE = 'workspace:showTree';

  const computeTreeWidth = () => {
    if (typeof window === 'undefined') return 240;
    const vw = window.innerWidth || 1200;
    return Math.round(Math.max(180, Math.min(320, vw * 0.22)));
  };
  const [treeWidth, setTreeWidth] = useState(computeTreeWidth());
  const computeOverlayTree = () => {
    if (typeof window === 'undefined') return false;
    const vw = window.innerWidth || 1200;
    return vw < 1280;
  };
  const [overlayTree, setOverlayTree] = useState(computeOverlayTree());

  useEffect(() => {
    const onResize = () => {
      setTreeWidth(computeTreeWidth());
      setOverlayTree(computeOverlayTree());
      // update --vh to avoid chrome jumps
      try {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      } catch {}

      // initialize chat position near bottom-right if not dragged yet
      try {
        setChatPos(pos => {
          if (pos && pos.__init) return pos; // already initialized
          // try restore from localStorage first
          try {
            const raw = localStorage.getItem(LS_CHAT_POS);
            if (raw) {
              const p = JSON.parse(raw);
              return { ...(p||{}), __init: true };
            }
          } catch {}
          const w = window.innerWidth || 1200;
          const h = window.innerHeight || 800;
          return { x: Math.max(8, w - (chatSize.w||420) - 16), y: Math.max(8, h - (chatSize.h||360) - 16), __init: true };
        });
        // also try restore size once
        setChatSize(sz => {
          try {
            if (sz && sz.__init) return sz;
            const raw = localStorage.getItem(LS_CHAT_SIZE);
            if (raw) {
              const s = JSON.parse(raw);
              return { ...(s||{}), __init: true };
            }
          } catch {}
          return { ...sz, __init: true };
        });
        // restore file tree visibility
        try {
          const sv = localStorage.getItem(LS_SHOW_TREE);
          if (sv === '0') setShowTree(false);
          else if (sv === '1') setShowTree(true);
        } catch {}
      } catch {}
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const getPoint = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const p = getPoint(e);
      const last = resizeLastRef.current || p;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      resizeLastRef.current = p;
      setChatSize(s => ({ w: Math.min(Math.max(320, s.w + dx), 900), h: Math.min(Math.max(240, s.h + dy), 1200) }));
    };
    const onUp = () => { setResizing(false); resizeLastRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [resizing]);

  useEffect(() => {
    if (!dragging) return;
    const getPoint = (e) => {
      if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      const p = getPoint(e);
      const last = dragLastRef.current || p;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      dragLastRef.current = p;
      setChatPos(prev => {
        try {
          const w = window.innerWidth || 1200;
          const h = window.innerHeight || 800;
          const nx = Math.min(Math.max(0, (prev.x||0) + dx), Math.max(0, w - (chatSize.w||360)));
          const ny = Math.min(Math.max(0, (prev.y||0) + dy), Math.max(0, h - (chatSize.h||360)));
          const np = { ...(prev||{}), x: nx, y: ny, __init: true };
          try { localStorage.setItem(LS_CHAT_POS, JSON.stringify({ x: np.x, y: np.y })); } catch {}
          return np;
        } catch {
          return { ...(prev||{}), x: (prev.x||0)+dx, y: (prev.y||0)+dy };
        }
      });
    };
    const onUp = () => { setDragging(false); dragLastRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [dragging, chatSize.w, chatSize.h]);

  useEffect(() => {
    // persist size
    try {
      const { w, h } = chatSize || {};
      if (w && h) localStorage.setItem(LS_CHAT_SIZE, JSON.stringify({ w, h }));
    } catch {}
  }, [chatSize.w, chatSize.h]);

  useEffect(() => {
    // persist showTree
    try { localStorage.setItem(LS_SHOW_TREE, showTree ? '1' : '0'); } catch {}
  }, [showTree]);

  useEffect(() => {
    const onDoc = (e) => {
      try {
        const t = e.target;
        if (t && (t.closest && (t.closest('.monaco-editor') || t.closest('.overflowingContentWidgets')))) return;
        const fm = fileMenuRef.current; const am = aiMenuRef.current; const tr = treeRef.current;
        if (fileMenuOpen && fm && !fm.contains(e.target)) setFileMenuOpen(false);
        if (aiMenuOpen && am && !am.contains(e.target)) setAiMenuOpen(false);
        if (showTree && tr && !tr.contains(e.target) && overlayTree) setShowTree(false);
      } catch {}
    };
    const onKey = (e) => { if (e.key === 'Escape') { if (fileMenuOpen) setFileMenuOpen(false); if (aiMenuOpen) setAiMenuOpen(false); if (overlayTree && showTree) setShowTree(false); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [fileMenuOpen, aiMenuOpen, showTree, overlayTree]);

  const ToolbarButton = ({ onClick, active, children, title }) => (
    <button onClick={onClick} title={title} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #334155', background: active ? '#172033' : '#0b1220', color: '#e2e8f0', whiteSpace: 'nowrap' }}>{children}</button>
  );

  const TabsBar = () => {
    const { openPaths, activePath, open, close, isDirty, saveFile, saveFileAndPush, storageNamespace } = useWorkspace();
    const [confirm, setConfirm] = useState(null); // { path }
    const containerRef = useRef(null);
    useEffect(() => {
      // Ensure active tab stays visible when many files are open
      try {
        const el = containerRef.current;
        if (!el) return;
        const target = el.querySelector(`[data-path="${CSS && CSS.escape ? CSS.escape(activePath || '') : (activePath || '').replace(/"/g, '\\"')}"]`);
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' });
        }
      } catch {}
    }, [activePath, openPaths]);
    return (
      <div ref={containerRef} style={{ display:'flex', alignItems:'center', gap:6, overflowX:'auto', overflowY:'hidden', paddingBottom:2, scrollbarWidth:'thin', WebkitOverflowScrolling:'touch', maxWidth:'100%' }}>
        {openPaths.map((p) => {
          const active = p === activePath;
          const dirty = isDirty(p);
          return (
            <div key={p} data-path={p} style={{ display:'flex', alignItems:'center', flex:'0 0 auto' }}>
              <button onClick={() => open(p)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background: active ? '#172033' : '#0b1220', color:'#e2e8f0', fontSize:12, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis' }}>
                {p.split('/').pop()} {dirty ? '•' : ''}
              </button>
              <button onClick={() => { if (isDirty(p)) setConfirm({ path: p }); else close(p); }} style={{ marginLeft:-6, padding:'6px 6px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>×</button>
            </div>
          );
        })}
        {confirm && (
          <ConfirmCloseOne
            path={confirm.path}
            onSave={async () => {
              try {
                // saveFile는 로컬 시그니처/드래프트 정리만 담당하고,
                // 실제 서버 저장은 saveFileAndPush가 맡는다.
                saveFile(confirm.path);
                const id = storageNamespace || '';
                if (id) {
                  await saveFileAndPush(id, confirm.path);
                }
              } finally {
                close(confirm.path);
                setConfirm(null);
              }
            }}
            onDiscard={() => { close(confirm.path); setConfirm(null); }}
            onCancel={() => setConfirm(null)}
          />
        )}
      </div>
    );
  };

  const Toolbar = () => {
    const router = useRouter();
    const { id } = router.query || {};
    const { root, normalizeDir, open, createFile, createFolder, rename, remove, filesForSave, activePath, writeFile, entryPath, setEntryPath, openPaths, isDirty, saveAll, storageNamespace } = useWorkspace();
    const [saving, setSaving] = useState(false);
    const [installedExtensions, setInstalledExtensions] = useState([]);
    const [githubMeta, setGithubMeta] = useState(null);
    const [showGitSync, setShowGitSync] = useState(false);
    const [gitSyncExtension, setGitSyncExtension] = useState(null);
    const [gitSyncMessage, setGitSyncMessage] = useState('');
    const [gitSyncStatus, setGitSyncStatus] = useState('');
    const [gitSyncRunning, setGitSyncRunning] = useState(false);
    const sortedExtensions = useMemo(() => {
      if (!Array.isArray(installedExtensions)) return [];
      const copy = [...installedExtensions];
      copy.sort((a, b) => {
        const an = String(a?.name || a?.id || '').toLowerCase();
        const bn = String(b?.name || b?.id || '').toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
      });
      return copy;
    }, [installedExtensions]);

    useEffect(() => {
      if (!storageNamespace) return;
      let cancelled = false;

      // Fast path: use in-memory cache if present so the dropdown
      // does not feel "empty" while the network request is in flight.
      try {
        if (typeof window !== 'undefined') {
          const map = window.__workspaceExtensions || {};
          const cached = map[storageNamespace];
          if (Array.isArray(cached) && cached.length) {
            setInstalledExtensions(cached);
          }
        }
      } catch {
        // ignore cache errors
      }

      (async () => {
        try {
          const out = await loadExtensionsMeta(storageNamespace);
          if (cancelled) return;
          const list = Array.isArray(out?.extensions) ? out.extensions : [];
          setInstalledExtensions(list);
          try {
            if (typeof window !== 'undefined') {
              const map = (window.__workspaceExtensions = window.__workspaceExtensions || {});
              map[storageNamespace] = list;
            }
          } catch {
            // ignore cache errors
          }
          if (out && out.github && typeof out.github === 'object') {
            setGithubMeta(out.github);
          } else {
            setGithubMeta(null);
          }
        } catch {
          // Extensions are optional; ignore load errors here.
        }
      })();
      return () => {
        cancelled = true;
      };
  }, [storageNamespace]);

  const addSimUser = React.useCallback(() => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      list.push({ name: '', apiKey: '' });
      return { ...prev, simUsers: list };
    });
  }, []);

  const updateSimUser = React.useCallback((index, patch) => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      while (list.length <= index) {
        list.push({ name: '', apiKey: '' });
      }
      list[index] = { ...list[index], ...patch };
      return { ...prev, simUsers: list };
    });
  }, []);

  const removeSimUser = React.useCallback((index) => {
    setDebugState((prev) => {
      const list = Array.isArray(prev.simUsers) ? prev.simUsers.slice() : [];
      if (index < 0 || index >= list.length) return prev;
      list.splice(index, 1);
      return { ...prev, simUsers: list };
    });
  }, []);

    const handleValidateCapabilities = async () => {
      try {
        if (!storageNamespace) {
          alert('워크스페이스 id가 없어 Capabilities를 검사할 수 없습니다.');
          return;
        }
        const [meta, resp] = await Promise.all([
          loadCapabilitiesMeta(storageNamespace).catch(() => ({ capabilities: [] })),
          fetch('/api/runtime/capability-contracts').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        const contracts = resp
          ? (Array.isArray(resp.capabilities) ? resp.capabilities : (Array.isArray(resp.contracts) ? resp.contracts : []))
          : [];
        const selectedIds = Array.isArray(meta?.capabilities) ? meta.capabilities : [];
        const issues = validateCapabilities({ files: filesForSave, contracts, selectedIds });
        if (!issues || issues.length === 0) {
          alert('선택된 capabilities에 필요한 파일이 모두 준비되어 있습니다.');
          return;
        }
        const lines = issues.map((issue) => {
          if (issue.type === 'missing_file') {
            return `- [${issue.capabilityId}] 파일 없음: ${issue.path}`;
          }
          if (issue.type === 'unknown_capability') {
            return `- 알 수 없는 capability id: ${issue.capabilityId}`;
          }
          return `- ${issue.capabilityId}: ${issue.message || '문제가 있습니다.'}`;
        });
        alert(`Capabilities 검사 결과:\n${lines.join('\n')}`);
      } catch (e) {
        alert('Capabilities 검증 중 오류가 발생했습니다: ' + String(e?.message || e));
      }
    };

    useEffect(() => {
      if (typeof window === 'undefined') return undefined;
      const handler = (ev) => {
        try {
          const detail = ev?.detail || {};
          if (!detail || !detail.workspaceId) return;
          if (detail.workspaceId !== storageNamespace) return;
          if (Array.isArray(detail.extensions)) {
            setInstalledExtensions(detail.extensions);
          }
        } catch {
          // ignore malformed events
        }
      };
      window.addEventListener('workspace:extensions-updated', handler);
      return () => {
        window.removeEventListener('workspace:extensions-updated', handler);
      };
    }, [storageNamespace]);

    const handleGitSyncClose = () => {
      setShowGitSync(false);
      setGitSyncStatus('');
      setGitSyncRunning(false);
    };

    const handleGitSyncCommit = async () => {
      if (!gitSyncExtension || gitSyncRunning) return;
      const cfgExt = gitSyncExtension.config || {};
      const meta = githubMeta || {};
      const owner = meta.owner || cfgExt.owner || '';
      const repo = meta.repo || cfgExt.repo || '';
      const branch = meta.branch || cfgExt.branch || 'main';
      if (!owner || !repo) {
        alert('GitHub 레포 정보(owner/repo)가 설정되지 않았습니다. 확장 설정에서 먼저 연결해 주세요.');
        return;
      }
      const message = (gitSyncMessage || '').trim() || 'Update from Starbase workspace';
      const workspaceId = storageNamespace || (router?.query?.id ? String(router.query.id) : '');
      if (!workspaceId) {
        alert('워크스페이스 id를 알 수 없어 Git Sync를 실행할 수 없습니다.');
        return;
      }
      const fileList = Object.entries(filesForSave || {}).map(([path, metaFile]) => ({
        path,
        content: String(metaFile?.content ?? ''),
      }));
      setGitSyncRunning(true);
      setGitSyncStatus('');
      try {
        const res = await fetch('/api/github/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            branch,
            message,
            workspaceId,
            files: fileList,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          const errMsg = data?.error || res.statusText || String(res.status);
          setGitSyncStatus(`Commit failed: ${errMsg}`);
          alert(`GitHub Commit & Push 실패: ${errMsg}`);
          return;
        }
        const infoParts = [];
        if (data.commitSha) infoParts.push(`commit ${data.commitSha}`);
        if (data.htmlUrl) infoParts.push(data.htmlUrl);
        const msg = infoParts.length
          ? `Committed to ${owner}/${repo}@${branch} (${infoParts.join(' ')})`
          : `Committed to ${owner}/${repo}@${branch}`;
        setGitSyncStatus(msg);
        alert(msg);
      } catch (e) {
        const errMsg = String(e?.message || e);
        setGitSyncStatus(`Commit failed: ${errMsg}`);
        alert(`GitHub Commit & Push 실패: ${errMsg}`);
      } finally {
        setGitSyncRunning(false);
      }
    };
    const onSaveServer = async () => {
      if (!id || saving) return;
      try { setSaving(true); await unifiedSave(String(id), filesForSave); alert('Saved'); }
      catch(e){ alert('Save failed: ' + String(e?.message||e)); }
      finally { setSaving(false); }
    };
    const doNewFile = () => { setCreating('file'); setCreatePath(normalizeDir(root)+'untitled.js'); setFileMenuOpen(false); };
    const doNewFolder = () => { setCreating('folder'); setCreatePath(normalizeDir(root)+'folder/'); setFileMenuOpen(false); };
    const doRename = () => { const cur = activePath; if (!cur) return; const next = window.prompt('새 경로', cur); if (next && next!==cur) rename(cur, next); setFileMenuOpen(false); };
    const doDelete = () => { const cur = activePath; if (!cur) return; if (window.confirm(`${cur} 를 삭제할까요?`)) remove(cur); setFileMenuOpen(false); };
    const doLoadSample = () => {
      try {
        const g = { nodes: [
          { id: 'start', type:'system', label:'게임 시작!' },
          { id: 'intro', type:'ai', label:'플레이어 여러분, 준비되셨나요?' },
          { id: 'act', type:'user_action', label:'행동을 입력하세요.' },
          { id: 'end', type:'system', label:'라운드 종료.' }
        ], edges:[
          { id:'e1', source:'start', target:'intro', label:'' },
          { id:'e2', source:'intro', target:'act', label:'' },
          { id:'e3', source:'act', target:'end', label:'' }
        ]};
        writeFile('/graph/prompt-graph.json', JSON.stringify(g, null, 2)+'\n');
        const cfg = { version:1, roles:['players','observers'], voteThreshold:0.6667, durations:[30,60,90,120,180], entryNode:'start', ai:{ model:'gemini-2.5-flash' } };
        writeFile('/game/runtime.config.json', JSON.stringify(cfg, null, 2)+'\n');
        const hooks = [
          'export function onUserAction(ctx, input){',
          '  if ((input||"").toLowerCase().includes("다시")) return "intro";',
          '  return "end";',
          '}',
          'export function selectNext(ctx, neighbors){',
          '  return neighbors?.[0]?.id ?? null;',
          '}',
        ].join('\n');
        writeFile('/game/hooks/automation.js', hooks+'\n');
        open('/graph/prompt-graph.json');
      } catch {}
      setFileMenuOpen(false);
    };

    // Overlay close with dirty check
    const requestClose = () => {
      const dirtyList = (openPaths||[]).filter(p => isDirty(p));
      if (dirtyList.length === 0) { onRequestClose && onRequestClose(); return; }
      setCloseConfirm({ paths: dirtyList });
    };

    return (
      <div style={{ position:'relative', display:'grid', gridTemplateRows: toolbarCollapsed ? 'auto' : 'auto auto auto', gap:6, padding:'8px', borderBottom:'1px solid #25314a', background:'rgba(2,6,23,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <ToolbarButton onClick={() => { setFileMenuOpen(false); setAiMenuOpen(false); setShowTree(v=>!v); }} active={showTree} title="파일트리">☰</ToolbarButton>
          <div ref={fileMenuRef} style={{ position:'relative' }}>
            <ToolbarButton onClick={() => setFileMenuOpen(v=>{ const next=!v; if (next) { setAiMenuOpen(false); if (overlayTree) setShowTree(false); } return next; })} active={fileMenuOpen} title="파일">파일</ToolbarButton>
            {fileMenuOpen && (
              <div style={{ position:'absolute', zIndex: 20, background:'#0b1220', border:'1px solid #334155', borderRadius:8, padding:6, display:'grid', gap:6, minWidth:180 }}>
                <button onClick={doNewFile} style={menuItem}>새 파일</button>
                <button onClick={doNewFolder} style={menuItem}>새 폴더</button>
                <button onClick={doRename} style={menuItem}>이름 변경</button>
                <button onClick={doDelete} style={{ ...menuItem, border:'1px solid #7f1d1d', color:'#fecaca' }}>삭제</button>
                <div style={{ height:1, background:'rgba(148,163,184,0.2)', margin:'4px 2px' }} />
                <button onClick={doLoadSample} style={{ ...menuItem, border:'1px solid #2563eb', color:'#93c5fd' }}>샘플 그래프 불러오기</button>
              </div>
            )}
          </div>
          <div ref={aiMenuRef} style={{ position:'relative' }}>
            <ToolbarButton
              onClick={() =>
                setAiMenuOpen((v) => {
                  const next = !v;
                  if (next) {
                    setFileMenuOpen(false);
                    if (overlayTree) setShowTree(false);
                  }
                  return next;
                })
              }
              active={aiMenuOpen}
              title="확장"
            >
              확장
            </ToolbarButton>
            {aiMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  zIndex: 20,
                  background: '#0b1220',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: 6,
                  display: 'grid',
                  gap: 6,
                  minWidth: 220,
                }}
              >
                <button
                  onClick={() => {
                    setShowCodeChat((v) => !v);
                    setAiMenuOpen(false);
                  }}
                  style={menuItem}
                >
                  {showCodeChat ? 'AI 코드채팅 끄기' : 'AI 코드채팅 켜기'}
                </button>
                {sortedExtensions && sortedExtensions.length > 0 && (
                  <>
                    {sortedExtensions.map((ext) => (
                      <button
                        key={ext.id}
                        type="button"
                        onClick={() => {
                          try {
                            if (typeof window !== 'undefined') {
                              if (ext.id === 'codex-web') {
                                const cfg = ext.config || {};
                                const extOwner = cfg.owner || '';
                                const extRepo = cfg.repo || '';
                                const extBranch = cfg.branch || 'main';
                                const owner = (githubMeta && githubMeta.owner) || extOwner;
                                const repo = (githubMeta && githubMeta.repo) || extRepo;
                                const branch = (githubMeta && githubMeta.branch) || extBranch;
                                let url = 'https://platform.openai.com/codex';
                                try {
                                  const u = new URL(url);
                                   if (owner && repo) {
                                     u.searchParams.set('repo', `${owner}/${repo}`);
                                   }
                                   if (branch) {
                                     u.searchParams.set('branch', branch);
                                   }
                                   if (storageNamespace) {
                                     u.searchParams.set('workspaceId', storageNamespace);
                                   }
                                   url = u.toString();
                                 } catch {
                                   // ignore URL errors, fall back to base URL
                                 }
                                 window.open(url, '_blank', 'noopener,noreferrer');
                               } else if (ext.id === 'copilot-web') {
                                 const cfg = ext.config || {};
                                 const extOwner = cfg.owner || '';
                                 const extRepo = cfg.repo || '';
                                 const extBranch = cfg.branch || 'main';
                                 const owner = (githubMeta && githubMeta.owner) || extOwner;
                                 const repo = (githubMeta && githubMeta.repo) || extRepo;
                                 const branch = (githubMeta && githubMeta.branch) || extBranch;
                                 let url = 'https://github.com/features/copilot';
                                 try {
                                   const u = new URL(url);
                                   if (owner && repo) {
                                     u.searchParams.set('repo', `${owner}/${repo}`);
                                   }
                                   if (branch) {
                                     u.searchParams.set('branch', branch);
                                   }
                                   if (storageNamespace) {
                                     u.searchParams.set('workspaceId', storageNamespace);
                                   }
                                   url = u.toString();
                                 } catch {
                                   // ignore URL errors
                                 }
                                 window.open(url, '_blank', 'noopener,noreferrer');
                               } else if (ext.id === 'github-sync') {
                                 setGitSyncExtension(ext);
                                 setShowGitSync(true);
                               } else if (ext.id === 'ui-sandbox') {
                                 let url = (ext.config && ext.config.agentUrl) || process.env.NEXT_PUBLIC_UI_SANDBOX_AGENT_URL || 'http://127.0.0.1:7010';
                                 try {
                                   const u = new URL(url);
                                   url = u.toString();
                                 } catch {
                                   // ignore URL errors, fall back to default
                                   url = 'http://127.0.0.1:7010';
                                 }
                                 window.open(url, '_blank', 'noopener,noreferrer');
                               } else {
                                 window.dispatchEvent(
                                   new CustomEvent('workspace:extension-launch', {
                                     detail: { workspaceId: storageNamespace || null, extension: ext },
                                   }),
                                 );
                               }
                            }
                          } catch {
                            // ignore launch errors
                          }
                          setAiMenuOpen(false);
                        }}
                        style={menuItem}
                      >
                        {ext.name || ext.id}
                      </button>
                    ))}
                  </>
                )}
                <div
                  style={{
                    height: 1,
                    background: 'rgba(148,163,184,0.2)',
                    margin: '4px 2px',
                  }}
                />
                <button
                  onClick={() => {
                    try {
                      if (typeof window !== 'undefined') {
                        const payload = storageNamespace ? { workspaceId: storageNamespace } : undefined;
                        if (typeof window.starbaseOpenExtensions === 'function') {
                          window.starbaseOpenExtensions(payload);
                        } else if (typeof window.dispatchEvent === 'function') {
                          window.dispatchEvent(
                            new CustomEvent('ai:open-extensions', { detail: payload }),
                          );
                        }
                      }
                    } catch {
                      // ignore
                    }
                    setAiMenuOpen(false);
                  }}
                  style={menuItem}
                >
                  확장 프로그램 추가…
                </button>
                {isWorkspaceDebug() && (
                  <>
                    <button
                      onClick={() => {
                        try {
                          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                            window.dispatchEvent(new Event('capabilities:open'));
                          }
                        } catch {
                          // ignore
                        }
                        setAiMenuOpen(false);
                      }}
                      style={menuItem}
                    >
                      게임 Capabilities 보기…
                    </button>
                    <button
                      onClick={() => {
                        handleValidateCapabilities();
                        setAiMenuOpen(false);
                      }}
                      style={menuItem}
                    >
                      게임 Capabilities 검사…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <ToolbarButton onClick={() => setShowPlay(true)} active={showPlay} title="플레이">플레이</ToolbarButton>
          <ToolbarButton onClick={onSaveServer} title="저장" disabled={!id || saving}>{saving?'저장중…':'저장'}</ToolbarButton>
          <ToolbarButton onClick={requestClose} title="닫기">닫기</ToolbarButton>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <ToolbarButton
              onClick={() => setToolbarCollapsed(v=>!v)}
              active={toolbarCollapsed}
              title={toolbarCollapsed ? '펼치기' : '접기'}
            >
              {toolbarCollapsed ? '▼' : '▲'}
            </ToolbarButton>
          </div>
        </div>
        {showGitSync && gitSyncExtension ? (
          <div
            style={{
              position: 'absolute',
              top: 52,
              right: 16,
              width: 320,
              maxHeight: '80vh',
              overflow: 'auto',
              borderRadius: 12,
              border: '1px solid #1f2937',
              background: '#020617',
              padding: 12,
              zIndex: 1700,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, color: '#e5e7eb' }}>GitHub Sync</div>
              <button
                type="button"
                onClick={handleGitSyncClose}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
              {(() => {
                const cfgExt = gitSyncExtension.config || {};
                const meta = githubMeta || {};
                const owner = meta.owner || cfgExt.owner || '';
                const repo = meta.repo || cfgExt.repo || '';
                const branch = meta.branch || cfgExt.branch || 'main';
                if (!owner || !repo) return 'GitHub 레포 연결 정보(owner/repo)를 먼저 설정해 주세요.';
                return `Target: ${owner}/${repo}@${branch}`;
              })()}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#e5e7eb', marginBottom: 4 }}>Commit message</div>
              <textarea
                value={gitSyncMessage}
                onChange={(e) => setGitSyncMessage(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: '#020617',
                  color: '#e5e7eb',
                  fontSize: 12,
                  padding: 6,
                  resize: 'vertical',
                }}
                placeholder="예: Fix prompt graph for level 1"
              />
            </div>
            <button
              type="button"
              onClick={handleGitSyncCommit}
              disabled={gitSyncRunning}
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: gitSyncRunning ? '#1d4ed8' : '#1d4ed8',
                color: '#e5e7eb',
                padding: '6px 10px',
                fontSize: 13,
                cursor: gitSyncRunning ? 'default' : 'pointer',
                marginBottom: 6,
              }}
            >
              {gitSyncRunning ? 'Committing...' : 'Commit & Push'}
            </button>
            {gitSyncStatus ? (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{gitSyncStatus}</div>
            ) : (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                현재 워크스페이스 파일을 선택된 GitHub 레포/브랜치에 하나의 스냅샷으로 커밋합니다.
              </div>
            )}
          </div>
        ) : null}
        {!toolbarCollapsed && (
          <>
            <TabsBar />
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', fontSize:12 }}>
              <span>현재: <strong style={{ color:'#e2e8f0' }}>{activePath}</strong></span>
              <button title="엔트리 파일 지정" onClick={() => setEntryPath(activePath)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>엔트리로</button>
              <button title="모두 저장" onClick={() => saveAll()} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>모두 저장</button>
              <button title="프롬프트 편집기 열기" onClick={() => open('/graph/prompt-graph.json')} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>프롬프트</button>
              <button title="런타임 설정 열기" onClick={() => open('/game/runtime.config.json')} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>런타임</button>
            </div>
          </>
        )}
        {creating && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ color:'#e2e8f0', fontSize:12 }}>{creating==='file'?'파일 경로':'폴더 경로'}</span>
            <input value={createPath} onChange={e=>setCreatePath(e.target.value)} style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }} />
            <button onClick={() => { try { creating==='file'? createFile(createPath,'\n') : createFolder(createPath); open(createPath.replace(/\/$/, '')); } finally { setCreating(null); } }} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0' }}>생성</button>
            <button onClick={() => setCreating(null)} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          </div>
        )}
      </div>
    );
  };

  const [closeConfirm, setCloseConfirm] = useState(null); // { paths: [] }

  return (
    <WorkspaceBoundary>
      {templateBinding ? (
        <SyncTemplateToVfs text={templateBinding.text} setText={templateBinding.setText} />
      ) : null}
      <div style={{ position:'relative', display:'flex', height:'calc(var(--vh, 1vh) * 100)', background:'#0b1220', paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
        {!overlayTree && (
          <div ref={treeRef} style={{ width: showTree ? treeWidth : 0, transition: 'width 200ms ease, opacity 200ms ease', opacity: showTree ? 1 : 0, overflow: 'hidden', pointerEvents: showTree ? 'auto' : 'none' }}>
            <FileTree />
          </div>
        )}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column' }}>
          <Toolbar />
          <div style={{ position:'relative', flex:1, minHeight:0, overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0 }}>
              <EditorPane />
            </div>
            {overlayTree && showTree && (
              <div ref={treeRef} style={{ position:'absolute', left:0, top:0, bottom:0, width:treeWidth, background:'#0b1220', borderRight:'1px solid #25314a', boxShadow:'8px 0 24px -12px rgba(0,0,0,0.4)', transition:'opacity 200ms ease', zIndex:300 }}>
                <FileTree />
              </div>
            )}
            {overlayTree && showTree && (
              <div onClick={()=>setShowTree(false)} style={{ position:'absolute', inset:0, background:'rgba(2,6,23,0.4)', backdropFilter:'blur(2px)', zIndex: 250 }} />
            )}
          </div>
        </div>
      </div>
      {showPlay && (
        <div style={{ position:'absolute', inset:0, zIndex: 1600, background:'rgba(2,6,23,0.94)' }}>
          <div style={{ position:'absolute', left:0, top:0, right:0, bottom:0, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }}>
            <button onClick={() => setShowPlay(false)} title="닫기" style={{ position:'absolute', top:'calc(env(safe-area-inset-top) + 10px)', right:'calc(env(safe-area-inset-right) + 10px)', zIndex: 10, padding:'8px 10px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>닫기</button>
            <button onClick={() => setPlayKey(k=>k+1)} title="재시작" style={{ position:'absolute', top:'calc(env(safe-area-inset-top) + 10px)', left:'calc(env(safe-area-inset-left) + 10px)', zIndex: 10, padding:'8px 10px', borderRadius:10, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>재시작</button>
            <div style={{ height:'calc(var(--vh, 1vh) * 100)', display:'flex', alignItems:'stretch', justifyContent:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div key={playKey} style={{ height:'100%', width:'100%' }}>
                  <PlayOverlayContent templateBinding={templateBinding} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {closeConfirm && (
        <ConfirmCloseMany
          paths={closeConfirm.paths}
          onAfterSaveAll={() => { setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onDiscard={() => { setCloseConfirm(null); onRequestClose && onRequestClose(); }}
          onCancel={() => setCloseConfirm(null)}
        />
      )}
      {showCodeChat && !chatMinimized && (
        <div style={chatFullscreen
          ? { position:'fixed', left:0, top:0, right:0, bottom:0, zIndex: 1400, paddingTop:'env(safe-area-inset-top)', paddingBottom:'env(safe-area-inset-bottom)', paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)' }
          : { position:'fixed', left: (chatPos.x||16), top: (chatPos.y||16), zIndex: 1200, width: chatSize.w, height: chatSize.h, background:'transparent' }
        }>
          <div style={chatFullscreen ? { position:'absolute', inset:0 } : { position:'absolute', inset:0 }}>
            <AICodeChatPanel
              onClose={() => setShowCodeChat(false)}
              onDragHandleDown={(e) => { setDragging(true); dragLastRef.current = null; }}
              onToggleFullscreen={() => setChatFullscreen(v=>!v)}
              onMinimize={() => setChatMinimized(true)}
              enableFullscreenButton
              enableMinimizeButton
            />
            {!chatFullscreen && (
              <div onMouseDown={(e)=>{ resizeLastRef.current = { x: e.clientX, y: e.clientY }; setResizing(true); }} onTouchStart={(e)=>{ const t=e.touches?.[0]; resizeLastRef.current = t?{x:t.clientX,y:t.clientY}:null; setResizing(true); }} title="드래그로 크기 조절" style={{ position:'absolute', left:8, bottom:8, width:16, height:16, border:'1px solid #334155', background:'#0b1220', borderRadius:4, cursor:'nwse-resize', opacity:0.9 }} />
            )}
          </div>
        </div>
      )}
      {showCodeChat && chatMinimized && (
        <button onClick={() => setChatMinimized(false)} title="AI 채팅 열기" style={{ position:'fixed', right:'calc(env(safe-area-inset-right) + 12px)', bottom:'calc(env(safe-area-inset-bottom) + 12px)', zIndex:1500, width:48, height:48, borderRadius:24, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', boxShadow:'0 10px 24px rgba(0,0,0,0.5)' }}>AI</button>
      )}
    </WorkspaceBoundary>
  );
}

const menuItem = {
  textAlign:'left', padding:'6px 10px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#e2e8f0', whiteSpace:'nowrap'
};

function ConfirmDialogShell({ title, children, actions }){
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,0.6)', zIndex: 2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'env(safe-area-inset-top) 12px env(safe-area-inset-bottom)' }}>
      <div style={{ width:'min(560px, 96vw)', background:'#0b1220', border:'1px solid #334155', borderRadius:12, overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding:'12px 14px', borderBottom:'1px solid #25314a', color:'#e2e8f0', fontWeight:700 }}>{title}</div>
        <div style={{ padding:12 }}>{children}</div>
        <div style={{ padding:12, borderTop:'1px solid #25314a', display:'flex', gap:8, justifyContent:'flex-end' }}>
          {actions}
        </div>
      </div>
    </div>
  );
}

function ConfirmCloseOne({ path, onSave, onDiscard, onCancel }){
  return (
    <ConfirmDialogShell
      title="파일을 닫기 전에 저장할까요?"
      children={<div style={{ color:'#cbd5e1', fontSize:13 }}>변경 사항이 있는 파일: <strong style={{ color:'#e2e8f0' }}>{path}</strong></div>}
      actions={
        <>
          <button onClick={onDiscard} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>저장 안 함</button>
          <button onClick={onCancel} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          <button onClick={onSave} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>저장</button>
        </>
      }
    />
  );
}

function ConfirmCloseMany({ paths, onAfterSaveAll, onDiscard, onCancel }){
  // Access workspace context at component top-level (valid hook usage)
  const { saveAll, filesForSave } = useWorkspace();
  const router = useRouter();
  const { id } = router.query || {};
  const handleSaveAll = async () => {
    try {
      // Persist both Maker (if present) and workspace files
      if (id) await unifiedSave(String(id), filesForSave);
      // Mark workspace clean locally
      try { saveAll(); } catch {}
    } catch (e) {
      console.error('unified saveAll failed', e);
    }
    onAfterSaveAll && onAfterSaveAll();
  };
  return (
    <ConfirmDialogShell
      title="수정사항을 저장하시겠습니까?"
      children={<div style={{ color:'#cbd5e1', fontSize:13 }}>작성 중인 변경 사항이 있습니다. 저장하시겠습니까?</div>}
      actions={
        <>
          <button onClick={onDiscard} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #7f1d1d', background:'#0b1220', color:'#fecaca' }}>저장 안 함</button>
          <button onClick={onCancel} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #334155', background:'#0b1220', color:'#94a3b8' }}>취소</button>
          <button onClick={handleSaveAll} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff' }}>모두 저장</button>
        </>
      }
    />
  );
}

// (모바일 전용) 단축키는 제외
