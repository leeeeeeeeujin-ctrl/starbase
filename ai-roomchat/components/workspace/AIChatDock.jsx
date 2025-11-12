"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  registerRankApiKey,
  sanitizeKeyringStorageEntry,
} from '@/lib/rank/keyringClient';
import { persistRankKeyringSnapshot, readRankKeyringSnapshot } from '@/lib/rank/keyringStorage';

const PROMPT_HEADER = [
  'You are the Starbase workspace assistant.',
  'Respond with JSON only: {"message":string,"actions?":[], "followup?":string}.',
  'When edits, tests, or queries are required, emit actions instead of asking the user to do them manually.',
  'Keep explanations concise and continue execution until blocked.',
].join('\n');

const DOCK_PREFS_KEY = 'workspace:aiChat:prefs.v2';
const DEFAULT_DOCK_PREFS = {
  mode: 'mini',
  position: { x: 32, y: 64 },
  size: { width: 440, height: 580 },
  historyOpen: true,
  trustEnabled: false,
  trustLimit: 5,
  sandboxEnabled: false,
  testHarness: false,
  userInstructions: '',
};

const MIN_WIDTH = 360;
const MIN_HEIGHT = 320;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const HISTORY_SLICE = 12;
const MAX_AUTO_CHAIN_DEPTH = 4;

