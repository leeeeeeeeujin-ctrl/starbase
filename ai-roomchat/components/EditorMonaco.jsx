import { useEffect, useRef, useState } from 'react';
import loader from '@monaco-editor/loader';

/**
 * Lightweight Monaco wrapper for the root ai-roomchat app.
 *
 * - Uses @monaco-editor/loader directly (no @monaco-editor/react dependency).
 * - 절대 throw 하지 않고, 실패 시 텍스트 영역으로 폴백합니다.
 * - value prop이 바뀌면 에디터 내용도 동기화합니다.
 */
export default function EditorMonaco(props) {
  const {
    value,
    onChange,
    language = 'javascript',
    theme = 'vs-dark',
    height = '100%',
    width = '100%',
  } = props;

  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const lastPositionRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const monaco = await loader.init();

        if (cancelled || !containerRef.current) {
          return;
        }

        const editor = monaco.editor.create(containerRef.current, {
          value: typeof value === 'string' ? value : '',
          language,
          theme,
          automaticLayout: true,
          wordWrap: 'on',
          minimap: { enabled: false },
        });

        editorRef.current = editor;
        lastPositionRef.current = editor.getPosition();

        // Ensure editor actually receives keyboard focus on mount.
        try {
          editor.focus();
          // Expose for ad-hoc debugging in devtools if needed.
          if (typeof window !== 'undefined') {
            window.__lastMonacoEditor = editor;
          }
        } catch {
          // ignore focus errors
        }

        let restoringPosition = false;

        editor.onDidChangeCursorPosition((event) => {
          const position = event?.position;
          if (!position) return;

          if (restoringPosition) {
            restoringPosition = false;
            lastPositionRef.current = position;
            return;
          }

          const last = lastPositionRef.current;
          if (
            last &&
            position.lineNumber === 1 &&
            position.column === 1 &&
            (last.lineNumber !== 1 || last.column !== 1)
          ) {
            restoringPosition = true;
            try {
              editor.setPosition(last);
            } catch {
              // ignore cursor restore errors
            }
            return;
          }

          lastPositionRef.current = position;
        });

        editor.onDidChangeModelContent(() => {
          const nextValue = editor.getValue();
          if (onChange) {
            onChange(nextValue);
          }
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[monaco] EditorMonaco loader.init failed', error);
        setFallback(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
    // language/theme은 최초 생성 시에만 사용합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (typeof value !== 'string') return;

    const current = editor.getValue();
    if (current !== value) {
      editor.setValue(value);
    }
  }, [value]);

  if (fallback) {
    return (
      <textarea
        value={value}
        onChange={(event) => {
          if (onChange) {
            onChange(event.target.value);
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          resize: 'none',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 13,
          backgroundColor: '#020617',
          color: '#e2e8f0',
          border: '1px solid #1e293b',
          borderRadius: 4,
          padding: 8,
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
      }}
      className="nokey"
    />
  );
}
