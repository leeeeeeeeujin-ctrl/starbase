"use client";

import React, { useEffect, useRef, useState } from 'react';
import { initMonaco } from '@/lib/monaco/loaderClient';

export default function EditorMonaco({ value, onChange, onSave, language = 'json', theme = 'vs-dark', height = '100%', width = '100%', currentPath = null }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const applyTimer = useRef(null);
  const applyingRef = useRef(false); // prevent feedback loop when applying external value
  const composingRef = useRef(false); // avoid breaking IME composition
  const changeTimerRef = useRef(null); // debounce onChange to reduce churn
  const typingRef = useRef(false); // true while user is actively typing
  const typingTimerRef = useRef(null);
  const lastUserEditAtRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      try {
        const monaco = await initMonaco();
        monacoInstance = monaco;
      } catch (e) {
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
      // Register Ctrl/Cmd+S
      try {
        const KeyMod = monacoInstance?.KeyMod; const KeyCode = monacoInstance?.KeyCode;
        if (KeyMod && KeyCode) {
          editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
            try { if (typeof onSave === 'function') onSave(); } catch {}
          });
        }
      } catch {}
      try { editor.onDidCompositionStart?.(() => { composingRef.current = true; }); } catch {}
      try { editor.onDidCompositionEnd?.(() => { composingRef.current = false; }); } catch {}
      try {
        editor.onKeyDown?.(() => {
          typingRef.current = true;
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => { typingRef.current = false; }, 200);
        });
      } catch {}
      editor.onDidChangeModelContent(() => {
        if (applyingRef.current) return;
        if (composingRef.current) return;
        if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
        const v = editor.getValue();
        lastUserEditAtRef.current = Date.now();
        changeTimerRef.current = setTimeout(() => {
          if (typeof onChange === 'function') onChange(v);
        }, 120);
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
        // Don't patch while user is actively typing or composing to avoid disruption
        if (typingRef.current || composingRef.current) return;
        const next = typeof value === 'string' ? value : '';
        const cur = model ? model.getValue() : '';
        // If user just typed within the last 250ms, skip applying external value to avoid focus/IME disruption
        if (Date.now() - lastUserEditAtRef.current < 250) return;
        if (model && next !== cur) {
          applyingRef.current = true;
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
          // allow content change listeners to run, then release flag
          setTimeout(() => { applyingRef.current = false; }, 0);
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
