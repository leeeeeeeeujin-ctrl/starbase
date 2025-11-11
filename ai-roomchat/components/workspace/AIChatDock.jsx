"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCodeContext, buildSystemPromptFromContext } from '../../lib/workspace/ai/getCodeContext.js';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { useAiChatSessions } from './hooks/useAiChatSessions';
import { useSupabaseSessionToken } from './hooks/useSupabaseSessionToken';

const MAX_SNIPPET_CHARS = 800;
const DIRECT_API_KEY_STORAGE = 'ai-chat:direct-api-key';
const API_SOURCE_STORAGE = 'ai-chat:api-source';

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
    return `File: ${path}\n${snippet}${text.length > MAX_SNIPPET_CHARS ? '\n…' : ''}`;
  });

  return snippets.join('\n\n');
}

function detectApiKeyDetails(value) {
  const key = (value || '').trim();
  if (!key) return { provider: 'unknown', label: 'Key not provided', mode: null };
  if (/^AI[a-zA-Z0-9_-]{20,}$/.test(key)) {
    return { provider: 'google', label: 'Google AI Studio (AI…)', mode: 'v1' };
  }
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) {
    return { provider: 'google', label: 'Google Cloud (AIza…)', mode: 'v1beta' };
  }
  if (/^gsk_[A-Za-z0-9]{20,}$/.test(key)) {
    return { provider: 'groq', label: 'Groq (gsk_)', mode: 'groq' };
  }
  return { provider: 'unknown', label: 'Unknown provider', mode: null };
}

