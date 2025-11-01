"use client";
import React, { useEffect, useRef, useState } from "react";

export default function MonacoJsonEditor({ value, onChange, height = 400 }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const monaco = await import("monaco-editor/esm/vs/editor/editor.api");
        if (!mounted) return;
        monacoRef.current = monaco;
        // Load schema for validation
        try {
          const resp = await fetch("/templates/template.schema.json");
          if (resp.ok) {
            const schema = await resp.json();
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
              validate: true,
              allowComments: false,
              schemas: [
                {
                  uri: "inmemory://template.schema.json",
                  fileMatch: ["*"],
                  schema,
                },
              ],
            });
          }
        } catch {}

        const uri = monaco.Uri.parse("inmemory://template.json");
        const model = monaco.editor.createModel(value || "", "json", uri);
        const editor = monaco.editor.create(containerRef.current, {
          model,
          language: "json",
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: 2,
          renderWhitespace: "selection",
        });
        editorRef.current = editor;
        const sub = editor.onDidChangeModelContent(() => {
          try {
            const v = editor.getModel().getValue();
            onChange && onChange(v);
          } catch {}
        });
        setReady(true);
        return () => {
          try { sub && sub.dispose(); } catch {}
        };
      } catch (e) {
        // Failed to load monaco; keep fallback disabled
        // eslint-disable-next-line no-console
        console.warn("Monaco failed to load:", e && e.message);
      }
    })();
    return () => {
      mounted = false;
      try {
        if (editorRef.current) {
          const model = editorRef.current.getModel();
          editorRef.current.dispose();
          if (model) model.dispose();
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    // external value updates
    try {
      if (ready && editorRef.current) {
        const model = editorRef.current.getModel();
        const current = model.getValue();
        if (value != null && value !== current) {
          model.pushEditOperations([], [
            { range: model.getFullModelRange(), text: value }
          ], () => null);
        }
      }
    } catch {}
  }, [value, ready]);

  return (
    <div ref={containerRef} style={{ width: "100%", height, border: "1px solid #ddd", borderRadius: 4 }} />
  );
}

