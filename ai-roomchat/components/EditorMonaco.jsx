"use client";

import React, { useEffect, useRef, useState } from 'react';
import loader from '@monaco-editor/loader';

// Configure Monaco via CDN AMD loader to avoid bundling CSS from node_modules
if (typeof window !== 'undefined' && loader && typeof loader.config === 'function') {
  try {
    loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  } catch {}
}

export default function EditorMonaco({ value, onChange, language = 'json', theme = 'vs-dark', height = '100%', width = '100%' }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      try {
        const monaco = await loader.init();
        monacoInstance = monaco;
        if (!monaco || !monaco.editor) throw new Error('Monaco not available');
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
      editor.onDidChangeModelContent(() => {
        if (typeof onChange === 'function') onChange(editor.getValue());
      });
    };
    init();
    return () => {
      disposed = true;
      try { editorRef.current?.dispose(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (typeof value === 'string' && model && model.getValue() !== value) {
      editorRef.current.pushUndoStop();
      editorRef.current.executeEdits('external', [{ range: model.getFullModelRange(), text: value }]);
      editorRef.current.pushUndoStop();
    }
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
