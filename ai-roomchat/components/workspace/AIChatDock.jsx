"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCodeContext, buildSystemPromptFromContext } from '../../lib/workspace/ai/getCodeContext.js';
import { useWorkspace } from './CodeWorkspaceProvider.jsx';
import { useAiChatSessions } from './hooks/useAiChatSessions';
import { useSupabaseSessionToken } from './hooks/useSupabaseSessionToken';

const MAX_SNIPPET_CHARS = 800;

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

  const { token: sessionToken, user: sessionUser, refresh: refreshSessionToken } = useSupabaseSessionToken();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [contextText, setContextText] = useState('');
  const [contextLoading, setContextLoading] = useState(true);

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
                text: `${composePrompt}\n\n<<REQUEST>>\n${trimmed}`,
              },
            ],
          },
        ],
      };
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'AI 응답을 받지 못했습니다.');
      }
      const text = extractGeminiText(data.data) || '(빈 응답)';
      append('assistant', text);
    } catch (e) {
      const message = e?.message || '요청에 실패했습니다.';
      setError(message);
      append('error', message);
    } finally {
      setSending(false);
    }
  }, [append, composePrompt, getSessionToken, input]);

  const handleInsertActiveFile = useCallback(() => {
    if (!activePath) return;
    const snippet = typeof files[activePath]?.content === 'string'
      ? files[activePath].content.slice(0, MAX_SNIPPET_CHARS)
      : '';
    setInput((prev) => `${prev ? `${prev}\n\n` : ''}[파일: ${activePath}]\n${snippet}`);
  }, [activePath, files]);

  const currentLogs = logs || [];

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
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                  {session.title || '대화'}
                </option>
              ))}
            </select>
            <button
              onClick={startNewChat}
              title="새 대화"
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #2563eb',
                background: '#172554',
                color: '#bfdbfe',
                fontSize: 12,
              }}
            >
              새 대화
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
              ✕
            </button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          로그인: {sessionUser?.email || sessionUser?.id || '없음'}
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
          {contextLoading ? '콘텍스트를 불러오는 중…' : activeFileSummary || '요약할 파일이 없습니다.'}
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
          placeholder="요청을 입력하세요…"
          style={{
            resize: 'none',
            minHeight: 72,
            maxHeight: 140,
            borderRadius: 10,
            border: '1px solid #334155',
            padding: '8px 10px',
            background: '#0b1220',
            color: '#e2e8f0',
            fontSize: 13,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {sending ? 'AI가 응답을 작성하는 중…' : 'Shift+Enter 로 줄바꿈'}
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
    </div>
  );
}
