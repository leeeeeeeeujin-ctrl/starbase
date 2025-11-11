"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAiChatSessions } from './hooks/useAiChatSessions';
import { useSupabaseSessionToken } from './hooks/useSupabaseSessionToken';
import {
  activateRankApiKey,
  deactivateRankApiKey,
  deleteRankApiKeyEntry,
  fetchRankUserKeyring,
  formatKeyProviderLabel,
  KEYRING_LIMIT_FALLBACK,
  mergeKeyringEntries,
  normalizeKeyringEntry,
  registerRankApiKey,
  sanitizeKeyringStorageEntry,
} from '@/lib/rank/keyringClient';
import {
  persistRankKeyringSnapshot,
  readRankKeyringSnapshot,
} from '@/lib/rank/keyringStorage';

const PROMPT_HEADER = 'You are a workspace assistant helping edit files.';

export default function AIChatDock({ onClose }) {
  const { sessions, currentId, logs, setCurrentId, append, startNewChat, deleteSession } =
    useAiChatSessions();
  const { token: sessionToken, user: sessionUser, refresh: refreshSessionToken } =
    useSupabaseSessionToken();

  const cachedSnapshot = useMemo(() => readRankKeyringSnapshot(), []);
  const [keyringEntries, setKeyringEntries] = useState(cachedSnapshot.entries || []);
  const [keyringLimit, setKeyringLimit] = useState(KEYRING_LIMIT_FALLBACK);
  const [keyringLoading, setKeyringLoading] = useState(false);
  const [keyringError, setKeyringError] = useState(null);
  const [keyringMessage, setKeyringMessage] = useState('');
  const [keyringSubmitting, setKeyringSubmitting] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);

  const logRef = useRef(null);

  const getSessionToken = useCallback(
    async (options = {}) => {
      const { optional = false } = options;
      if (sessionToken) return sessionToken;
      const refreshed = await refreshSessionToken();
      if (!optional && !refreshed) {
        throw new Error('로그인이 필요합니다.');
      }
      return refreshed;
    },
    [sessionToken, refreshSessionToken]
  );

  useEffect(() => {
    try {
      const el = logRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {
      /* no-op */
    }
  }, [logs]);

  const applySnapshot = useCallback(
    (userId, entries) => {
      persistRankKeyringSnapshot({
        userId: userId || '',
        entries: entries.map(sanitizeKeyringStorageEntry),
      });
    },
    []
  );

  const loadKeyring = useCallback(async () => {
    if (!sessionUser?.id) {
      setKeyringEntries([]);
      setKeyringMessage('로그인 후 API 키를 등록해 주세요.');
      return;
    }
    setKeyringLoading(true);
    setKeyringError(null);
    try {
      const token = await getSessionToken();
      const payload = await fetchRankUserKeyring({
        userId: sessionUser.id,
        accessToken: token,
      });
      const entries = payload.entries || [];
      setKeyringEntries(entries);
      setKeyringLimit(
        Number.isFinite(payload?.limit) ? Number(payload.limit) : KEYRING_LIMIT_FALLBACK
      );
      setKeyringMessage(entries.length ? '' : '등록된 API 키가 없습니다. 새 키를 추가해 주세요.');
      applySnapshot(sessionUser.id, entries);
    } catch (error) {
      console.error('[AIChatDock] failed to load keyring', error);
      setKeyringError(error);
    } finally {
      setKeyringLoading(false);
    }
  }, [sessionUser?.id, getSessionToken, applySnapshot]);

  useEffect(() => {
    loadKeyring();
  }, [loadKeyring]);

  const hasActiveKey = keyringEntries.some(entry => entry.isActive);

  const handleRegisterKey = useCallback(async () => {
    const trimmed = newApiKey.trim();
    if (!trimmed || keyringSubmitting) return;
    if (!sessionUser?.id) {
      setKeyringError(new Error('로그인 상태에서만 API 키를 등록할 수 있습니다.'));
      return;
    }
    setKeyringSubmitting(true);
    setKeyringError(null);
    try {
      const token = await getSessionToken();
      const payload = await registerRankApiKey({
        apiKey: trimmed,
        context: { userId: sessionUser.id, accessToken: token },
      });
      const entry = normalizeKeyringEntry(payload?.entry);
      const entries = mergeKeyringEntries(
        keyringEntries,
        entry,
        payload?.activated !== false
      );
      setKeyringEntries(entries);
      setKeyringLimit(
        Number.isFinite(payload?.limit) ? Number(payload.limit) : KEYRING_LIMIT_FALLBACK
      );
      applySnapshot(sessionUser.id, entries);
      setKeyringMessage('API 키가 저장되었습니다. 사용 설정으로 활성화할 수 있습니다.');
      setNewApiKey('');
    } catch (error) {
      console.error('[AIChatDock] failed to store api key', error);
      setKeyringError(error);
    } finally {
      setKeyringSubmitting(false);
    }
  }, [newApiKey, keyringSubmitting, sessionUser?.id, keyringEntries, getSessionToken, applySnapshot]);

  const handleToggleEntry = useCallback(
    async entry => {
      if (!entry?.id || keyringSubmitting) return;
      if (!sessionUser?.id) {
        setKeyringError(new Error('로그인 상태에서만 API 키를 변경할 수 있습니다.'));
        return;
      }
      setKeyringSubmitting(true);
      setKeyringError(null);
      try {
        const token = await getSessionToken();
        const payload = entry.isActive
          ? await deactivateRankApiKey({
              entryId: entry.id,
              context: { userId: sessionUser.id, accessToken: token },
            })
          : await activateRankApiKey({
              entryId: entry.id,
              context: { userId: sessionUser.id, accessToken: token },
            });
        const normalized = normalizeKeyringEntry(payload?.entry);
        const entries = mergeKeyringEntries(keyringEntries, normalized, !!normalized?.isActive);
        setKeyringEntries(entries);
        applySnapshot(sessionUser.id, entries);
      } catch (error) {
        console.error('[AIChatDock] failed to toggle api key', error);
        setKeyringError(error);
      } finally {
        setKeyringSubmitting(false);
      }
    },
    [keyringEntries, keyringSubmitting, sessionUser?.id, getSessionToken, applySnapshot]
  );

  const handleDeleteEntry = useCallback(
    async entry => {
      if (!entry?.id || keyringSubmitting) return;
      if (!sessionUser?.id) {
        setKeyringError(new Error('로그인 상태에서만 API 키를 삭제할 수 있습니다.'));
        return;
      }
      setKeyringSubmitting(true);
      setKeyringError(null);
      try {
        const token = await getSessionToken();
        await deleteRankApiKeyEntry({
          entryId: entry.id,
          context: { userId: sessionUser.id, accessToken: token },
        });
        const entries = keyringEntries.filter(item => item.id !== entry.id);
        setKeyringEntries(entries);
        applySnapshot(sessionUser.id, entries);
      } catch (error) {
        console.error('[AIChatDock] failed to delete api key', error);
        setKeyringError(error);
      } finally {
        setKeyringSubmitting(false);
      }
    },
    [keyringEntries, keyringSubmitting, sessionUser?.id, getSessionToken, applySnapshot]
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!sessionUser?.id) {
      const message = '로그인 후에만 요청을 보낼 수 있습니다.';
      setChatError(message);
      append('error', message);
      return;
    }
    if (!hasActiveKey) {
      const message = '활성화된 API 키가 없습니다. 상단에서 사용할 키를 선택해 주세요.';
      setChatError(message);
      append('error', message);
      return;
    }
    setInput('');
    setSending(true);
    setChatError(null);
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
                text: `${PROMPT_HEADER}\n\n<<REQUEST>>\n${trimmed}`,
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
        const detail = data?.error || data?.code || 'AI 응답을 받지 못했습니다.';
        throw Object.assign(new Error(detail), { status: res.status, data });
      }
      const text = extractGeminiText(data.data) || '(빈 응답)';
      append('assistant', text);
    } catch (error) {
      console.error('[AIChatDock] Gemini request failed', error);
      const message = error?.message || '요청이 실패했습니다.';
      setChatError(message);
      append('error', {
        message,
        status: error?.status || null,
        detail: error?.data || error?.stack || null,
      });
    } finally {
      setSending(false);
    }
  }, [append, getSessionToken, hasActiveKey, input, sessionUser?.id]);

  const keyringStatusText = hasActiveKey
    ? '활성화된 API 키로 Gemini 호출을 수행합니다.'
    : '활성화된 키가 없으면 요청이 거절됩니다.';

  return (
    <div style={styles.dock}>
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>API 키 관리</h3>
            <p style={styles.sectionHint}>
              Supabase 키링에 저장된 키만 서버 호출에 사용됩니다. 새 키를 등록한 뒤 활성화해 주세요.
            </p>
          </div>
          <button type="button" style={styles.ghostButton} onClick={loadKeyring}>
            새로고침
          </button>
        </div>
        <div style={styles.keyInputRow}>
          <textarea
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder="AI API 키를 붙여넣으세요"
            style={styles.keyInput}
          />
          <button
            type="button"
            style={styles.primaryButton(keyringSubmitting || !newApiKey.trim())}
            onClick={handleRegisterKey}
            disabled={keyringSubmitting || !newApiKey.trim()}
          >
            {keyringSubmitting ? '저장 중…' : '키 등록'}
          </button>
        </div>
        <div style={styles.sectionHint}>
          등록된 키 {keyringEntries.length}/{keyringLimit}
        </div>
        {keyringError ? (
          <div style={styles.errorBox}>{keyringError.message || 'API 키 작업 중 오류가 발생했습니다.'}</div>
        ) : null}
        {keyringMessage ? <div style={styles.infoBox}>{keyringMessage}</div> : null}
        {keyringLoading ? (
          <div style={styles.sectionHint}>키 목록을 불러오는 중입니다…</div>
        ) : keyringEntries.length === 0 ? (
          <div style={styles.emptyBox}>등록된 키가 없습니다.</div>
        ) : (
          <div style={styles.keyList}>
            {keyringEntries.map((entry) => (
              <div key={entry.id} style={styles.keyEntry(entry.isActive)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>{formatKeyProviderLabel(entry.provider)}</span>
                    {entry.isActive ? (
                      <span style={styles.activeBadge}>사용 중</span>
                    ) : null}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    샘플: {entry.keySample || '미확인'}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>
                    업데이트: {formatTimestamp(entry.updatedAt || entry.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    style={styles.smallButton(keyringSubmitting)}
                    onClick={() => handleToggleEntry(entry)}
                    disabled={keyringSubmitting}
                  >
                    {entry.isActive ? '비활성화' : '이 키 사용'}
                  </button>
                  <button
                    type="button"
                    style={styles.smallDangerButton(keyringSubmitting)}
                    onClick={() => handleDeleteEntry(entry)}
                    disabled={keyringSubmitting}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.sectionTitle}>AI 대화</h3>
            <p style={styles.sectionHint}>{keyringStatusText}</p>
          </div>
          <div style={styles.sessionControls}>
            <select
              value={currentId || ''}
              onChange={(e) => setCurrentId(e.target.value)}
              style={styles.sessionSelect}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title || '새 채팅'}
                </option>
              ))}
            </select>
            <button type="button" style={styles.ghostButton} onClick={startNewChat}>
              새 채팅
            </button>
            <button
              type="button"
              style={styles.ghostButton}
              onClick={() => currentId && deleteSession(currentId)}
              disabled={!currentId}
            >
              삭제
            </button>
            <button type="button" style={styles.ghostButton} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>

        <div ref={logRef} style={styles.logPanel}>
          {logs.length === 0 ? (
            <div style={styles.sectionHint}>아직 대화가 없습니다. 메시지를 입력해 보세요.</div>
          ) : (
            logs.map((entry, idx) => (
              <div key={`${entry.role}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chatError ? <div style={styles.errorBox}>{chatError}</div> : null}
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
            style={styles.chatInput}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {sending ? 'AI가 응답을 생성하는 중…' : 'Shift+Enter 로 줄바꿈'}
            </span>
            <button
              type="button"
              style={styles.primaryButton(sending || !input.trim() || !hasActiveKey)}
              onClick={handleSend}
              disabled={sending || !input.trim() || !hasActiveKey}
            >
              {sending ? '전송 중…' : '전송'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

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

function formatTimestamp(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const styles = {
  dock: {
    width: 520,
    maxWidth: '95vw',
    maxHeight: '90vh',
    background: '#040a16',
    border: '1px solid #1f2937',
    borderRadius: 22,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    overflow: 'auto',
  },
  section: {
    border: '1px solid #1f2937',
    borderRadius: 18,
    padding: 16,
    background: '#050f21',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#e2e8f0',
  },
  sectionHint: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 12,
  },
  ghostButton: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'transparent',
    color: '#e2e8f0',
    fontSize: 12,
  },
  keyInputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },
  keyInput: {
    flex: 1,
    minHeight: 72,
    borderRadius: 12,
    border: '1px solid #334155',
    background: '#050b16',
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: 13,
  },
  primaryButton: (disabled) => ({
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #22d3ee',
    background: disabled ? '#083042' : '#0f766e',
    color: '#ecfeff',
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
  }),
  smallButton: (disabled) => ({
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #2563eb',
    background: disabled ? '#0c2551' : '#172554',
    color: '#bfdbfe',
    fontSize: 12,
    opacity: disabled ? 0.6 : 1,
  }),
  smallDangerButton: (disabled) => ({
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #7f1d1d',
    background: disabled ? '#2b0d0d' : '#450a0a',
    color: '#fecaca',
    fontSize: 12,
    opacity: disabled ? 0.6 : 1,
  }),
  errorBox: {
    border: '1px solid #f87171',
    background: 'rgba(248,113,113,0.08)',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#fecaca',
    fontSize: 12,
  },
  infoBox: {
    border: '1px solid rgba(125,211,252,0.5)',
    background: 'rgba(14,165,233,0.08)',
    borderRadius: 10,
    padding: '8px 10px',
    color: '#bae6fd',
    fontSize: 12,
  },
  emptyBox: {
    border: '1px dashed #334155',
    borderRadius: 12,
    padding: '12px 10px',
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 12,
  },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  keyEntry: (isActive) => ({
    border: '1px solid ' + (isActive ? '#22d3ee' : '#1f2937'),
    borderRadius: 14,
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    background: isActive ? 'rgba(15,118,110,0.2)' : 'rgba(15,23,42,0.6)',
    flexWrap: 'wrap',
  }),
  activeBadge: {
    fontSize: 10,
    borderRadius: 999,
    padding: '2px 8px',
    background: '#0f766e',
    color: '#ecfeff',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  logPanel: {
    flex: 1,
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: '12px 16px',
    background: '#030712',
    overflowY: 'auto',
    maxHeight: 280,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  chatInput: {
    resize: 'none',
    minHeight: 90,
    borderRadius: 12,
    border: '1px solid #334155',
    padding: '8px 10px',
    background: '#0b1220',
    color: '#e2e8f0',
    fontSize: 13,
  },
  sessionControls: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  sessionSelect: {
    background: '#0b1220',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: 8,
    fontSize: 12,
    padding: '4px 6px',
  },
};
