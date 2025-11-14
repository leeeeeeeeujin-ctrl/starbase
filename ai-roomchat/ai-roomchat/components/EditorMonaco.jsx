"use client";

import React, { useEffect, useRef, useState, memo } from 'react';
import { isDebugEditor, dbg } from '@/lib/debug/debugFlag';

// Centralised Monaco loader that mirrors the manual AMD loader flow.
// Avoids relying on @monaco-editor/loader, which can be sensitive to env/polyfills.
const MONACO_PATH = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let monacoInitPromise = null;

async function ensureMonaco() {
  if (typeof window === 'undefined') return null;
  const w = window;
  // Minimal process shim for libraries that expect Node-style globals in browser
  try {
    if (!w.process) {
      w.process = { env: {} };
    } else if (!w.process.env) {
      w.process.env = {};
    }
  } catch {}
  if (w.monaco && w.monaco.editor) return w.monaco;
  if (monacoInitPromise) return monacoInitPromise;

  monacoInitPromise = new Promise((resolve, reject) => {
    try {
      const done = () => {
        try {
          if (!w.require || typeof w.require.config !== 'function') {
            throw new Error('Monaco AMD loader not available');
          }
          try {
            w.require.config({ paths: { vs: MONACO_PATH } });
          } catch {}
          w.require(['vs/editor/editor.main'], () => {
            if (w.monaco && w.monaco.editor) {
              resolve(w.monaco);
            } else {
              reject(new Error('Monaco editor namespace missing'));
            }
          }, reject);
        } catch (e) {
          reject(e);
          }
      };

      const existing = document.getElementById('monaco-amd-loader');
      if (existing) {
        // If loader script is already loaded and AMD loader is ready, run immediately.
        if (w.require && typeof w.require.config === 'function') {
          done();
        } else {
          existing.addEventListener('load', () => done(), { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.id = 'monaco-amd-loader';
      script.src = `${MONACO_PATH}/loader.js`;
      script.async = true;
      script.onload = () => done();
      script.onerror = event => {
        reject(new Error('Failed to load Monaco loader script'));
      };
      document.head.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });

  try {
    return await monacoInitPromise;
  } catch (error) {
    // Keep the failed promise so subsequent callers also fail fast;
    // callers decide whether to fall back.
    if (isDebugEditor()) dbg('[Monaco] ensureMonaco failed', { error: String(error && error.message || error) });
    throw error;
  }
}

function EditorMonacoInner({ value, onChange, language = 'json', theme = 'vs-dark', height = '100%', width = '100%', currentPath = null }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const applyTimer = useRef(null);
  const changeCounterRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const init = async () => {
      try {
        const monaco = await ensureMonaco();
        if (!monaco || !monaco.editor) throw new Error('Monaco not available');
      } catch (e) {
        if (isDebugEditor()) dbg('[Monaco] init failed, falling back', { error: String(e && e.message || e), path: currentPath });
        setFallback(true);
        return;
      }
      if (disposed || !ref.current) return;
      const editor = window.monaco.editor.create(ref.current, {
        value: value ?? '',
        language,
        automaticLayout: true,
        theme,
        minimap: { enabled: false },
        wordWrap: 'on',
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        if (typeof onChange === 'function') onChange(editor.getValue());
        try {
          if (isDebugEditor()) {
            changeCounterRef.current++;
            if (changeCounterRef.current % 10 === 1) dbg('[Monaco] onDidChangeModelContent', { count: changeCounterRef.current, path: currentPath });
          }
        } catch {}
      });
      // expose current selection for AI chat (optional)
      try {
        editor.onDidChangeCursorSelection(() => {
          try {
            const sel = editor.getSelection();
            let text = '';
            if (sel) {
              const model = editor.getModel();
              text = model.getValueInRange(sel) || '';
            }
            if (typeof window !== 'undefined') {
              window.__VFS_ACTIVE_SELECTION__ = { path: currentPath, text, ts: Date.now() };
            }
          } catch {}
        });
      } catch {}
    };
    if (isDebugEditor()) dbg('[Monaco] init', { path: currentPath, lang: language });
    init();
    return () => {
      disposed = true;
      try { editorRef.current?.dispose(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    if (applyTimer.current) clearTimeout(applyTimer.current);
    // 외부 값 반영 디바운스(깜빡임 완화 + 커서 보존 + 최소 패치)
    applyTimer.current = setTimeout(() => {
      try {
        const editor = editorRef.current;
        const model = editor.getModel();
        const next = typeof value === 'string' ? value : '';
        const cur = model ? model.getValue() : '';
        if (model && next !== cur) {
          if (isDebugEditor()) dbg('[Monaco] external patch', { fromLen: cur.length, toLen: next.length, path: currentPath });
          const prevSel = editor.getSelection();
          // 최소 차이 패치: 공통 접두/접미를 제외한 중앙만 치환
          let start = 0;
          const a = cur.length, b = next.length;
          while (start < a && start < b && cur.charCodeAt(start) === next.charCodeAt(start)) start++;
          let endA = a - 1, endB = b - 1;
          while (endA >= start && endB >= start && cur.charCodeAt(endA) === next.charCodeAt(endB)) { endA--; endB--; }
          const replaceText = next.slice(start, endB + 1);
          const startPos = model.getPositionAt(start);
          const endPos = model.getPositionAt(endA + 1);
          editor.pushUndoStop();
          editor.executeEdits('external', [{ range: { startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column }, text: replaceText }]);
          editor.pushUndoStop();
          if (prevSel) {
            try { editor.setSelection(prevSel); } catch {}
          }
        }
      } catch {}
    }, 150);
    return () => { if (applyTimer.current) clearTimeout(applyTimer.current); };
  }, [value]);

  if (fallback) {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={e => typeof onChange === 'function' && onChange(e.target.value)}
        style={{ height, width, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}
      />
    );
  }
  return <div ref={ref} style={{ height, width }} />;
}

function propsEqual(a, b){
  return (
    a.value === b.value &&
    a.language === b.language &&
    a.theme === b.theme &&
    a.height === b.height &&
    a.width === b.width &&
    a.currentPath === b.currentPath &&
    a.onChange === b.onChange
  );
}

export default memo(EditorMonacoInner, propsEqual);
