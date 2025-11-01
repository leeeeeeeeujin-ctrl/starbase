import React, { useEffect, useRef } from 'react';
import { loader } from '@monaco-editor/loader';

// Configure Monaco via CDN AMD loader to avoid bundling CSS from node_modules
if (typeof window !== 'undefined' && loader && typeof loader.config === 'function') {
  try {
    loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  } catch {}
}

export default function EditorMonaco({ value, onChange, language = 'json', theme = 'vs-dark', height = '100%', width = '100%' }) {
  const ref = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      const monaco = await loader.init();
      monacoInstance = monaco;
      if (disposed || !ref.current) return;
      const editor = monaco.editor.create(ref.current, {
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

  return <div ref={ref} style={{ height, width }} />;
}

