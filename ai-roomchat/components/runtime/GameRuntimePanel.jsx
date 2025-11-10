"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from "../workspace/CodeWorkspaceProvider.jsx";
import { loadHooksFromSource, callHookWithTimeout } from "../../lib/runtime/safeEvalHookModule.js";
import { createHookWorker } from "../../lib/runtime/hookWorker.js";

function parseJsonSafe(text, fallback) {
  try { return JSON.parse(String(text || '')); } catch { return fallback; }
}

function getFileContent(files, path, def = '') {
  try {
    const node = files?.[path];
    return typeof node?.content === 'string' ? node.content : def;
  } catch { return def; }
}

export default function GameRuntimePanel() {
  const { files } = useWorkspace();
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [history, setHistory] = useState([]);
  const [turn, setTurn] = useState(1);
  const [variables, setVariables] = useState({});
  const [promptPreview, setPromptPreview] = useState('');
  const [hookInfo, setHookInfo] = useState({ loaded:false, errors:[] });
  const [userInput, setUserInput] = useState('');
  const [busy, setBusy] = useState(false);

  const graph = useMemo(() => {
    const raw = getFileContent(files, '/graph/prompt-graph.json', '{"nodes":[],"edges":[]}');
    const obj = parseJsonSafe(raw, { nodes: [], edges: [] });
    const nodesById = new Map((obj.nodes || []).map(n => [n.id, n]));
    const outEdges = new Map();
    for (const e of (obj.edges || [])) {
      const list = outEdges.get(e.source) || [];
      list.push(e);
      outEdges.set(e.source, list);
    }
    return { nodes: obj.nodes || [], edges: obj.edges || [], nodesById, outEdges };
  }, [files]);

  const runtimeConfig = useMemo(() => {
    const raw = getFileContent(files, '/game/runtime.config.json', '{}');
    return parseJsonSafe(raw, {});
  }, [files]);

  const entryNodeId = useMemo(() => {
    if (runtimeConfig?.entryNode) return runtimeConfig.entryNode;
    // fallback to first node id if present
    return graph.nodes?.[0]?.id ?? null;
  }, [runtimeConfig, graph]);

  useEffect(() => {
    setError('');
    if (!Array.isArray(graph.nodes)) {
      setError('그래프가 유효하지 않습니다. nodes 배열이 없습니다.');
    }
  }, [graph]);

  // Load hooks module from VFS
  const [worker, setWorker] = useState(null);
  const hooks = useMemo(() => {
    const src = getFileContent(files, '/game/hooks/automation.js', '');
    if (!src) { setHookInfo({ loaded:false, errors:['/game/hooks/automation.js 없음'] }); return null; }
    try {
      // prefer worker
      const w = createHookWorker({ timeoutMs: 800 });
      w.load(src).then(()=> setHookInfo({ loaded:true, errors:[] })).catch((e)=> setHookInfo({ loaded:false, errors:[String(e?.message||e)] }));
      setWorker(w);
      // also return sync fallback
      return loadHooksFromSource(src);
    } catch (e) {
      setHookInfo({ loaded:false, errors:[String(e?.message||e)] });
      return null;
    }
  }, [files]);

  const reset = () => {
    setStarted(false);
    setCurrentNodeId(null);
    setHistory([]);
  };

  const start = () => {
    if (!entryNodeId) { setError('entryNode가 설정되지 않았습니다.'); return; }
    setStarted(true);
    setCurrentNodeId(entryNodeId);
    setHistory([{ id: entryNodeId, at: Date.now() }]);
    setTurn(1);
    setVariables(v => ({ ...v }));
  };

  const step = (nextId) => {
    if (!nextId) return;
    setCurrentNodeId(nextId);
    setHistory(h => [...h, { id: nextId, at: Date.now() }]);
    setTurn(t => t + 1);
  };

  const node = currentNodeId ? graph.nodesById.get(currentNodeId) : null;
  const nextEdges = node ? (graph.outEdges.get(node.id) || []) : [];

  // Compose ctx for hooks
  const hookCtx = useMemo(() => ({
    turn,
    activeRole: 'players',
    variables,
    node,
    files,
  }), [turn, variables, node, files]);

  // Update prompt preview when node or hooks change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!node) { setPromptPreview(''); return; }
        if (worker) {
          try {
            const res = await worker.call('transformPrompt', hookCtx);
            if (cancelled) return;
            if (res && typeof res === 'object' && typeof res.prompt === 'string') setPromptPreview(res.prompt);
            else setPromptPreview(String(res ?? (node?.label || '')));
            return;
          } catch {}
        }
        if (!hooks?.transformPrompt) { setPromptPreview(node?.label || ''); return; }
        const res = await callHookWithTimeout(() => hooks.transformPrompt(hookCtx), 500);
        if (cancelled) return;
        if (res && typeof res === 'object' && typeof res.prompt === 'string') {
          setPromptPreview(res.prompt);
        } else {
          setPromptPreview(String(res ?? (node?.label || '')));
        }
      } catch (e) {
        if (!cancelled) setPromptPreview(`(프롬프트 생성 오류)\n${String(e?.message||e)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [node, hooks, hookCtx]);

  const onUserAct = async () => {
    if (!node) return;
    setBusy(true);
    try {
      let out = null;
      if (worker) {
        try { out = await worker.call('onUserAction', hookCtx, userInput); } catch {}
      }
      if (out == null && hooks?.onUserAction) {
        out = await callHookWithTimeout(() => hooks.onUserAction(hookCtx, userInput), 800);
      }
      if (typeof out === 'string') {
        step(out);
      } else if (out && typeof out === 'object' && out.next) {
        step(out.next);
      }
      setUserInput('');
    } catch (e) {
      console.warn('[Runtime] onUserAction error', e);
    } finally { setBusy(false); }
  };

  const autoSelectNext = async () => {
    if (!node) return;
    setBusy(true);
    try {
      const neighbors = nextEdges.map(e => ({ id: e.target, label: graph.nodesById.get(e.target)?.label, type: graph.nodesById.get(e.target)?.type }));
      let out = null;
      if (worker) {
        try { out = await worker.call('selectNext', hookCtx, neighbors); } catch {}
      }
      if (out == null && hooks?.selectNext) {
        out = await callHookWithTimeout(() => hooks.selectNext(hookCtx, neighbors), 500);
      }
      if (out) step(out);
    } catch (e) {
      console.warn('[Runtime] selectNext error', e);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, padding:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:600 }}>Runtime Preview</div>
        <div style={{ opacity:0.7, fontSize:12 }}>/graph/prompt-graph.json · read-only</div>
      </div>
      {error ? (
        <div style={{ color:'#ef4444' }}>{error}</div>
      ) : null}

      {!started ? (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontSize:14 }}>Entry Node:</div>
          <select value={entryNodeId || ''} onChange={()=>{}} disabled style={{ padding:'4px 6px' }}>
            {(graph.nodes || []).map(n => (
              <option key={n.id} value={n.id}>{n.label || n.id}</option>
            ))}
          </select>
          <button onClick={start} style={btn()}>시작</button>
        </div>
      ) : (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={reset} style={btn('ghost')}>리셋</button>
        </div>
      )}

      <div style={{ border:'1px solid #334155', borderRadius:8, padding:12 }}>
        <div style={{ marginBottom:8, display:'flex', justifyContent:'space-between' }}>
          <div style={{ fontWeight:600 }}>현재 노드</div>
          <div style={{ opacity:0.7 }}>{currentNodeId || '(미시작)'}</div>
        </div>
        {node ? (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={subhead()}>정보</div>
              <div style={mono()}>id: {node.id}</div>
              <div style={mono()}>type: {node.type || 'ai'}</div>
              <div style={{ whiteSpace:'pre-wrap', marginTop:8 }}>{node.label || ''}</div>
              <div style={{ marginTop:12 }}>
                <div style={subhead()}>프롬프트 미리보기</div>
                <pre style={{ ...mono(), whiteSpace:'pre-wrap', background:'#0b1220', padding:8, borderRadius:6, border:'1px solid #334155', maxHeight:240, overflow:'auto' }}>{promptPreview}</pre>
              </div>
              <div style={{ marginTop:12, display:'flex', gap:6 }}>
                <input value={userInput} onChange={e=>setUserInput(e.target.value)} placeholder="사용자 입력" style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid #334155', background:'#0b1220', color:'#cbd5e1' }} />
                <button onClick={onUserAct} disabled={busy} style={btn('secondary')}>입력 처리</button>
              </div>
            </div>
            <div>
              <div style={subhead()}>다음 이동</div>
              {nextEdges.length ? (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {nextEdges.map((e, i) => (
                    <button key={i} style={btn('secondary')} onClick={() => step(e.target)}>
                      → {e.label || e.target}
                    </button>
                  ))}
                  {hooks?.selectNext ? (
                    <button style={btn()} onClick={autoSelectNext} disabled={busy}>AI로 선택</button>
                  ) : null}
                </div>
              ) : (
                <div style={{ opacity:0.7 }}>다음 간선이 없습니다.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ opacity:0.7 }}>시작을 누르면 실행이 시작됩니다.</div>
        )}
      </div>

      <div style={{ border:'1px dashed #334155', borderRadius:8, padding:12 }}>
        <div style={{ fontWeight:600, marginBottom:8 }}>히스토리</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {history.map((h, i) => (
            <span key={i} style={{ fontFamily:'monospace', fontSize:12, padding:'2px 6px', border:'1px solid #334155', borderRadius:6 }}>
              {h.id}
            </span>
          ))}
        </div>
      </div>

      <div style={{ border:'1px dashed #334155', borderRadius:8, padding:12 }}>
        <div style={{ fontWeight:600, marginBottom:8 }}>Hooks 상태</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, opacity:0.8 }}>{hookInfo.loaded ? '로드됨' : '미로드'}</span>
          {hookInfo.errors?.length ? (
            <span style={{ color:'#ef4444', fontSize:12 }}>{hookInfo.errors[0]}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function btn(variant = 'primary') {
  if (variant === 'ghost') return { padding:'6px 10px', borderRadius:6, background:'transparent', color:'#cbd5e1', border:'1px solid #334155' };
  if (variant === 'secondary') return { padding:'6px 10px', borderRadius:6, background:'#0b1220', color:'#cbd5e1', border:'1px solid #334155', textAlign:'left' };
  return { padding:'6px 10px', borderRadius:6, background:'#1e293b', color:'#e2e8f0', border:'1px solid #334155' };
}

function subhead() { return { fontWeight:600, marginBottom:6, fontSize:13, opacity:0.9 }; }
function mono() { return { fontFamily:'monospace', fontSize:12, opacity:0.9 } }
