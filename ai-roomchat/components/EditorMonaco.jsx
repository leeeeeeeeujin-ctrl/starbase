import { useEffect, useRef, useState } from 'react';
import loader from '@monaco-editor/loader';
import { isWorkspaceDebug } from '../lib/workspace/debugFlags.js';

/**
 * Monaco 기반 코드 에디터 래퍼.
 *
 * - @monaco-editor/loader 를 사용해 브라우저에서만 Monaco를 로드합니다.
 * - value/onChange 로 단방향 바인딩을 유지합니다.
 * - Ctrl/Cmd+S 로 onSave 콜백을 호출할 수 있습니다(선택적).
 * - 실패 시 간단한 textarea 폴백을 제공합니다.
 */
export default function EditorMonaco(props) {
  const {
    value,
    onChange,
    language = 'javascript',
    theme = 'vs-dark',
    height = '100%',
    width = '100%',
    onSave,
    currentPath,
  } = props;

  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const lastPathRef = useRef(currentPath || null);

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

        // 기본 포커스 + 디버그용 노출
        try {
          editor.focus();
          if (typeof window !== 'undefined') {
            window.__lastMonacoEditor = editor;
          }
        } catch {
          // ignore focus errors
        }

        // Ctrl/Cmd + S -> onSave 콜백
        if (onSave) {
          try {
            editor.addCommand(
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
              () => {
                try {
                  onSave();
                } catch {
                  // ignore save errors
                }
              },
            );
          } catch {
            // ignore command errors
          }
        }

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

    if (isWorkspaceDebug()) {
      try {
        // Initial mount log to correlate with dispose/rollback events.
        // currentPath is captured from initial props.
        console.log('[EditorMonaco] mount', { path: currentPath || null });
      } catch {
        // ignore log errors
      }
    }

    init();

    return () => {
      cancelled = true;
      if (isWorkspaceDebug()) {
        try {
          console.log('[EditorMonaco] unmount', { path: currentPath || null });
        } catch {
          // ignore log errors
        }
      }
      if (editorRef.current) {
        try {
          editorRef.current.dispose();
        } catch {
          // ignore dispose errors
        }
        editorRef.current = null;
      }
    };
    // language/theme은 최초 생성 시에만 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 value 변경 -> 에디터 내용 동기화
  // 단, 같은 파일(currentPath)에서의 실시간 편집은 Monaco 내부 상태를 신뢰하고
  // 파일 전환 시에만 setValue를 호출해 커서 점프를 방지한다.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (typeof value !== 'string') return;

    const path = currentPath || null;
    if (path && path !== lastPathRef.current) {
      const next = value;
      const current = editor.getValue();
      if (current !== next) {
        if (isWorkspaceDebug()) {
          try {
            console.log('[EditorMonaco] external setValue', {
              fromPath: lastPathRef.current || null,
              toPath: path,
              beforeLength: current.length,
              afterLength: next.length,
            });
          } catch {
            // ignore
          }
        }
        editor.setValue(next);
      }
      lastPathRef.current = path;
    }
  }, [value, currentPath]);

  if (fallback) {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
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