export default function AIChatDock({ onClose }) {
  const panelRef = useRef(null);
  const logRef = useRef(null);
  const fileInputRef = useRef(null);
  const pointerStateRef = useRef(null);
  const liveFrameRef = useRef(null);
  const logsSnapshotRef = useRef([]);

  const { prefs, updatePrefs } = useDockPrefs();
  const {
    sessions,
    currentId,
    logs,
    setCurrentId,
    append,
    startNewChat,
    deleteSession,
  } = useAiChatSessions();
  const { token: sessionToken, user: sessionUser, refresh: refreshSessionToken } =
    useSupabaseSessionToken();

  logsSnapshotRef.current = logs;

  const getSessionToken = useCallback(
    async (options = {}) => {
      const { optional = false } = options;
      if (sessionToken) return sessionToken;
      const refreshed = await refreshSessionToken();
      if (!optional && !refreshed) {
        throw new Error('A Supabase session is required.');
      }
      return refreshed;
    },
    [sessionToken, refreshSessionToken]
  );

  const {
    entries: keyringEntries,
    limit: keyringLimit,
    loading: keyringLoading,
    message: keyringMessage,
    error: keyringError,
    submitting: keyringSubmitting,
    pendingKey,
    setPendingKey,
    hasActiveKey,
    load: reloadKeyring,
    register: registerKey,
    activate: activateKey,
    deactivate: deactivateKey,
    remove: removeKey,
  } = useKeyringController({ sessionUser, getSessionToken });

  const [menuOpen, setMenuOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [keyringOpen, setKeyringOpen] = useState(false);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [chatError, setChatError] = useState('');
  const [sending, setSending] = useState(false);
  const [autoStatus, setAutoStatus] = useState({ running: false, executed: 0, remaining: 0 });

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      if (instructionsOpen) {
        setInstructionsOpen(false);
        return;
      }
      if (keyringOpen) {
        setKeyringOpen(false);
        return;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [instructionsOpen, keyringOpen, menuOpen, onClose]);

  useEffect(() => {
    const handleClick = (event) => {
      if (
        menuOpen &&
        !event.target.closest?.('[data-ai-chat-menu]') &&
        !event.target.closest?.('[data-ai-chat-menu-trigger]')
      ) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useLayoutEffect(() => {
    if (!panelRef.current || pointerStateRef.current) return;
    applyPanelGeometry(panelRef.current, prefs);
  }, [prefs]);

  const beginPointerInteraction = useCallback(
    (event, kind) => {
      if (prefs.mode === 'fullscreen' || event.button !== 0) return;
      if (event.target.closest('[data-stop-drag="true"]')) return;
      const el = panelRef.current;
      if (!el) return;
      event.preventDefault();
      const state = {
        kind,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: prefs.position.x,
        baseY: prefs.position.y,
        baseWidth: prefs.size.width,
        baseHeight: prefs.size.height,
      };
      pointerStateRef.current = state;
      el.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [prefs.mode, prefs.position.x, prefs.position.y, prefs.size.height, prefs.size.width]
  );

  const handlePointerMove = useCallback((event) => {
    const state = pointerStateRef.current;
    if (!state) return;
    const el = panelRef.current;
    if (!el) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.kind === 'move') {
      scheduleLiveFrame(liveFrameRef, () => {
        el.style.transform = `translate3d(${state.baseX + dx}px, ${state.baseY + dy}px, 0)`;
      });
    } else {
      const width = Math.max(MIN_WIDTH, state.baseWidth + dx);
      const height = Math.max(MIN_HEIGHT, state.baseHeight + dy);
      scheduleLiveFrame(liveFrameRef, () => {
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
      });
    }
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      const state = pointerStateRef.current;
      if (!state) return;
      pointerStateRef.current = null;
      const el = panelRef.current;
      if (el) {
        el.releasePointerCapture?.(state.pointerId);
        cancelFrame(liveFrameRef);
        applyPanelGeometry(el, prefs);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (state.kind === 'move') {
        const nextPosition = clampPosition(
          { x: state.baseX + dx, y: state.baseY + dy },
          state.baseWidth,
          state.baseHeight
        );
        updatePrefs((prev) => ({ ...prev, position: nextPosition }));
      } else {
        const width = Math.max(MIN_WIDTH, state.baseWidth + dx);
        const height = Math.max(MIN_HEIGHT, state.baseHeight + dy);
        const nextPosition = clampPosition({ x: state.baseX, y: state.baseY }, width, height);
        updatePrefs((prev) => ({ ...prev, size: { width, height }, position: nextPosition }));
      }
    },
    [handlePointerMove, prefs, updatePrefs]
  );

  const handleToggleMode = useCallback(() => {
    updatePrefs((prev) => ({
      ...prev,
      mode: prev.mode === 'mini' ? 'fullscreen' : 'mini',
    }));
  }, [updatePrefs]);

  const handleAttachFiles = useCallback(
    (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      let next = [...attachments];
      let error = '';
      files.forEach((file) => {
        if (next.length >= MAX_ATTACHMENTS) return;
        if (file.size > MAX_ATTACHMENT_BYTES) {
          error = `Files must be <= ${formatBytes(MAX_ATTACHMENT_BYTES)}.`;
          return;
        }
        next = [...next, createAttachmentMeta(file)];
      });
      setAttachments(next.slice(0, MAX_ATTACHMENTS));
      setAttachmentError(error);
      event.target.value = '';
    },
    [attachments]
  );

  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const chatOptions = useMemo(
    () => ({
      trustEnabled: prefs.trustEnabled,
      trustLimit: prefs.trustLimit,
      sandboxEnabled: prefs.sandboxEnabled,
      testHarness: prefs.testHarness,
      userInstructions: prefs.userInstructions,
    }),
    [
      prefs.sandboxEnabled,
      prefs.testHarness,
      prefs.trustEnabled,
      prefs.trustLimit,
      prefs.userInstructions,
    ]
  );

  const runRequest = useCallback(
    async function sendRequest({
      origin = 'user',
      message,
      attachments: pendingAttachments = [],
      allowActions = false,
      actionBudget = 0,
      skipUserLog = false,
      baseLogs = null,
      depth = 0,
    }) {
      const trimmed = (message || '').trim();
      if (!trimmed) return;

      const workingLogs = baseLogs ? [...baseLogs] : [...logsSnapshotRef.current];
      const attachmentBundle = await prepareAttachmentBundle(pendingAttachments);
      const userEntry = skipUserLog
        ? null
        : { role: 'user', msg: { text: trimmed, attachments: attachmentBundle.meta } };
      if (userEntry) {
        workingLogs.push(userEntry);
        append('user', userEntry.msg);
      }

      const payload = buildModelPayload({
        logs: workingLogs,
        requestText: trimmed,
        attachmentBundle,
        options: {
          ...chatOptions,
          remainingBudget: actionBudget,
        },
      });

      const token = await getSessionToken({ optional: false });
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
        throw Object.assign(new Error(data?.error || 'AI request failed'), {
          status: res.status,
          detail: data,
        });
      }

      const rawText = extractGeminiText(data.data) || '';
      const structured = parseStructuredResponse(rawText);
      const assistantText = structured?.message || rawText || '(empty response)';
      const assistantEntry = { role: 'assistant', msg: assistantText };
      workingLogs.push(assistantEntry);
      append('assistant', assistantText);

      const normalizedActions = Array.isArray(structured?.actions) ? structured.actions : [];
      const canAutoRun = allowActions && chatOptions.trustEnabled && actionBudget > 0;
      if (!normalizedActions.length) {
        return;
      }
      if (!canAutoRun) {
        const warning = `AI requested ${normalizedActions.length} action(s) but trust mode is off.`;
        workingLogs.push({ role: 'system', msg: warning });
        append('system', warning);
        return;
      }

      const actionResult = await runActionsAndSummarize({
        actions: normalizedActions,
        budget: actionBudget,
        append,
        getSessionToken,
        setAutoStatus,
        workingLogs,
      });

      if (
        actionResult.nextPrompt &&
        actionResult.remainingBudget > 0 &&
        depth < MAX_AUTO_CHAIN_DEPTH
      ) {
        workingLogs.push({ role: 'system', msg: actionResult.visibleLog });
        append('system', actionResult.visibleLog);
        await sendRequest({
          origin: 'auto',
          message: actionResult.nextPrompt,
          attachments: [],
          allowActions: true,
          actionBudget: actionResult.remainingBudget,
          skipUserLog: true,
          baseLogs: workingLogs,
          depth: depth + 1,
        });
      }
    },
    [append, chatOptions, getSessionToken]
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!sessionUser?.id) {
      setChatError('Sign in is required before sending messages.');
      append('error', 'Login is required before sending messages.');
      return;
    }
    if (!hasActiveKey) {
      setChatError('Activate at least one API key to talk to Gemini.');
      append('error', 'No active API key is available.');
      return;
    }

    const pending = attachments;
    setInput('');
    setAttachments([]);
    setChatError('');
    setSending(true);
    try {
      await runRequest({
        origin: 'user',
        message: trimmed,
        attachments: pending,
        allowActions: chatOptions.trustEnabled,
        actionBudget: chatOptions.trustEnabled ? chatOptions.trustLimit : 0,
      });
    } catch (error) {
      console.error('[AIChatDock] send failed', error);
      const message = error?.message || 'Request failed.';
      setChatError(message);
      append('error', { message, detail: error?.detail || null });
    } finally {
      setSending(false);
    }
  }, [
    append,
    attachments,
    chatOptions.trustEnabled,
    chatOptions.trustLimit,
    hasActiveKey,
    input,
    runRequest,
    sessionUser?.id,
  ]);

  const handleInputKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const statusBadges = useMemo(() => {
    const badges = [];
    badges.push({
      label: hasActiveKey ? 'Key ready' : 'API key missing',
      tone: hasActiveKey ? 'ok' : 'warn',
    });
    badges.push({
      label: chatOptions.trustEnabled ? `Trust ${chatOptions.trustLimit}` : 'Trust off',
      tone: chatOptions.trustEnabled ? 'ok' : 'neutral',
    });
    badges.push({
      label: chatOptions.sandboxEnabled ? 'Sandbox on' : 'Sandbox off',
      tone: chatOptions.sandboxEnabled ? 'ok' : 'neutral',
    });
    badges.push({
      label: chatOptions.testHarness ? 'Tester on' : 'Tester off',
      tone: chatOptions.testHarness ? 'ok' : 'neutral',
    });
    return badges;
  }, [
    chatOptions.sandboxEnabled,
    chatOptions.testHarness,
    chatOptions.trustEnabled,
    chatOptions.trustLimit,
    hasActiveKey,
  ]);

  const panelModeLabel = prefs.mode === 'fullscreen' ? '−' : '+';

  return (
    <div style={styles.backdrop}>
      <div
        ref={panelRef}
        style={{
          ...styles.panel,
          ...(prefs.mode === 'fullscreen'
            ? styles.panelFullscreen
            : {
                width: `${prefs.size.width}px`,
                height: `${prefs.size.height}px`,
                transform: `translate3d(${prefs.position.x}px, ${prefs.position.y}px, 0)`,
              }),
        }}
      >
        <header
          style={styles.header}
          onPointerDown={(event) => beginPointerInteraction(event, 'move')}
        >
          <div>
            <h2 style={styles.title}>AI Code Chat</h2>
            <p style={styles.subtitle}>
              Local history stays on this device. Use the menu for API keys and preferences.
            </p>
          </div>
          <div style={styles.headerActions} data-stop-drag="true">
            {statusBadges.map((badge) => (
              <span
                key={badge.label}
                style={{
                  ...styles.badge,
                  ...(badge.tone === 'ok'
                    ? styles.badgeOk
                    : badge.tone === 'warn'
                    ? styles.badgeWarn
                    : styles.badgeNeutral),
                }}
              >
                {badge.label}
              </span>
            ))}
            <button
              type="button"
              data-ai-chat-menu-trigger
              style={styles.iconButton}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              ⋯
            </button>
            <button
              type="button"
              style={styles.iconButton}
              onClick={handleToggleMode}
              data-stop-drag="true"
            >
              {panelModeLabel}
            </button>
            <button type="button" style={styles.closeButton} onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        <div style={styles.body}>
          {prefs.historyOpen && (
            <HistoryPanel
              sessions={sessions}
              currentId={currentId}
              onSelect={setCurrentId}
              onDelete={deleteSession}
              onNewChat={startNewChat}
            />
          )}

          <section style={styles.chatColumn}>
            {keyringMessage && <div style={styles.infoBanner}>{keyringMessage}</div>}
            {chatError && <div style={styles.errorBanner}>{chatError}</div>}

            <div ref={logRef} style={styles.logPanel}>
              <ChatLog logs={logs} />
            </div>

            <AttachmentsBar
              attachments={attachments}
              onRemove={removeAttachment}
              onPick={() => fileInputRef.current?.click()}
              error={attachmentError}
            />

            <div style={styles.composer}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask the workspace assistant..."
                style={styles.chatInput}
              />
              <div style={styles.composerFooter}>
                <div style={styles.composerMeta}>
                  <button
                    type="button"
                    style={styles.attachButton}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Attach
                  </button>
                  {autoStatus.running && (
                    <span style={styles.autoStatus}>
                      Auto actions running ({autoStatus.remaining} left)
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  style={styles.primaryButton(sending || !input.trim() || !hasActiveKey)}
                  onClick={handleSend}
                  disabled={sending || !input.trim() || !hasActiveKey}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </section>
        </div>
        {menuOpen && (
          <DockMenu
            onToggleHistory={() =>
              updatePrefs((prev) => ({ ...prev, historyOpen: !prev.historyOpen }))
            }
            onToggleTrust={() =>
              updatePrefs((prev) => ({ ...prev, trustEnabled: !prev.trustEnabled }))
            }
            onTrustLimitChange={(value) => updatePrefs((prev) => ({ ...prev, trustLimit: value }))}
            onToggleSandbox={() =>
              updatePrefs((prev) => ({ ...prev, sandboxEnabled: !prev.sandboxEnabled }))
            }
            onToggleTester={() =>
              updatePrefs((prev) => ({ ...prev, testHarness: !prev.testHarness }))
            }
            onOpenInstructions={() => setInstructionsOpen(true)}
            onOpenKeyring={() => {
              setKeyringOpen(true);
              reloadKeyring();
            }}
            onNewChat={() => {
              startNewChat();
              setMenuOpen(false);
            }}
            trustLimit={prefs.trustLimit}
            trustEnabled={prefs.trustEnabled}
            sandboxEnabled={prefs.sandboxEnabled}
            testerEnabled={prefs.testHarness}
            historyOpen={prefs.historyOpen}
            data-ai-chat-menu="true"
          />
        )}

        {instructionsOpen && (
          <InstructionsModal
            initialValue={prefs.userInstructions}
            onClose={() => setInstructionsOpen(false)}
            onSave={(value) => {
              updatePrefs((prev) => ({ ...prev, userInstructions: value }));
              setInstructionsOpen(false);
            }}
          />
        )}

        {keyringOpen && (
          <KeyringModal
            entries={keyringEntries}
            limit={keyringLimit}
            loading={keyringLoading}
            message={keyringMessage}
            error={keyringError}
            pendingKey={pendingKey}
            setPendingKey={setPendingKey}
            onClose={() => setKeyringOpen(false)}
            onRefresh={reloadKeyring}
            onRegister={registerKey}
            onActivate={activateKey}
            onDeactivate={deactivateKey}
            onRemove={removeKey}
            submitting={keyringSubmitting}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleAttachFiles}
        />
      </div>
    </div>
  );
}

function useDockPrefs() {
  const [prefs, setPrefs] = useState(() => loadDockPrefs());

  const updatePrefs = useCallback((updater) => {
    setPrefs((prev) => {
      const next = sanitizeDockPrefs(
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      );
      persistDockPrefs(next);
      return next;
    });
  }, []);

  return { prefs, updatePrefs };
}

function loadDockPrefs() {
  if (typeof window === 'undefined') return DEFAULT_DOCK_PREFS;
  try {
    const raw = window.localStorage.getItem(DOCK_PREFS_KEY);
    if (!raw) return DEFAULT_DOCK_PREFS;
    const parsed = JSON.parse(raw);
    return sanitizeDockPrefs({ ...DEFAULT_DOCK_PREFS, ...parsed });
  } catch {
    return DEFAULT_DOCK_PREFS;
  }
}

function persistDockPrefs(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DOCK_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function sanitizeDockPrefs(prefs) {
  return {
    ...DEFAULT_DOCK_PREFS,
    ...prefs,
    position: {
      x: Number.isFinite(prefs?.position?.x) ? prefs.position.x : DEFAULT_DOCK_PREFS.position.x,
      y: Number.isFinite(prefs?.position?.y) ? prefs.position.y : DEFAULT_DOCK_PREFS.position.y,
    },
    size: {
      width: Math.max(MIN_WIDTH, Number(prefs?.size?.width) || DEFAULT_DOCK_PREFS.size.width),
      height: Math.max(MIN_HEIGHT, Number(prefs?.size?.height) || DEFAULT_DOCK_PREFS.size.height),
    },
    trustLimit: Math.max(
      1,
      Math.min(25, Number(prefs?.trustLimit) || DEFAULT_DOCK_PREFS.trustLimit)
    ),
  };
}

function useKeyringController({ sessionUser, getSessionToken }) {
  const snapshot = useMemo(() => readRankKeyringSnapshot(), []);
  const [entries, setEntries] = useState(snapshot.entries || []);
  const [limit, setLimit] = useState(KEYRING_LIMIT_FALLBACK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingKey, setPendingKey] = useState('');

  const hasActiveKey = entries.some((entry) => entry.isActive);

  const applySnapshot = useCallback((userId, nextEntries) => {
    persistRankKeyringSnapshot({
      userId: userId || '',
      entries: nextEntries.map(sanitizeKeyringStorageEntry),
    });
  }, []);

  const load = useCallback(async () => {
    if (!sessionUser?.id) {
      setEntries([]);
      setMessage('Sign in to link an API key.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      const payload = await fetchRankUserKeyring({
        userId: sessionUser.id,
        accessToken: token,
      });
      const nextEntries = payload.entries || [];
      setEntries(nextEntries);
      setLimit(Number.isFinite(payload?.limit) ? Number(payload.limit) : KEYRING_LIMIT_FALLBACK);
      setMessage(nextEntries.length ? '' : 'Register a Gemini key to enable chat.');
      applySnapshot(sessionUser.id, nextEntries);
    } catch (err) {
      console.error('[AIChatDock] failed to load keyring', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, getSessionToken, sessionUser?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const register = useCallback(async () => {
    if (!pendingKey.trim() || submitting) return;
    if (!sessionUser?.id) {
      setError(new Error('Sign in before registering an API key.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getSessionToken();
      await registerRankApiKey({
        apiKey: pendingKey.trim(),
        activate: true,
        context: { userId: sessionUser.id, accessToken: token },
      });
      setPendingKey('');
      await load();
    } catch (err) {
      console.error('[AIChatDock] failed to store api key', err);
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }, [getSessionToken, load, pendingKey, sessionUser?.id, submitting]);
  const activate = useCallback(
    async (entry) => {
      if (!entry || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const token = await getSessionToken();
        await activateRankApiKey({
          entryId: entry.id,
          context: { userId: sessionUser.id, accessToken: token },
        });
        const nextEntries = mergeKeyringEntries(entries, { ...entry, isActive: true }, true);
        setEntries(nextEntries);
        applySnapshot(sessionUser.id, nextEntries);
      } catch (err) {
        console.error('[AIChatDock] failed to activate api key', err);
        setError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [applySnapshot, entries, getSessionToken, sessionUser?.id, submitting]
  );

  const deactivate = useCallback(
    async (entry) => {
      if (!entry || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const token = await getSessionToken();
        await deactivateRankApiKey({
          entryId: entry.id,
          context: { userId: sessionUser.id, accessToken: token },
        });
        const nextEntries = entries.map((item) =>
          item.id === entry.id ? { ...item, isActive: false } : item
        );
        setEntries(nextEntries);
        applySnapshot(sessionUser.id, nextEntries);
      } catch (err) {
        console.error('[AIChatDock] failed to deactivate api key', err);
        setError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [applySnapshot, entries, getSessionToken, sessionUser?.id, submitting]
  );

  const remove = useCallback(
    async (entry) => {
      if (!entry || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const token = await getSessionToken();
        await deleteRankApiKeyEntry({
          entryId: entry.id,
          context: { userId: sessionUser.id, accessToken: token },
        });
        const nextEntries = entries.filter((item) => item.id !== entry.id);
        setEntries(nextEntries);
        applySnapshot(sessionUser.id, nextEntries);
      } catch (err) {
        console.error('[AIChatDock] failed to delete api key', err);
        setError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [applySnapshot, entries, getSessionToken, sessionUser?.id, submitting]
  );

  return {
    entries,
    limit,
    loading,
    message,
    error,
    submitting,
    pendingKey,
    setPendingKey,
    hasActiveKey,
    load,
    register,
    activate,
    deactivate,
    remove,
  };
}

function KeyringModal({
  entries,
  limit,
  loading,
  message,
  error,
  pendingKey,
  setPendingKey,
  onClose,
  onRefresh,
  onRegister,
  onActivate,
  onDeactivate,
  onRemove,
  submitting,
}) {
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>API Key Manager</h3>
            <p style={styles.modalSubtitle}>
              Stored keys are encrypted through Supabase. Limit {entries.length}/{limit}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={styles.secondaryButton} onClick={onRefresh}>
              Refresh
            </button>
            <button type="button" style={styles.secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {message && <div style={styles.infoBox}>{message}</div>}
        {loading && <div style={styles.infoBox}>Loading keyring…</div>}
        {error && <div style={styles.errorBox}>{error.message || 'Keyring error.'}</div>}
        <div style={styles.modalSection}>
          <textarea
            value={pendingKey}
            onChange={(event) => setPendingKey(event.target.value)}
            placeholder="Paste your Gemini API key (it stays encrypted in Supabase)."
            style={styles.keyInput}
          />
          <button
            type="button"
            style={styles.primaryButton(!pendingKey.trim() || submitting)}
            onClick={onRegister}
            disabled={!pendingKey.trim() || submitting}
          >
            {submitting ? 'Saving…' : 'Save & Activate'}
          </button>
        </div>
        <div style={styles.keyList}>
          {entries.length === 0 && <div style={styles.emptyBox}>No keys stored yet.</div>}
          {entries.map((entry) => (
            <div key={entry.id} style={styles.keyEntry(entry.isActive)}>
              <div>
                <div style={{ fontWeight: 600 }}>{formatKeyProviderLabel(entry.provider)}</div>
                <div style={{ fontSize: 12, color: '#cbd5f5' }}>
                  {entry.modelLabel || entry.geminiModel || 'Custom model'}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {entry.keySample || '••••••'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {entry.isActive && <span style={styles.activeBadge}>Active</span>}
                <button
                  type="button"
                  style={styles.smallButton(false)}
                  onClick={() => (entry.isActive ? onDeactivate(entry) : onActivate(entry))}
                  disabled={submitting}
                >
                  {entry.isActive ? 'Deactivate' : 'Make active'}
                </button>
                <button
                  type="button"
                  style={styles.smallDangerButton(submitting)}
                  onClick={() => onRemove(entry)}
                  disabled={submitting}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InstructionsModal({ initialValue, onSave, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>User Instructions</h3>
            <p style={styles.modalSubtitle}>These instructions are injected into each prompt.</p>
          </div>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={styles.instructionsTextarea}
          placeholder="Example: Prefer TypeScript, keep commits atomic, avoid deleting tests."
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" style={styles.secondaryButton} onClick={() => setValue('')}>
            Clear
          </button>
          <button
            type="button"
            style={styles.primaryButton(!value && !initialValue)}
            onClick={() => onSave(value)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
function HistoryPanel({ sessions, currentId, onSelect, onDelete, onNewChat }) {
  return (
    <aside style={styles.historyPanel}>
      <div style={styles.historyHeader}>
        <h4 style={{ margin: 0 }}>History</h4>
        <button type="button" style={styles.secondaryButton} onClick={onNewChat}>
          New chat
        </button>
      </div>
      <div style={styles.historyList}>
        {sessions.map((session) => {
          const lastLog = session.logs?.[session.logs.length - 1];
          const preview =
            typeof lastLog?.msg === 'string'
              ? lastLog.msg
              : lastLog?.msg?.text || lastLog?.msg?.message || '';
          const active = session.id === currentId;
          return (
            <div
              key={session.id}
              style={{
                ...styles.historyItem,
                borderColor: active ? '#38bdf8' : '#1e293b',
                background: active ? 'rgba(14,165,233,0.08)' : 'transparent',
              }}
            >
              <button
                type="button"
                style={styles.historySelectButton}
                onClick={() => onSelect(session.id)}
              >
                <div style={{ fontWeight: 600 }}>{session.title || 'Untitled Chat'}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {preview || 'No messages yet.'}
                </div>
              </button>
              <button type="button" style={styles.historyDeleteButton} onClick={() => onDelete(session.id)}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function AttachmentsBar({ attachments, onRemove, onPick, error }) {
  return (
    <div style={styles.attachmentsBar}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {attachments.map((item) => (
          <span key={item.id} style={styles.attachmentChip}>
            {item.name} ({formatBytes(item.size)})
            <button type="button" style={styles.attachmentRemove} onClick={() => onRemove(item.id)}>
              ×
            </button>
          </span>
        ))}
        <button type="button" style={styles.secondaryButton} onClick={onPick}>
          + Add file
        </button>
      </div>
      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

function DockMenu({
  onToggleHistory,
  onToggleTrust,
  onTrustLimitChange,
  onToggleSandbox,
  onToggleTester,
  onOpenInstructions,
  onOpenKeyring,
  onNewChat,
  trustLimit,
  trustEnabled,
  sandboxEnabled,
  testerEnabled,
  historyOpen,
}) {
  return (
    <div style={styles.menu} data-ai-chat-menu="true">
      <div style={styles.menuSection}>
        <div style={styles.menuRow}>
          <label>
            <input type="checkbox" checked={historyOpen} onChange={onToggleHistory} /> Show history panel
          </label>
        </div>
        <button type="button" style={styles.menuButton} onClick={onNewChat}>
          Start a new chat
        </button>
      </div>
      <div style={styles.menuSection}>
        <div style={styles.menuRow}>
          <label>
            <input type="checkbox" checked={trustEnabled} onChange={onToggleTrust} /> Trust mode
          </label>
          <span style={styles.menuValue}>{trustLimit}</span>
        </div>
        <input
          type="range"
          min="1"
          max="25"
          value={trustLimit}
          onChange={(event) => onTrustLimitChange(Number(event.target.value))}
          style={{ width: '100%' }}
        />
        <small>Maximum automatic actions per turn.</small>
      </div>
      <div style={styles.menuSection}>
        <label style={styles.menuRow}>
          <input type="checkbox" checked={sandboxEnabled} onChange={onToggleSandbox} /> Sandbox actions
        </label>
        <label style={styles.menuRow}>
          <input type="checkbox" checked={testerEnabled} onChange={onToggleTester} /> Simple test harness
        </label>
      </div>
      <div style={styles.menuSection}>
        <button type="button" style={styles.menuButton} onClick={onOpenInstructions}>
          Edit user instructions
        </button>
        <button type="button" style={styles.menuButton} onClick={onOpenKeyring}>
          Manage API keys
        </button>
      </div>
    </div>
  );
}

function ChatLog({ logs }) {
  if (!logs.length) {
    return <div style={styles.emptyState}>No messages yet.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {logs.map((entry, index) => (
        <LogBubble key={entry.t || index} entry={entry} />
      ))}
    </div>
  );
}

function LogBubble({ entry }) {
  const { role, msg } = entry;
  const bubbleStyle = {
    ...styles.logBubble,
    ...(role === 'assistant'
      ? styles.logAssistant
      : role === 'user'
      ? styles.logUser
      : role === 'error'
      ? styles.logError
      : role === 'action'
      ? styles.logAction
      : styles.logSystem),
  };

  const renderContent = () => {
    if (typeof msg === 'string') return msg;
    if (!msg) return '';
    if (typeof msg.text === 'string') return msg.text;
    if (typeof msg.message === 'string') return msg.message;
    if (msg.action) {
      return [
        `Action: ${msg.action.type || msg.action.name || 'unknown'}`,
        msg.action.path ? `Target: ${msg.action.path}` : null,
        msg.result?.ok ? 'Result: ok' : `Result: ${msg.result?.error || 'failed'}`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (msg.detail) {
      return `${msg.message || 'Error'}\n${JSON.stringify(msg.detail, null, 2)}`;
    }
    return JSON.stringify(msg);
  };

  return (
    <div style={bubbleStyle}>
      <div>{renderContent()}</div>
      {Array.isArray(msg?.attachments) && msg.attachments.length > 0 && (
        <div style={styles.logAttachmentList}>
          {msg.attachments.map((att) => (
            <span key={att.id}>{att.name || att.path}</span>
          ))}
        </div>
      )}
    </div>
  );
}
async function runActionsAndSummarize({ actions, budget, append, getSessionToken, setAutoStatus, workingLogs }) {
  const normalized = normalizeActions(actions);
  if (!normalized.length) {
    return { remainingBudget: budget };
  }
  let remaining = budget;
  const executed = [];
  setAutoStatus({ running: true, executed: 0, remaining });
  let token;
  try {
    token = await getSessionToken();
  } catch (err) {
    append('error', { message: err.message || 'Missing session for actions.' });
    setAutoStatus({ running: false, executed: 0, remaining });
    return { remainingBudget: remaining };
  }

  for (const action of normalized) {
    if (remaining <= 0) break;
    const result = await executeWorkspaceAction(action, token);
    executed.push({ action, result });
    append('action', { action, result });
    workingLogs.push({ role: 'action', msg: { action, result } });
    remaining -= 1;
    setAutoStatus({ running: true, executed: executed.length, remaining });
    if (!result.ok) break;
  }

  setAutoStatus({ running: false, executed: 0, remaining });
  if (!executed.length) {
    return { remainingBudget: remaining };
  }

  const summary = buildActionSummary(executed, remaining);
  return {
    nextPrompt: summary.promptForModel,
    visibleLog: summary.visibleLog,
    remainingBudget: remaining,
    executed,
  };
}

function normalizeActions(actions) {
  return actions
    .map((action, index) => {
      if (!action || typeof action !== 'object') return null;
      const type =
        action.action || action.name || action.type || action.kind || `action_${index + 1}`;
      return {
        id: action.id || `action_${Date.now()}_${index}`,
        type: String(type),
        path: action.path || action.file || null,
        payload: action.payload || action.data || {},
        description: action.description || action.message || null,
        sessionId: action.sessionId || action.session_id || null,
        gameId: action.gameId || action.game_id || null,
        idempotencyKey:
          action.idempotencyKey || `auto:${type}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      };
    })
    .filter(Boolean);
}

async function executeWorkspaceAction(action, token) {
  if (!action.type) {
    return { ok: false, error: 'missing_action_name' };
  }
  try {
    const res = await fetch('/api/rank/handle-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: action.type,
        payload: action.payload,
        session_id: action.sessionId,
        game_id: action.gameId,
        idempotencyKey: action.idempotencyKey,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error || 'action_failed', detail: data };
    }
    return { ok: true, result: data.result || null };
  } catch (err) {
    return { ok: false, error: err?.message || 'action_request_failed' };
  }
}

function buildActionSummary(executed, remainingBudget) {
  const lines = executed.map((entry, index) => {
    const status = entry.result?.ok ? 'ok' : entry.result?.error || 'failed';
    const target = entry.action.path ? ` (${entry.action.path})` : '';
    return `#${index + 1} ${entry.action.type}${target} → ${status}`;
  });
  const visibleLog = [
    'Action report:',
    ...lines,
    remainingBudget > 0
      ? `Trust budget remaining: ${remainingBudget}`
      : 'Trust budget exhausted. Awaiting user input.',
  ].join('\n');
  const promptForModel = [
    '<<ACTION_RESULTS>>',
    ...lines,
    remainingBudget > 0
      ? 'Continue without waiting for the user unless clarification is required.'
      : 'Trust budget is exhausted. Summarize the state and wait for the user.',
  ].join('\n');
  return { visibleLog, promptForModel };
}

function buildModelPayload({ logs, requestText, attachmentBundle, options }) {
  const history = (logs || []).slice(-HISTORY_SLICE).map(convertLogToContent).filter(Boolean);
  const headerLines = [
    PROMPT_HEADER,
    options.userInstructions ? `User instructions: ${options.userInstructions}` : null,
    options.trustEnabled
      ? `Auto actions: enabled (max ${options.remainingBudget ?? options.trustLimit} steps per turn).`
      : 'Auto actions: disabled. Ask before running tools.',
    options.sandboxEnabled
      ? 'Sandbox mode is ON. File edits/tests are allowed via actions.'
      : 'Sandbox mode is OFF. Avoid destructive changes.',
    options.testHarness
      ? 'Simple test harness is available. Use it when validating scripts.'
      : 'Simple test harness is unavailable.',
    attachmentBundle?.summary ? `Attachments:\n${attachmentBundle.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const parts = [{ text: `${headerLines}\n\n<<REQUEST>>\n${requestText}` }];
  if (attachmentBundle?.parts?.length) {
    attachmentBundle.parts.forEach((part) => parts.push(part));
  }

  return {
    prefer: 'keyring',
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature: 0.2, topP: 0.85 },
  };
}

function convertLogToContent(entry) {
  if (!entry || !entry.role) return null;
  let text = '';
  if (typeof entry.msg === 'string') {
    text = entry.msg;
  } else if (entry.msg?.text) {
    text = entry.msg.text;
  } else if (entry.msg?.message) {
    text = entry.msg.message;
  } else if (entry.msg?.action) {
    text = `Action ${entry.msg.action.type}: ${JSON.stringify(entry.msg.result || {})}`;
  } else if (entry.msg) {
    text = JSON.stringify(entry.msg);
  }
  if (!text) return null;
  const role = entry.role === 'assistant' ? 'model' : 'user';
  return { role, parts: [{ text }] };
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

function parseStructuredResponse(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/```(?:json)?([\s\S]+?)```/i);
  const target = match ? match[1] : trimmed;
  try {
    return JSON.parse(target);
  } catch {
    return { message: trimmed };
  }
}

function createAttachmentMeta(file) {
  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    file,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  };
}

async function prepareAttachmentBundle(attachments) {
  if (!attachments.length) {
    return { meta: [], parts: [], summary: '' };
  }
  const meta = attachments.map((item) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    type: item.type,
    lastModified: item.lastModified,
  }));
  const summary = meta
    .map((item, index) => `${index + 1}. ${item.name} (${formatBytes(item.size)})`)
    .join('\n');
  const parts = await Promise.all(
    attachments.map(async (item) => ({
      inlineData: {
        mimeType: item.type,
        data: await encodeFileToBase64(item.file),
      },
    }))
  );
  return { meta, parts, summary };
}

function encodeFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      if (!buffer) {
        reject(new Error('Failed to read file.'));
        return;
      }
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

function clampPosition(position, width, height) {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(0, window.innerWidth - width - 16);
  const maxY = Math.max(0, window.innerHeight - height - 16);
  return {
    x: clamp(position.x, 0, maxX),
    y: clamp(position.y, 0, maxY),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function applyPanelGeometry(el, prefs) {
  if (!el) return;
  if (prefs.mode === 'fullscreen') {
    el.style.width = 'auto';
    el.style.height = 'auto';
    el.style.transform = 'translate3d(0,0,0)';
    return;
  }
  el.style.width = `${prefs.size.width}px`;
  el.style.height = `${prefs.size.height}px`;
  el.style.transform = `translate3d(${prefs.position.x}px, ${prefs.position.y}px, 0)`;
}

function scheduleLiveFrame(ref, task) {
  cancelFrame(ref);
  ref.current = requestAnimationFrame(task);
}

function cancelFrame(ref) {
  if (ref.current) cancelAnimationFrame(ref.current);
  ref.current = null;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 6, 23, 0.88)',
    padding: 24,
    zIndex: 2000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    background: '#040b18',
    border: '1px solid #1e293b',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
    maxWidth: '96vw',
    maxHeight: '94vh',
  },
  panelFullscreen: {
    width: 'calc(100vw - 48px)',
    height: 'calc(100vh - 48px)',
    transform: 'translate3d(0, 0, 0)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #1f2a3b',
    cursor: 'grab',
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: '#e2e8f0',
  },
  subtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 12,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
  },
  badgeOk: {
    border: '1px solid #0d9488',
    color: '#99f6e4',
  },
  badgeWarn: {
    border: '1px solid #f97316',
    color: '#ffedd5',
  },
  badgeNeutral: {
    border: '1px solid #334155',
    color: '#cbd5f5',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    border: '1px solid #b91c1c',
    background: '#7f1d1d',
    color: '#fee2e2',
    fontSize: 18,
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    gap: 16,
    padding: 16,
    flex: 1,
    minHeight: 0,
  },
  chatColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minHeight: 0,
  },
  logPanel: {
    flex: 1,
    border: '1px solid #1f2937',
    borderRadius: 14,
    padding: 16,
    background: '#020617',
    overflowY: 'auto',
  },
  logBubble: {
    padding: 12,
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.2)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  logUser: { background: 'rgba(37,99,235,0.15)', borderColor: 'rgba(96,165,250,0.4)' },
  logAssistant: { background: 'rgba(30,64,175,0.25)', borderColor: 'rgba(129,140,248,0.5)' },
  logSystem: { background: 'rgba(15,23,42,0.4)', borderColor: 'rgba(148,163,184,0.3)' },
  logError: { background: 'rgba(127,29,29,0.3)', borderColor: 'rgba(248,113,113,0.4)' },
  logAction: { background: 'rgba(15,118,110,0.25)', borderColor: 'rgba(45,212,191,0.4)' },
  logAttachmentList: {
    marginTop: 8,
    fontSize: 11,
    color: '#cbd5f5',
  },
  attachmentsBar: {
    border: '1px dashed #1f2937',
    borderRadius: 12,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  attachmentChip: {
    border: '1px solid #334155',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 12,
    color: '#cbd5f5',
  },
  attachmentRemove: {
    marginLeft: 6,
    border: 'none',
    background: 'transparent',
    color: '#fca5a5',
    cursor: 'pointer',
  },
  composer: {
    border: '1px solid #1f2937',
    borderRadius: 14,
    padding: 12,
    background: '#030a17',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  chatInput: {
    minHeight: 110,
    resize: 'none',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: 10,
    fontSize: 13,
  },
  composerFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  composerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  attachButton: {
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '6px 10px',
    background: '#0f172a',
    color: '#cbd5f5',
    cursor: 'pointer',
  },
  autoStatus: {
    fontSize: 12,
    color: '#38bdf8',
  },
  primaryButton: (disabled) => ({
    borderRadius: 10,
    border: '1px solid #0891b2',
    background: disabled ? '#0f172a' : '#0284c7',
    color: '#e0f2fe',
    padding: '8px 18px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }),
  secondaryButton: {
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  infoBanner: {
    border: '1px solid #0ea5e9',
    background: 'rgba(14,165,233,0.1)',
    borderRadius: 10,
    padding: 8,
    color: '#bae6fd',
    fontSize: 12,
  },
  errorBanner: {
    border: '1px solid #f87171',
    background: 'rgba(248,113,113,0.12)',
    borderRadius: 10,
    padding: 8,
    color: '#fecaca',
    fontSize: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
  },
  historyPanel: {
    width: 240,
    border: '1px solid #1f2937',
    borderRadius: 14,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: '#030712',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    overflowY: 'auto',
  },
  historyItem: {
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  historySelectButton: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  historyDeleteButton: {
    border: 'none',
    background: 'transparent',
    color: '#fda4af',
    cursor: 'pointer',
    fontSize: 16,
  },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2,6,23,0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2100,
  },
  modal: {
    width: 'min(640px, 90vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 16,
    border: '1px solid #1f2937',
    background: '#030712',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    margin: 0,
    color: '#e2e8f0',
  },
  modalSubtitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: 12,
  },
  modalSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  keyInput: {
    width: '100%',
    minHeight: 80,
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: 10,
  },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  keyEntry: (active) => ({
    border: `1px solid ${active ? '#0ea5e9' : '#1f2937'}`,
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  }),
  activeBadge: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 999,
    background: '#0d9488',
    color: '#ecfeff',
    textTransform: 'uppercase',
  },
  smallButton: (disabled) => ({
    borderRadius: 8,
    border: '1px solid #2563eb',
    background: disabled ? '#0f172a' : '#172554',
    color: '#bfdbfe',
    padding: '4px 8px',
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  smallDangerButton: (disabled) => ({
    borderRadius: 8,
    border: '1px solid #7f1d1d',
    background: disabled ? '#2b0d0d' : '#450a0a',
    color: '#fecaca',
    padding: '4px 8px',
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  infoBox: {
    border: '1px solid #0ea5e9',
    background: 'rgba(14,165,233,0.1)',
    borderRadius: 10,
    padding: 8,
    color: '#bae6fd',
    fontSize: 12,
  },
  errorBox: {
    border: '1px solid #f87171',
    background: 'rgba(248,113,113,0.12)',
    borderRadius: 10,
    padding: 8,
    color: '#fecaca',
    fontSize: 12,
  },
  emptyBox: {
    border: '1px dashed #334155',
    borderRadius: 12,
    padding: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  instructionsTextarea: {
    width: '100%',
    minHeight: 200,
    borderRadius: 12,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: 12,
  },
  menu: {
    position: 'absolute',
    top: 70,
    right: 40,
    width: 260,
    background: '#020617',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    zIndex: 2050,
  },
  menuSection: {
    borderBottom: '1px solid #1e293b',
    paddingBottom: 10,
    marginBottom: 10,
  },
  menuRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#e2e8f0',
  },
  menuValue: {
    fontSize: 12,
    color: '#94a3b8',
  },
  menuButton: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '6px 10px',
    marginTop: 6,
    cursor: 'pointer',
  },
  emptyState: {
    color: '#64748b',
    textAlign: 'center',
  },
};
