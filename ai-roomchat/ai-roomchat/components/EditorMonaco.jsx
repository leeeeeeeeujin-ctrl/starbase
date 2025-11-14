"use client";

import React, { useEffect, useRef, useState } from 'react';
import loader from '@monaco-editor/loader';

// Configure Monaco via CDN AMD loader to avoid bundling CSS from node_modules
if (typeof window !== 'undefined' && loader && typeof loader.config === 'function') {
  try {
    loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  } catch {}
}

export default function EditorMonaco({ value, onChange, language = 'json', theme = 'vs-dark', height = '100%', width = '100%', currentPath = null }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const applyTimer = useRef(null);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      if (disposed || !ref.current) return;
      try {
        const monaco = await loader.init();
        monacoInstance = monaco;
        if (!monaco || !monaco.editor) throw new Error('Monaco not available');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[monaco] EditorMonaco loader.init failed', e);
        setFallback(true);
        return;
      }
      if (disposed || !ref.current) return;
      const editor = monacoInstance.editor.create(ref.current, {
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
