"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getCodeContext, buildSystemPromptFromContext } from '../../lib/workspace/ai/getCodeContext.js';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { useAiChatSessions } from './hooks/useAiChatSessions';
import { useSupabaseSessionToken } from './hooks/useSupabaseSessionToken';

const MAX_SNIPPET_CHARS = 800;
const MODE_STORAGE_KEY = 'workspace:aiChat:panelMode';

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const textPart = parts.find((p) => typeof p?.text === 'string');
    if (textPart?.text) return textPart.text.trim();
  }
  const text = payload?.generated_text || payload?.output || payload?.text;
  if (typeof text === 'string') return text.trim();
  return '';
}

function summarizeWorkspace(files, activePath) {
  const entries = Object.entries(files || {}).filter(([, meta]) => !meta?.dir);
  const important = entries
    .sort((a, b) => (a[0] === activePath ? -1 : b[0] === activePath ? 1 : a[0].localeCompare(b[0])))
    .slice(0, 4);

  const snippets = important.map(([path, meta]) => {
    const text = typeof meta?.content === 'string' ? meta.content : '';
    const snippet = text.slice(0, MAX_SNIPPET_CHARS);
    return `파일: ${path}\n${snippet}${text.length > MAX_SNIPPET_CHARS ? '\n… (생략됨)' : ''}`;
  });

  return snippets.join('\n\n');
}

