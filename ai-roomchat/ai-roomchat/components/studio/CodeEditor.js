"use client";

import { useEffect, useRef, useState } from 'react';

const MONACO_PATH = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
let monacoInitPromise = null;

async function ensureMonaco() {
  if (typeof window === 'undefined') return null;
  const w = window;
  // Minimal process shim for browser environments where some libs expect it
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
      script.onerror = () => reject(new Error('Failed to load Monaco loader script'));
      document.head.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });

  return monacoInitPromise;
}

export default function CodeEditor({ value, onChange, debounceMs = 250 }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const debounceRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    const init = async () => {
      if (disposed || !containerRef.current) return;
      try {
        const monaco = await ensureMonaco();
        if (!monaco || !monaco.editor) throw new Error('Monaco not available');
      } catch (e) {
        setFallback(true);
        return;
      }
      if (disposed || !containerRef.current) return;
      const editor = window.monaco.editor.create(containerRef.current, {
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
