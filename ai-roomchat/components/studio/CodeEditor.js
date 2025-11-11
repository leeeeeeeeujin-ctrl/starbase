"use client";

import { useEffect, useRef, useState } from 'react';

import { initMonaco } from '@/lib/monaco/loaderClient';

export default function CodeEditor({ value, onChange, debounceMs = 250 }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const debounceRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      if (disposed || !containerRef.current) return;
      try {
        const monaco = await initMonaco();
        monacoInstance = monaco;
      } catch (e) {
        setFallback(true);
        return;
      }
      if (disposed || !containerRef.current) return;
      const editor = monacoInstance.editor.create(containerRef.current, {
        value: value ?? '{\n  "name": "template"\n}',
        language: 'json',
        automaticLayout: true,
        theme: 'vs-dark',
        minimap: { enabled: false },
        wordWrap: 'on',
      });
      editorRef.current = editor;
      editor.onDidChangeModelContent(() => {
        if (typeof onChange === 'function') {
          const next = editor.getValue();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => onChange(next), debounceMs);
        }
      });
    };
    init();
    return () => {
      disposed = true;
      if (editorRef.current && monacoInstance) {
        try { editorRef.current.dispose(); } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && typeof value === 'string') {
      const model = editorRef.current.getModel();
      if (model && model.getValue() !== value) {
        editorRef.current.pushUndoStop();
        editorRef.current.executeEdits('external', [
          {
            range: model.getFullModelRange(),
            text: value,
          },
        ]);
        editorRef.current.pushUndoStop();
      }
    }
  }, [value]);

  if (fallback) {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={e => typeof onChange === 'function' && onChange(e.target.value)}
        style={{ height: '100%', width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}
      />
    );
  }
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}