export default function AIChatDock({ onClose }) {
  const { files = {}, activePath } = useWorkspace();
  const {
    sessions,
    currentId,
    currentSession,
    logs,
    setCurrentId,
    append,
    startNewChat,
    deleteSession,
  } = useAiChatSessions();
  const { token: sessionToken, refresh: refreshSessionToken } = useSupabaseSessionToken();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [contextText, setContextText] = useState('');
  const [contextLoading, setContextLoading] = useState(true);
  const [panelMode, setPanelMode] = useState(() => {
    if (typeof window === 'undefined') return 'window';
    return window.localStorage.getItem(MODE_STORAGE_KEY) === 'fullscreen' ? 'fullscreen' : 'window';
  });

  const logRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ctx = await getCodeContext();
        if (!mounted) return;
        const sys = buildSystemPromptFromContext(ctx);
        setContextText(sys);
      } catch (e) {
        if (mounted) setContextText('당신은 워크스페이스에서 코드를 도와주는 파트너입니다.');
      } finally {
        if (mounted) setContextLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!logRef.current) return;
    try {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    } catch {}
  }, [logs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODE_STORAGE_KEY, panelMode);
  }, [panelMode]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const getSessionToken = useCallback(
    async (options = {}) => {
      const { optional = false } = options;
      if (sessionToken) return sessionToken;
      const refreshed = await refreshSessionToken();
      if (!optional && !refreshed) throw new Error('Supabase 세션이 필요합니다.');
      return refreshed;
    },
    [sessionToken, refreshSessionToken]
  );

  const activeFileSummary = useMemo(() => summarizeWorkspace(files, activePath), [files, activePath]);

  const composePrompt = useMemo(() => {
    const header = contextText || '당신은 워크스페이스에서 코드를 도와주는 파트너입니다.';
    return `${header}\n\n--- 작업 파일 요약 ---\n${activeFileSummary || '(열린 파일 없음)'}`;
  }, [contextText, activeFileSummary]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    setSending(true);
    setError(null);
    append('user', trimmed);
    try {
      const token = await getSessionToken();
      const payload = {
        prefer: 'keyring',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${composePrompt}\n\n<<사용자 요청>>\n${trimmed}`,
              },
            ],
          },
        ],
      };
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'AI 응답을 받지 못했습니다.');
      }
      const text = extractGeminiText(data.data) || '(비어 있음)';
      append('assistant', text);
    } catch (e) {
      const message = e?.message || '요청을 처리하지 못했습니다.';
      setError(message);
      append('error', message);
    } finally {
      setSending(false);
    }
  }, [append, composePrompt, getSessionToken, input, sessionToken]);

  const handleInsertActiveFile = useCallback(() => {
    if (!activePath) return;
    const snippet = typeof files[activePath]?.content === 'string'
      ? files[activePath].content.slice(0, MAX_SNIPPET_CHARS)
      : '';
    setInput((prev) => `${prev ? `${prev}\n\n` : ''}[파일: ${activePath}]\n${snippet}`);
  }, [activePath, files]);

  const handleInputKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const toggleMode = () => {
    setPanelMode((prev) => (prev === 'window' ? 'fullscreen' : 'window'));
  };

  const refreshContext = async () => {
    setContextLoading(true);
    try {
      const ctx = await getCodeContext();
      const sys = buildSystemPromptFromContext(ctx);
      setContextText(sys);
    } catch {
      setContextText('당신은 워크스페이스에서 코드를 도와주는 파트너입니다.');
    } finally {
      setContextLoading(false);
    }
  };

  const currentLogs = logs || [];

  return (
    <div style={styles.backdrop}>
      <div
        style={panelMode === 'fullscreen' ? styles.panelFullscreen : styles.panelWindow}
      >
        <header style={styles.header}>
          <div>
            <div style={styles.title}>AI 코드 채팅</div>
            <div style={styles.subtitle}>
              {activePath ? `현재 파일: ${activePath}` : '열린 파일이 없습니다'}
            </div>
          </div>
          <div style={styles.headerActions}>
            <button type="button" style={styles.iconButton} onClick={toggleMode}>
              {panelMode === 'fullscreen' ? '창 모드' : '전체 화면'}
            </button>
            <button type="button" style={styles.iconButton} onClick={onClose}>
              닫기
            </button>
          </div>
        </header>

        <section style={styles.body}>
          <div style={styles.sessionRow}>
            <label style={styles.sessionLabel}>
              대화 선택
              <select
                value={currentId || ''}
                onChange={(e) => setCurrentId(e.target.value)}
                style={styles.sessionSelect}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title || '제목 없음'}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={styles.secondaryButton} onClick={startNewChat}>
                새 대화
              </button>
              {currentSession && currentSession.logs?.length > 0 && (
                <button
                  type="button"
                  style={styles.dangerButton}
                  onClick={() => deleteSession(currentSession.id)}
                >
                  대화 삭제
                </button>
              )}
            </div>
          </div>

          <div style={styles.infoRow}>
            <button type="button" style={styles.secondaryButton} onClick={handleInsertActiveFile}>
              현재 파일 요약 붙여넣기
            </button>
            <button type="button" style={styles.secondaryButton} onClick={refreshContext}>
              {contextLoading ? '맥락 불러오는 중...' : '맥락 새로고침'}
            </button>
          </div>

          {error && <div style={styles.errorBanner}>{error}</div>}

          <div ref={logRef} style={styles.logArea}>
            <ChatLog logs={currentLogs} />
          </div>

          <div style={styles.inputArea}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="도움이 필요한 내용을 입력하고 Shift+Enter로 줄바꿈하세요"
              style={styles.textInput}
            />
            <div style={styles.inputFooter}>
              <span style={styles.hintText}>Enter 전송 / Shift+Enter 줄바꿈</span>
              <button
                type="button"
                style={styles.primaryButton(sending || !input.trim())}
                onClick={handleSend}
                disabled={sending || !input.trim()}
              >
                {sending ? '전송 중...' : '보내기'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ChatLog({ logs }) {
  if (!logs.length) {
    return <div style={styles.emptyState}>아직 메시지가 없습니다.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {logs.map((entry) => (
        <ChatBubble key={`${entry.role}-${entry.t}`} entry={entry} />
      ))}
    </div>
  );
}

function ChatBubble({ entry }) {
  const { role, msg } = entry;
  const text = typeof msg === 'string' ? msg : msg?.text || msg?.message || '';
  let bubbleStyle = styles.bubbleUser;
  if (role === 'assistant') bubbleStyle = styles.bubbleAssistant;
  else if (role === 'system') bubbleStyle = styles.bubbleSystem;
  else if (role === 'error') bubbleStyle = styles.bubbleError;
  return (
    <div style={bubbleStyle}>
      <div style={styles.bubbleLabel}>
        {role === 'assistant' ? 'AI' : role === 'user' ? '나' : role === 'system' ? '시스템' : '오류'}
      </div>
      <div>{text}</div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(2,6,23,0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  panelWindow: {
    width: 'min(420px, 100%)',
    height: 'min(720px, 95vh)',
    background: '#050b16',
    borderRadius: 24,
    border: '1px solid #131c2f',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
  },
  panelFullscreen: {
    width: 'min(520px, 100%)',
    height: 'min(96vh, 820px)',
    background: '#050b16',
    borderRadius: 20,
    border: '1px solid #131c2f',
    boxShadow: '0 30px 80px rgba(0,0,0,0.65)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #10192b',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#94a3b8',
  },
  headerActions: {
    display: 'flex',
    gap: 8,
  },
  iconButton: {
    padding: '6px 12px',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#0b1220',
    color: '#e2e8f0',
    fontSize: 12,
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 20px',
    gap: 12,
    minHeight: 0,
  },
  sessionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sessionLabel: {
    color: '#cbd5f5',
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sessionSelect: {
    background: '#0b1220',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '6px 8px',
    fontSize: 12,
  },
  infoRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  logArea: {
    flex: 1,
    border: '1px solid #1c253b',
    borderRadius: 18,
    padding: 16,
    background: '#030918',
    overflowY: 'auto',
  },
  inputArea: {
    border: '1px solid #1c253b',
    borderRadius: 18,
    padding: 12,
    background: '#030918',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  textInput: {
    minHeight: 110,
    borderRadius: 12,
    border: '1px solid #293552',
    background: '#040b1a',
    color: '#e2e8f0',
    padding: 10,
    fontSize: 13,
    resize: 'vertical',
  },
  inputFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  hintText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  primaryButton: (disabled) => ({
    padding: '8px 16px',
    borderRadius: 12,
    border: '1px solid #0891b2',
    background: disabled ? '#0b1a2c' : '#0284c7',
    color: '#e0f2fe',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  secondaryButton: {
    padding: '8px 14px',
    borderRadius: 12,
    border: '1px solid #334155',
    background: '#0b1220',
    color: '#d4d8f0',
    fontSize: 12,
  },
  dangerButton: {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid rgba(248,113,113,0.7)',
    background: 'rgba(127,29,29,0.4)',
    color: '#fecaca',
    fontSize: 12,
  },
  errorBanner: {
    border: '1px solid rgba(248,113,113,0.6)',
    background: 'rgba(127,29,29,0.2)',
    borderRadius: 12,
    padding: 8,
    color: '#fecaca',
    fontSize: 12,
  },
  emptyState: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
  },
  bubbleUser: {
    borderRadius: 16,
    border: '1px solid rgba(59,130,246,0.4)',
    background: 'rgba(37,99,235,0.15)',
    padding: 12,
  },
  bubbleAssistant: {
    borderRadius: 16,
    border: '1px solid rgba(14,165,233,0.4)',
    background: 'rgba(8,47,73,0.6)',
    padding: 12,
  },
  bubbleSystem: {
    borderRadius: 16,
    border: '1px dashed rgba(148,163,184,0.5)',
    background: 'rgba(15,23,42,0.5)',
    padding: 12,
  },
  bubbleError: {
    borderRadius: 16,
    border: '1px solid rgba(248,113,113,0.6)',
    background: 'rgba(127,29,29,0.3)',
    padding: 12,
  },
  bubbleLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 4,
  },
};
