import { useEffect, useRef } from 'react';
import { loader } from '@monaco-editor/loader';

// Configure Monaco via CDN paths (prevents Next from bundling monaco's CSS)
if (typeof window !== 'undefined' && loader && typeof loader.config === 'function') {
  try {
    loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  } catch {}
}

export default function CodeEditor({ value, onChange, debounceMs = 250 }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let monacoInstance;
    const init = async () => {
      if (disposed || !containerRef.current) return;
      const monaco = await loader.init();
      monacoInstance = monaco;
      if (disposed || !containerRef.current) return;
      const editor = monaco.editor.create(containerRef.current, {
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

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useTemplate } from '../../contexts/TemplateStore';
import loader from '@monaco-editor/loader';

const CodeEditor = () => {
  const { template, updateTemplate } = useTemplate();
  const [editor, setEditor] = useState(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current) {
      loader.init().then(monaco => {
        const editorInstance = monaco.editor.create(editorRef.current, {
          language: 'json',
          value: JSON.stringify(template, null, 2),
          automaticLayout: true,
        });

        editorInstance.onDidChangeModelContent(() => {
          try {
            const updatedTemplate = JSON.parse(editorInstance.getValue());
            updateTemplate(updatedTemplate);
          } catch (error) {
            // Ignore JSON parsing errors during typing
          }
        });

        setEditor(editorInstance);
      });
    }

    return () => {
      editor?.dispose();
    };
  }, [editorRef.current]);

  useEffect(() => {
    // Update editor content if template changes from another source (like NodeEditor)
    if (editor && template && JSON.stringify(template, null, 2) !== editor.getValue()) {
        editor.setValue(JSON.stringify(template, null, 2));
    }
  }, [template, editor]);

  return <div ref={editorRef} style={{ height: '80vh', width: '100%' }} />;
};

export default CodeEditor;
