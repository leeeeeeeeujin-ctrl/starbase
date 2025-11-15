import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight, Monaco-free code editor for the root ai-roomchat app.
 *
 * 기능:
 * - 줄 번호 표시
 * - 간단한 문법 하이라이트(문자열/주석/숫자 정도)
 * - 다크 테마 색상
 * - 자동 들여쓰기(Enter), 블록 들여쓰기/내어쓰기(Tab / Shift+Tab)
 * - Ctrl/Cmd+S → onSave 콜백 호출
 *
 * props:
 * - value: string
 * - onChange(next: string)
 * - language: 'javascript' | 'json' | 기타 (기타는 기본 텍스트로 처리)
 * - theme, height, width: 스타일용(지금은 height/width만 사용)
 * - onSave?: () => void
 */
export default function EditorMonaco(props) {
  const {
    value,
    onChange,
    language = 'javascript',
    theme = 'vs-dark', // reserved for 미래 확장
    height = '100%',
    width = '100%',
    onSave,
  } = props;

  const [internalValue, setInternalValue] = useState(typeof value === 'string' ? value : '');
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const highlightRef = useRef(null);

  // 외부 value 변경 → 내부에 반영 (단, 이미 동일하면 무시)
  useEffect(() => {
    if (typeof value === 'string' && value !== internalValue) {
      setInternalValue(value);
    }
  }, [value, internalValue]);

  const applyChange = (nextText, nextSelectionStart, nextSelectionEnd) => {
    setInternalValue(nextText);
    if (onChange) {
      onChange(nextText);
    }
    if (typeof nextSelectionStart === 'number' && typeof nextSelectionEnd === 'number') {
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.selectionStart = nextSelectionStart;
        ta.selectionEnd = nextSelectionEnd;
      });
    }
  };

  const handleChange = (event) => {
    const next = event.target.value;
    applyChange(next, event.target.selectionStart, event.target.selectionEnd);
  };

  const handleKeyDown = (event) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const text = ta.value;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // Ctrl/Cmd + S → onSave
    if ((event.key === 's' || event.key === 'S') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (onSave) {
        try {
          onSave();
        } catch {
          // ignore save errors here; 상위에서 처리
        }
      }
      return;
    }

    // Tab / Shift+Tab → 블록 들여쓰기/내어쓰기
    if (event.key === 'Tab') {
      event.preventDefault();
      const startLineStart = text.lastIndexOf('\n', start - 1) + 1;
      const endLineEndIndex = (() => {
        const idx = text.indexOf('\n', end);
        return idx === -1 ? text.length : idx;
      })();
      const block = text.slice(startLineStart, endLineEndIndex);
      const lines = block.split('\n');

      if (event.shiftKey) {
        // 내어쓰기: 각 줄 앞의 공백 1~2칸 또는 탭 1개 제거
        let removedFirst = 0;
        let removedTotal = 0;
        const outLines = lines.map((line, idx) => {
          if (line.startsWith('  ')) {
            removedTotal += 2;
            if (idx === 0) removedFirst = 2;
            return line.slice(2);
          }
          if (line.startsWith('\t')) {
            removedTotal += 1;
            if (idx === 0) removedFirst = 1;
            return line.slice(1);
          }
          return line;
        });
        const newBlock = outLines.join('\n');
        const newText = text.slice(0, startLineStart) + newBlock + text.slice(endLineEndIndex);
        const newStart = Math.max(start - removedFirst, startLineStart);
        const newEnd = Math.max(end - removedTotal, newStart);
        applyChange(newText, newStart, newEnd);
      } else {
        // 들여쓰기: 각 줄 앞에 공백 2칸 추가
        const outLines = lines.map((line) => `  ${line}`);
        const newBlock = outLines.join('\n');
        const newText = text.slice(0, startLineStart) + newBlock + text.slice(endLineEndIndex);
        const linesCount = lines.length;
        const newStart = start + 2;
        const newEnd = end + 2 * linesCount;
        applyChange(newText, newStart, newEnd);
      }
      return;
    }

    // Enter → 자동 들여쓰기
    if (event.key === 'Enter') {
      event.preventDefault();
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const linePrefix = text.slice(lineStart, start);
      const indentMatch = linePrefix.match(/^[\t ]*/);
      const indent = indentMatch ? indentMatch[0] : '';
      const insert = `\n${indent}`;
      const newText = text.slice(0, start) + insert + text.slice(end);
      const caret = start + insert.length;
      applyChange(newText, caret, caret);
      return;
    }
  };

  const handleScroll = (event) => {
    const scrollTop = event.target.scrollTop || 0;
    try {
      if (highlightRef.current) {
        highlightRef.current.style.transform = `translateY(${-scrollTop}px)`;
      }
      if (gutterRef.current) {
        gutterRef.current.style.transform = `translateY(${-scrollTop}px)`;
      }
    } catch {
      // ignore scroll sync errors
    }
  };

  // 줄 번호 계산
  const lineCount = internalValue ? internalValue.split('\n').length : 1;
  const lineNumbers = [];
  for (let i = 1; i <= lineCount; i += 1) {
    lineNumbers.push(String(i));
  }

  // 간단한 문법 하이라이트 (문자열/주석/숫자)
  const highlightedHtml = highlightCode(internalValue, language);

  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        backgroundColor: '#020617',
        border: '1px solid #1e293b',
        borderRadius: 4,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 13,
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
      className="nokey"
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 48,
          padding: '4px 4px',
          borderRight: '1px solid #1e293b',
          boxSizing: 'border-box',
          textAlign: 'right',
          color: '#64748b',
          overflow: 'hidden',
        }}
      >
        <pre
          ref={gutterRef}
          style={{
            margin: 0,
            whiteSpace: 'pre',
            lineHeight: '1.4',
          }}
        >
          {lineNumbers.join('\n')}
        </pre>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 48,
          right: 0,
        }}
      >
        <pre
          ref={highlightRef}
          aria-hidden="true"
          style={{
            margin: 0,
            padding: '4px 8px',
            whiteSpace: 'pre',
            lineHeight: '1.4',
            color: '#e2e8f0',
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
        <textarea
          ref={textareaRef}
          value={internalValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            margin: 0,
            padding: '4px 8px',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            color: 'transparent',
            caretColor: '#e5e7eb',
            font: 'inherit',
            lineHeight: '1.4',
            whiteSpace: 'pre',
            overflow: 'auto',
          }}
        />
      </div>
    </div>
  );
}