export default function AIChatDock({ onClose }) {
  const { files = {}, activePath } = useWorkspace();
  const { sessions, currentId, logs, setCurrentId, append, startNewChat, deleteSession } = useAiChatSessions();
  const { token: sessionToken, user: sessionUser, refresh: refreshSessionToken } = useSupabaseSessionToken();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [contextText, setContextText] = useState('');
  const [contextLoading, setContextLoading] = useState(true);
  const [apiSource, setApiSource] = useState(() => {
    if (typeof window === 'undefined') return 'keyring';
    try {
      return window.localStorage.getItem(API_SOURCE_STORAGE) || 'keyring';
    } catch {
      return 'keyring';
    }
  });
  const [directApiKey, setDirectApiKey] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return JSON.parse(window.localStorage.getItem(DIRECT_API_KEY_STORAGE) || 'null');
    } catch {
      return null;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [draftMeta, setDraftMeta] = useState(() => detectApiKeyDetails(''));

  const logRef = useRef(null);
  const optionsRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ctx = await getCodeContext();
        if (!mounted) return;
        const sys = buildSystemPromptFromContext(ctx);
        setContextText(sys);
      } catch {
        if (mounted) setContextText('You are a workspace assistant helping edit files.');
      } finally {
        if (mounted) setContextLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(API_SOURCE_STORAGE, apiSource);
    } catch {}
  }, [apiSource]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (directApiKey) {
        window.localStorage.setItem(DIRECT_API_KEY_STORAGE, JSON.stringify(directApiKey));
      } else {
        window.localStorage.removeItem(DIRECT_API_KEY_STORAGE);
      }
    } catch {}
  }, [directApiKey]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointer = (event) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!showApiKeyDialog) return;
    const current = directApiKey?.key || '';
    setApiKeyDraft(current);
    setDraftMeta(detectApiKeyDetails(current));
  }, [showApiKeyDialog, directApiKey]);

  useEffect(() => {
    try {
      const el = logRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }, [logs]);

  const getSessionToken = useCallback(
    async (options = {}) => {
      const { optional = false } = options;
      if (sessionToken) return sessionToken;
      const refreshed = await refreshSessionToken();
      if (!optional && !refreshed) throw new Error('로그인이 필요합니다.');
      return refreshed;
    },
    [sessionToken, refreshSessionToken]
  );

  const activeFileSummary = useMemo(() => summarizeWorkspace(files, activePath), [files, activePath]);

  const composePrompt = useMemo(() => {
    const header = contextText || 'You are a workspace assistant.';
    return `${header}\n\n--- Workspace snapshot ---\n${activeFileSummary || '(no files loaded)'}`;
  }, [contextText, activeFileSummary]);

  const useDirectKey = apiSource === 'direct' && !!directApiKey?.key;
  const apiSourceLabel = useDirectKey
    ? `Key: Direct (${directApiKey?.label || 'custom'})`
    : 'Key: Supabase keyring';
  const savedKeySummary = directApiKey?.label || 'Not configured';

  const handleOpenKeyDialog = useCallback(() => {
    setShowApiKeyDialog(true);
    setMenuOpen(false);
  }, []);

  const handleSaveApiKey = useCallback(() => {
    const next = apiKeyDraft.trim();
    if (!next) return;
    const meta = detectApiKeyDetails(next);
    setDirectApiKey({ key: next, provider: meta.provider, label: meta.label, mode: meta.mode });
    setApiSource('direct');
    setShowApiKeyDialog(false);
  }, [apiKeyDraft]);

  const handleClearApiKey = useCallback(() => {
    setDirectApiKey(null);
    setApiSource('keyring');
    setMenuOpen(false);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (apiSource === 'direct' && !directApiKey?.key) {
      setError('직접 입력 키가 설정되어 있지 않습니다. 옵션에서 키를 등록해 주세요.');
      return;
    }
    setInput('');
    setSending(true);
    setError(null);
    append('user', trimmed);
    try {
      const useDirect = apiSource === 'direct';
      const token = useDirect ? await getSessionToken({ optional: true }) : await getSessionToken();
      const payload = {
        prefer: useDirect ? 'direct' : 'keyring',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${composePrompt}\n\n<<REQUEST>>\n${trimmed}`,
              },
            ],
          },
        ],
      };
      if (useDirect && directApiKey?.mode) {
        payload.mode = directApiKey.mode;
      }
      const headers = {
        'Content-Type': 'application/json',
        ...(!useDirect && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(useDirect && directApiKey?.key ? { 'X-AI-API-KEY': directApiKey.key } : {}),
      };
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const detail = data?.error || data?.code || 'AI 응답을 받지 못했습니다.';
        throw new Error(detail);
      }
      const text = extractGeminiText(data.data) || '(빈 응답)';
      append('assistant', text);
    } catch (e) {
      const message = e?.message || '요청이 실패했습니다.';
      setError(message);
      append('error', message);
    } finally {
      setSending(false);
    }
  }, [apiSource, append, composePrompt, directApiKey, getSessionToken, input]);

  const handleInsertActiveFile = useCallback(() => {
    if (!activePath) return;
    const snippet = typeof files[activePath]?.content === 'string'
      ? files[activePath].content.slice(0, MAX_SNIPPET_CHARS)
      : '';
    setInput((prev) => `${prev ? `${prev}\n\n` : ''}[파일: ${activePath}]\n${snippet}`);
  }, [activePath, files]);

  const currentLogs = logs || [];
  const menuButtonStyle = {
    width: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#e2e8f0',
    fontSize: 12,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        width: 420,
        maxWidth: '90vw',
        height: 'min(78vh, 640px)',
        background: '#050b16',
        border: '1px solid #1f2937',
        borderRadius: 18,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        position: 'relative',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 700 }}>AI 채팅</div>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>
              현재 파일: {activePath || '없음'}
            </div>
            <div style={{ color: '#38bdf8', fontSize: 11 }}>
              {apiSourceLabel}
            </div>
          </div>
          <div ref={optionsRef} style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
            <select
              value={currentId || ''}
              onChange={(e) => setCurrentId(e.target.value)}
              style={{
                background: '#0b1220',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: 6,
                fontSize: 12,
                padding: '4px 6px',
              }}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title || '새 채팅'}
                </option>
              ))}
            </select>
            <button
              onClick={startNewChat}
              title="새 채팅"
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #2563eb',
                background: '#172554',
                color: '#bfdbfe',
                fontSize: 12,
              }}
            >
              새 채팅
            </button>
            <button
              onClick={() => currentId && deleteSession(currentId)}
              disabled={!currentId}
              title="대화 삭제"
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #4b5563',
                background: '#111827',
                color: '#fca5a5',
                fontSize: 12,
                opacity: currentId ? 1 : 0.4,
              }}
            >
              삭제
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #4b5563',
                background: '#111827',
                color: '#e5e7eb',
              }}
              title="닫기"
            >
              닫기
            </button>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #4b5563',
                background: '#111827',
                color: '#e5e7eb',
                fontWeight: 700,
              }}
              title="옵션"
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 230,
                  background: '#0b1220',
                  border: '1px solid #1f2937',
                  borderRadius: 12,
                  padding: 10,
                  boxShadow: '0 18px 40px rgba(0,0,0,0.55)',
                  zIndex: 25,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ color: '#cbd5f5', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  API 키
                </div>
                <button
                  type="button"
                  style={menuButtonStyle}
                  onClick={() => {
                    setApiSource('keyring');
                    setMenuOpen(false);
                  }}
                >
                  {apiSource === 'keyring' ? '✓ ' : ''}Supabase keyring 사용
                </button>
                <button
                  type="button"
                  style={menuButtonStyle}
                  onClick={() => {
                    if (directApiKey?.key) {
                      setApiSource('direct');
                      setMenuOpen(false);
                    } else {
                      handleOpenKeyDialog();
                    }
                  }}
                >
                  {apiSource === 'direct' ? '✓ ' : ''}직접 입력 키 사용
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {savedKeySummary}
                  </div>
                </button>
                <button type="button" style={menuButtonStyle} onClick={handleOpenKeyDialog}>
                  API 키 설정…
                </button>
                {directApiKey?.key ? (
                  <button type="button" style={menuButtonStyle} onClick={handleClearApiKey}>
                    저장된 키 삭제
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          로그인: {sessionUser?.email || sessionUser?.id || '알 수 없음'}
        </div>
        <div
          style={{
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 12,
            color: '#cbd5f5',
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {contextLoading ? '콘텍스트를 불러오는 중입니다…' : activeFileSummary || '요약할 파일이 없습니다.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleInsertActiveFile}
            disabled={!activePath}
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0b1220',
              color: '#e2e8f0',
              fontSize: 12,
            }}
          >
            현재 파일 첨부
          </button>
        </div>
      </div>

      <div
        ref={logRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {currentLogs.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>아직 대화가 없습니다. 메시지를 입력해 보세요.</div>
        )}
        {currentLogs.map((entry, idx) => (
          <div key={`${entry.role}-${entry.t}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {entry.role === 'user' ? '사용자' : entry.role === 'assistant' ? 'AI' : '시스템'}
            </div>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                background: entry.role === 'assistant' ? '#0f172a' : '#111827',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: '8px 10px',
                color: entry.role === 'error' ? '#fecaca' : '#e2e8f0',
              }}
            >
              {typeof entry.msg === 'string' ? entry.msg : JSON.stringify(entry.msg, null, 2)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {error && (
          <div style={{ color: '#fecaca', fontSize: 12 }}>
            {error}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="요청을 입력해 주세요"
          style={{
            resize: 'none',
            minHeight: 72,
            maxHeight: 140,
            borderRadius: 10,
            border: '1px solid '#334155',
            padding: '8px 10px',
            background: '#0b1220',
            color: '#e2e8f0',
            fontSize: 13,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {sending ? 'AI가 응답을 생성하는 중…' : 'Shift+Enter 로 줄바꿈'}
          </span>
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #22d3ee',
              background: sending ? '#155e75' : '#0f766e',
              color: '#ecfeff',
              fontWeight: 600,
            }}
          >
            {sending ? '전송 중…' : '전송'}
          </button>
        </div>
      </div>

      {showApiKeyDialog && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5,11,22,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 40,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: '#0b1220',
              border: '1px solid #1f2937',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>API 키 설정</div>
            <textarea
              value={apiKeyDraft}
              onChange={(e) => {
                setApiKeyDraft(e.target.value);
                setDraftMeta(detectApiKeyDetails(e.target.value));
              }}
              placeholder="AI API 키를 붙여 넣으세요"
              style={{
                minHeight: 90,
                borderRadius: 10,
                border: '1px solid #334155',
                padding: '8px 10px',
                background: '#050b16',
                color: '#e2e8f0',
                fontSize: 13,
              }}
            />
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              감지된 키 타입: {draftMeta.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowApiKeyDialog(false)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #4b5563',
                  background: 'transparent',
                  color: '#e2e8f0',
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={!apiKeyDraft.trim()}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #22d3ee',
                  background: apiKeyDraft.trim() ? '#0f766e' : '#0b3b3f',
                  color: '#ecfeff',
                  fontWeight: 600,
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