function escapeHtml(input) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightCode(code, language) {
  if (!code) return '';
  const lang = String(language || '').toLowerCase();
  if (lang === 'json') {
    return highlightJson(code);
  }
  // 기본은 JS 스타일
  return highlightJsLike(code);
}

function highlightJson(code) {
  const out = [];
  let i = 0;
  const length = code.length;

  while (i < length) {
    const ch = code[i];
    // 문자열 (JSON은 "..." 만 허용)
    if (ch === '"') {
      const start = i;
      i += 1;
      let escaped = false;
      while (i < length) {
        const c = code[i];
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      const text = code.slice(start, i);
      out.push(span(text, '#f97316'));
      continue;
    }

    // 숫자
    if (/[0-9\-]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < length && /[0-9.eE\+]/.test(code[i])) i += 1;
      const text = code.slice(start, i);
      out.push(span(text, '#facc15'));
      continue;
    }

    // true / false / null
    if (/[a-zA-Z]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < length && /[a-zA-Z]/.test(code[i])) i += 1;
      const text = code.slice(start, i);
      const color = /^(true|false|null)$/.test(text) ? '#facc15' : '#e2e8f0';
      out.push(span(text, color));
      continue;
    }

    // 기타 기호/공백
    out.push(escapeHtml(ch));
    i += 1;
  }

  return out.join('');
}

function highlightJsLike(code) {
  const out = [];
  let i = 0;
  const length = code.length;

  while (i < length) {
    const ch = code[i];
    const next = code[i + 1];

    // 한 줄 주석 //
    if (ch === '/' && next === '/') {
      const start = i;
      i += 2;
      while (i < length && code[i] !== '\n') i += 1;
      const text = code.slice(start, i);
      out.push(span(text, '#6b7280'));
      continue;
    }

    // 문자열 '...' 또는 "..." 또는 `...`
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const start = i;
      i += 1;
      let escaped = false;
      while (i < length) {
        const c = code[i];
        if (escaped) {
          escaped = false;
        } else if (c === '\\') {
          escaped = true;
        } else if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      const text = code.slice(start, i);
      out.push(span(text, '#f97316'));
      continue;
    }

    // 숫자
    if (/[0-9]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < length && /[0-9._eE]/.test(code[i])) i += 1;
      const text = code.slice(start, i);
      out.push(span(text, '#facc15'));
      continue;
    }

    // 식별자/키워드
    if (/[a-zA-Z_$]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < length && /[a-zA-Z0-9_$]/.test(code[i])) i += 1;
      const text = code.slice(start, i);
      const keyword = /\b(function|return|if|else|for|while|const|let|var|export|import|from|async|await|switch|case|break|continue|try|catch|finally|throw|new)\b/.test(
        text,
      );
      const boolOrNull = /^(true|false|null|undefined)$/.test(text);
      let color = '#e2e8f0';
      if (keyword) color = '#38bdf8';
      else if (boolOrNull) color = '#facc15';
      out.push(span(text, color));
      continue;
    }

    // 기타 (공백/기호)
    out.push(escapeHtml(ch));
    i += 1;
  }

  return out.join('');
}

function span(text, color) {
  return `<span style="color:${color}">${escapeHtml(text)}</span>`;
}

