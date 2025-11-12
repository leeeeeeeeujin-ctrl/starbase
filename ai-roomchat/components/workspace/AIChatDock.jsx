"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

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
  '당신은 Starbase 워크스페이스에서 코드를 도와주는 어시스턴트입니다.',
  '항상 JSON 형식으로만 응답하세요: {"message":string,"actions?":[], "followup?":string}.',
  '수정/테스트/검색이 필요하면 사용자가 직접 하도록 요구하지 말고 actions 항목으로 실행 계획을 제시하세요.',
  '설명은 간결하게, 막히기 전까지는 스스로 다음 단계를 이어가세요.',
].join('\n');

const DOCK_PREFS_KEY = 'workspace:aiChat:prefs.v2';
const DEFAULT_DOCK_PREFS = {
  mode: 'mini',
  position: { x: 32, y: 64 },
  size: { width: 440, height: 580 },
  historyOpen: false,
  trustEnabled: false,
  trustLimit: 5,
  sandboxEnabled: false,
  testHarness: false,
  userInstructions: '',
  sandboxPolicy: 'prompt',
  testerPolicy: 'prompt',
};

const MIN_WIDTH = 360;
const MIN_HEIGHT = 320;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const HISTORY_SLICE = 12;
const MAX_AUTO_CHAIN_DEPTH = 4;
const ACTION_ALLOWLIST_PATH = 'workspace/config/ai-actions-allowlist.json';
const POLICY_LABELS = {
  allow: '허용',
  prompt: '확인',
  deny: '거부',
};

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
  const [runMenuOpen, setRunMenuOpen] = useState(false);

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
    if (!runMenuOpen) return;
    const close = event => {
      if (
        !event.target.closest?.('[data-run-menu]') &&
        !event.target.closest?.('[data-run-menu-trigger]')
      ) {
        setRunMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [runMenuOpen]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useLayoutEffect(() => {
    if (!panelRef.current || pointerStateRef.current) return;
    applyPanelGeometry(panelRef.current, prefs);
  }, [prefs]);

  const handlePointerMove = useCallback((event) => {
    const state = pointerStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
    const el = panelRef.current;
    if (!el) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    state.lastDx = dx;
    state.lastDy = dy;
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

  const finalizePointerInteraction = useCallback(
    (event, cancelled = false) => {
      const state = pointerStateRef.current;
      if (!state || (event && event.pointerId !== state.pointerId)) return;
      const cleanup = state.cleanup;
      pointerStateRef.current = null;
      cleanup?.();
      const el = panelRef.current;
      cancelFrame(liveFrameRef);
      if (el && el.hasPointerCapture?.(state.pointerId)) {
        try {
          el.releasePointerCapture(state.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (!el) return;
      if (cancelled) {
        applyPanelGeometry(el, {
          mode: state.mode,
          position: { x: state.baseX, y: state.baseY },
          size: { width: state.baseWidth, height: state.baseHeight },
        });
        return;
      }
      const dx = event ? event.clientX - state.startX : state.lastDx || 0;
      const dy = event ? event.clientY - state.startY : state.lastDy || 0;
      if (state.kind === 'move') {
        const nextPosition = clampPosition(
          { x: state.baseX + dx, y: state.baseY + dy },
          state.baseWidth,
          state.baseHeight
        );
        el.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`;
        updatePrefs((prev) => ({ ...prev, position: nextPosition }));
      } else {
        const width = Math.max(MIN_WIDTH, state.baseWidth + dx);
        const height = Math.max(MIN_HEIGHT, state.baseHeight + dy);
        const nextPosition = clampPosition(
          { x: state.baseX, y: state.baseY },
          width,
          height
        );
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.transform = `translate3d(${nextPosition.x}px, ${nextPosition.y}px, 0)`;
        updatePrefs((prev) => ({ ...prev, size: { width, height }, position: nextPosition }));
      }
    },
    [handlePointerMove, updatePrefs]
  );

  const handlePointerUp = useCallback(
    (event) => finalizePointerInteraction(event, false),
    [finalizePointerInteraction]
  );

  const handlePointerCancel = useCallback(
    (event) => finalizePointerInteraction(event, true),
    [finalizePointerInteraction]
  );

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
        lastDx: 0,
        lastDy: 0,
        mode: prefs.mode,
      };
      state.cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
      };
      pointerStateRef.current = state;
      el.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    },
    [
      prefs.mode,
      prefs.position.x,
      prefs.position.y,
      prefs.size.height,
      prefs.size.width,
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
    ]
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
        error = `파일은 ${formatBytes(MAX_ATTACHMENT_BYTES)} 이하만 업로드할 수 있습니다.`;
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

  const setSandboxPolicy = useCallback(
    (policy) => updatePrefs((prev) => ({ ...prev, sandboxPolicy: policy })),
    [updatePrefs]
  );

  const setTesterPolicy = useCallback(
    (policy) => updatePrefs((prev) => ({ ...prev, testerPolicy: policy })),
    [updatePrefs]
  );

  const handleAllowlistCopy = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(ACTION_ALLOWLIST_PATH);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleTrustLimitChange = useCallback(
    (value) =>
      updatePrefs((prev) => ({
        ...prev,
        trustLimit: value,
        trustEnabled: value > 1,
      })),
    [updatePrefs]
  );

  const handlePickAttachment = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleHistoryToggle = useCallback(() => {
    updatePrefs((prev) => ({ ...prev, historyOpen: !prev.historyOpen }));
  }, [updatePrefs]);

  const chatOptions = useMemo(
    () => ({
      trustEnabled: prefs.trustEnabled,
      trustLimit: prefs.trustLimit,
      sandboxEnabled: prefs.sandboxPolicy !== 'deny',
      testHarness: prefs.testerPolicy !== 'deny',
      sandboxPolicy: prefs.sandboxPolicy,
      testerPolicy: prefs.testerPolicy,
      userInstructions: prefs.userInstructions,
    }),
    [prefs.sandboxPolicy, prefs.testerPolicy, prefs.trustEnabled, prefs.trustLimit, prefs.userInstructions]
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
        throw Object.assign(new Error(data?.error || 'AI 응답을 받지 못했습니다.'), {
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
        const warning = `AI가 ${normalizedActions.length}개의 작업을 요청했지만 신뢰 모드가 꺼져 있습니다.`;
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
    setRunMenuOpen(false);
    if (!sessionUser?.id) {
      setChatError('로그인 후에만 메시지를 보낼 수 있습니다.');
      append('error', '로그인 후에만 메시지를 보낼 수 있습니다.');
      return;
    }
    if (!hasActiveKey) {
      setChatError('Gemini와 대화하려면 활성화된 API 키가 필요합니다.');
      append('error', '활성화된 API 키가 없습니다.');
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
      const message = error?.message || '요청을 처리하지 못했습니다.';
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

  const autoHintText = useMemo(() => {
    if (autoStatus.running) {
      return `자동 실행 중 · 남은 ${autoStatus.remaining}회`;
    }
    if (chatOptions.trustLimit > 1) {
      return `자동 실행 허용 ${chatOptions.trustLimit}회`;
    }
    return '자동 실행 꺼짐';
  }, [autoStatus.running, autoStatus.remaining, chatOptions.trustLimit]);

  const backdropStyle = prefs.mode === 'fullscreen' ? styles.backdropFullscreen : styles.backdropWindow;
  const panelBaseStyle = prefs.mode === 'fullscreen' ? styles.panelFullscreen : styles.panelWindow;

  return (
    <div style={backdropStyle}>
      <div
        ref={panelRef}
        style={{
          ...panelBaseStyle,
          ...(prefs.mode === 'fullscreen'
            ? {}
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
          <div style={styles.headerInfo}>
            <h2 style={styles.title}>AI 코드 채팅</h2>
          </div>
                              <div style={styles.headerToolbar} data-stop-drag="true">
            <button
              type="button"
              style={styles.toolbarButton}
              onClick={handleHistoryToggle}
              title="대화 기록"
              aria-label="대화 기록"
            >
              기록
            </button>
            <button
              type="button"
              style={styles.toolbarButton}
              data-ai-chat-menu-trigger
              onClick={() => setMenuOpen((prev) => !prev)}
              title="메뉴"
              aria-label="메뉴"
            >
              ⋯
            </button>
            <button
              type="button"
              style={styles.toolbarButton}
              onClick={handleToggleMode}
              data-stop-drag="true"
              title={prefs.mode === 'fullscreen' ? '창 모드로 전환' : '전체 화면으로 전환'}
              aria-label={prefs.mode === 'fullscreen' ? '창 모드로 전환' : '전체 화면으로 전환'}
            >
              {prefs.mode === 'fullscreen' ? '▣' : '⛶'}
            </button>
            <button
              type="button"
              style={styles.closeButton}
              onClick={onClose}
              title="닫기"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </header>

        <div style={styles.body}>
          <section style={styles.chatColumn}>
            {keyringMessage && <div style={styles.infoBanner}>{keyringMessage}</div>}
            {chatError && <div style={styles.errorBanner}>{chatError}</div>}

            <div ref={logRef} style={styles.logPanel}>
              <ChatLog logs={logs} />
            </div>

            {(attachments.length > 0 || attachmentError) && (
              <AttachmentsBar
                attachments={attachments}
                onRemove={removeAttachment}
                error={attachmentError}
              />
            )}

            <div style={styles.composerBar} data-stop-drag="true">
              <button
                type="button"
                style={styles.attachCircle}
                onClick={handlePickAttachment}
                title="파일 첨부"
                aria-label="파일 첨부"
              >
                +
              </button>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="변경 요청이나 질문을 입력하세요"
                style={styles.chatInput}
                rows={1}
              />
              <div style={styles.sendGroup}>
                <div style={styles.sendButtons}>
                  <button
                    type="button"
                    style={styles.sendButton(sending || !input.trim() || !hasActiveKey)}
                    onClick={handleSend}
                    disabled={sending || !input.trim() || !hasActiveKey}
                    aria-label="보내기"
                    title="보내기"
                  >
                    {sending ? '···' : '➤'}
                  </button>
                  <button
                    type="button"
                    style={styles.sendMenuButton}
                    data-run-menu-trigger
                    onClick={() => setRunMenuOpen((prev) => !prev)}
                    aria-label="실행 옵션"
                    title="실행 옵션"
                  >
                    ▼
                  </button>
                </div>
              </div>
              {runMenuOpen && (
                <RunPolicyMenu
                  sandboxPolicy={prefs.sandboxPolicy}
                  testerPolicy={prefs.testerPolicy}
                  onChangeSandbox={setSandboxPolicy}
                  onChangeTester={setTesterPolicy}
                  allowlistPath={ACTION_ALLOWLIST_PATH}
                />
              )}
            </div>
            <div style={styles.autoHint}>{autoHintText}</div>
          </section>
        </div>
        {prefs.mode === 'mini' && (
          <div
            style={styles.resizeHandle}
            onPointerDown={(event) => beginPointerInteraction(event, 'resize')}
            aria-label="창 크기 조절"
          />
        )}
        {prefs.historyOpen && (
          <HistoryPanel
            sessions={sessions}
            currentId={currentId}
            onSelect={setCurrentId}
            onDelete={deleteSession}
            onNewChat={startNewChat}
            onClose={handleHistoryToggle}
          />
        )}
        {menuOpen && (
          <DockMenu
            onTrustLimitChange={handleTrustLimitChange}
            onOpenInstructions={() => setInstructionsOpen(true)}
            onOpenKeyring={() => {
              setKeyringOpen(true);
              reloadKeyring();
            }}
            onCopyAllowlistPath={handleAllowlistCopy}
            trustLimit={prefs.trustLimit}
            allowlistPath={ACTION_ALLOWLIST_PATH}
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
      x: Number.isFinite(prefs?.position?.x)
        ? prefs.position.x
        : computeDefaultPosition(prefs.size).x,
      y: Number.isFinite(prefs?.position?.y)
        ? prefs.position.y
        : computeDefaultPosition(prefs.size).y,
    },
    size: {
      width: Math.max(MIN_WIDTH, Number(prefs?.size?.width) || DEFAULT_DOCK_PREFS.size.width),
      height: Math.max(MIN_HEIGHT, Number(prefs?.size?.height) || DEFAULT_DOCK_PREFS.size.height),
    },
    trustLimit: Math.max(
      1,
      Math.min(25, Number(prefs?.trustLimit) || DEFAULT_DOCK_PREFS.trustLimit)
    ),
    sandboxPolicy: normalizePolicy(prefs?.sandboxPolicy),
    testerPolicy: normalizePolicy(prefs?.testerPolicy),
  };
}

function normalizePolicy(value) {
  return ['prompt', 'allow', 'deny'].includes(value) ? value : 'prompt';
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
      setMessage('로그인하면 API 키를 연결할 수 있습니다.');
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
      setMessage(nextEntries.length ? '' : 'Gemini API 키를 등록하면 채팅을 시작할 수 있습니다.');
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
      setError(new Error('API 키를 등록하려면 로그인하세요.'));
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
  const modalRoot = typeof document !== 'undefined' ? document.body : null;
  if (!modalRoot) return null;

  return createPortal(
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>API 키 관리</h3>
            <p style={styles.modalSubtitle}>
              입력한 키는 Supabase에 암호화되어 저장됩니다. {entries.length}/{limit}
            </p>
          </div>
          <div style={styles.modalHeaderButtons}>
            <button type="button" style={styles.secondaryButton} onClick={onRefresh}>
              새로 고침
            </button>
            <button type="button" style={styles.secondaryButton} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        {message && <div style={styles.infoBox}>{message}</div>}
        {loading && <div style={styles.infoBox}>키 목록을 불러오는 중입니다…</div>}
        {error && (
          <div style={styles.errorBox}>{error.message || '키를 불러오는 중 오류가 발생했습니다.'}</div>
        )}
        <div style={styles.modalSection}>
          <textarea
            value={pendingKey}
            onChange={(event) => setPendingKey(event.target.value)}
            placeholder="예: AIza... / Gemini API 키를 붙여 넣으세요."
            style={styles.keyInput}
          />
          <button
            type="button"
            style={styles.primaryButton(!pendingKey.trim() || submitting)}
            onClick={onRegister}
            disabled={!pendingKey.trim() || submitting}
          >
            {submitting ? '등록 중…' : '등록하고 활성화'}
          </button>
        </div>
        <div style={styles.keyGrid}>
          {entries.length === 0 && <div style={styles.emptyBox}>등록된 키가 없습니다.</div>}
          {entries.map((entry) => (
            <div key={entry.id} style={styles.keyEntryCard}>
              <div style={styles.keyMeta}>
                <span style={styles.keyProvider}>{formatKeyProviderLabel(entry.provider)}</span>
                {entry.isActive && <span style={styles.activeBadge}>활성</span>}
              </div>
              <div style={styles.keyDetails}>
                <span>{entry.modelLabel || entry.geminiModel || '모델 정보 없음'}</span>
                <code style={styles.keySample}>{entry.keySample || '****'}</code>
              </div>
              <div style={styles.keyActions}>
                <button
                  type="button"
                  style={styles.smallButton(false)}
                  onClick={() => (entry.isActive ? onDeactivate(entry) : onActivate(entry))}
                  disabled={submitting}
                >
                  {entry.isActive ? '비활성화' : '이 키 사용'}
                </button>
                <button
                  type="button"
                  style={styles.smallDangerButton(submitting)}
                  onClick={() => onRemove(entry)}
                  disabled={submitting}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    modalRoot
  );
}

function InstructionsModal({ initialValue, onSave, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  const modalRoot = typeof document !== 'undefined' ? document.body : null;
  if (!modalRoot) return null;

  return createPortal(
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>사용자 지침</h3>
            <p style={styles.modalSubtitle}>입력한 지침은 프로젝트 전체에 공유됩니다.</p>
          </div>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            닫기
          </button>
        </div>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={styles.instructionsTextarea}
          placeholder="예: 테스트를 실행할 때는 로그를 모두 요약해 주세요."
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" style={styles.secondaryButton} onClick={() => setValue('')}>
            초기화
          </button>
          <button
            type="button"
            style={styles.primaryButton(!value && !initialValue)}
            onClick={() => onSave(value)}
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
}function InstructionsModal({ initialValue, onSave, onClose }) {
  const [value, setValue] = useState(initialValue || '');
  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>사용자 지침</h3>
            <p style={styles.modalSubtitle}>입력한 지침은 모든 프롬프트에 함께 전달됩니다.</p>
          </div>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            닫기
          </button>
        </div>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          style={styles.instructionsTextarea}
          placeholder="예: 타입스크립트를 우선으로 사용하고, 커밋은 기능 단위로 분리해 주세요."
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" style={styles.secondaryButton} onClick={() => setValue('')}>
            초기화
          </button>
          <button
            type="button"
            style={styles.primaryButton(!value && !initialValue)}
            onClick={() => onSave(value)}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
function HistoryPanel({ sessions, currentId, onSelect, onDelete, onNewChat, onClose }) {
  return (
    <div style={styles.historyDrawerBackdrop}>
      <aside style={styles.historyPanel}>
        <div style={styles.historyHeader}>
          <h4 style={{ margin: 0 }}>대화 기록</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={styles.secondaryButton} onClick={onNewChat}>
              새 대화
            </button>
            <button type="button" style={styles.secondaryButton} onClick={onClose}>
              닫기
            </button>
          </div>
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
                  <div style={{ fontWeight: 600 }}>{session.title || '제목 없음'}</div>
                  <div style={{ fontSize: 11, color: '#b6c2d9' }}>
                    {preview || '메시지가 없습니다.'}
                  </div>
                </button>
                <button
                  type="button"
                  style={styles.historyDeleteButton}
                  onClick={() => onDelete(session.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function AttachmentsBar({ attachments, onRemove, error }) {
  return (
    <div style={styles.attachmentsBar}>
      <div style={styles.attachmentRow}>
        {attachments.map((item) => (
          <span key={item.id} style={styles.attachmentChip}>
            {item.name} ({formatBytes(item.size)})
            <button type="button" style={styles.attachmentRemove} onClick={() => onRemove(item.id)}>
              ×
            </button>
          </span>
        ))}
      </div>
      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

function DockMenu({
  onTrustLimitChange,
  onOpenInstructions,
  onOpenKeyring,
  onCopyAllowlistPath,
  trustLimit,
  allowlistPath,
}) {
  return (
    <div style={styles.menu} data-ai-chat-menu="true">
      <div style={styles.menuSection}>
        <div style={{ ...styles.menuRow, justifyContent: 'space-between' }}>
          <span>자동 실행 횟수</span>
          <span style={styles.menuValue}>{trustLimit}회</span>
        </div>
        <input
          type="range"
          min="1"
          max="25"
          value={trustLimit}
          onChange={(event) => onTrustLimitChange(Number(event.target.value))}
          style={{ width: '100%' }}
        />
        <small>슬라이더를 밀어 자동 작업 허용 횟수를 정할 수 있습니다.</small>
      </div>
      <div style={styles.menuSection}>
        <div style={styles.menuList}>
          <button type="button" style={styles.menuListButton} onClick={onOpenInstructions}>
            사용자 지침 관리
          </button>
          <button type="button" style={styles.menuListButton} onClick={onOpenKeyring}>
            API 키 관리
          </button>
        </div>
      </div>
      <div style={styles.menuSection}>
        <div style={styles.menuInfo}>
          실행 버튼 옆 ▼ 메뉴에서 샌드박스·테스트 권한을 설정할 수 있습니다.
          <div style={styles.menuPath}>{allowlistPath}</div>
          <button type="button" style={styles.menuButton} onClick={onCopyAllowlistPath}>
            경로 복사
          </button>
        </div>
      </div>
    </div>
  );
}

function RunPolicyMenu({
  sandboxPolicy,
  testerPolicy,
  onChangeSandbox,
  onChangeTester,
  allowlistPath,
}) {
  const renderButtons = (active, onChange) =>
    ['allow', 'prompt', 'deny'].map((policy) => (
      <button
        key={policy}
        type="button"
        style={styles.policyButton(active === policy)}
        onClick={() => onChange(policy)}
      >
        {POLICY_LABELS[policy]}
      </button>
    ));

  return (
    <div style={styles.runMenu} data-run-menu="true">
      <div style={styles.runMenuSection}>
        <div style={styles.policyRow}>
          <span>샌드박스 작업</span>
        </div>
        <div style={styles.policyButtons}>{renderButtons(sandboxPolicy, onChangeSandbox)}</div>
      </div>
      <div style={styles.runMenuSection}>
        <div style={styles.policyRow}>
          <span>간이 테스트</span>
        </div>
        <div style={styles.policyButtons}>{renderButtons(testerPolicy, onChangeTester)}</div>
      </div>
      <div style={styles.allowlistNote}>
        '허용'을 선택하면 동일 명령은 {allowlistPath}에 기록되어 자동 실행됩니다.
      </div>
    </div>
  );
}function RunPolicyMenu({
  sandboxPolicy,
  testerPolicy,
  onChangeSandbox,
  onChangeTester,
  allowlistPath,
}) {
  const renderButtons = (active, onChange) =>
    ['allow', 'prompt', 'deny'].map((policy) => (
      <button
        key={policy}
        type="button"
        style={styles.policyButton(active === policy)}
        onClick={() => onChange(policy)}
      >
        {POLICY_LABELS[policy]}
      </button>
    ));

  return (
    <div style={styles.runMenu} data-run-menu="true">
      <div style={styles.runMenuSection}>
        <div style={styles.policyRow}>
          <span>샌드박스 작업</span>
        </div>
        <div style={styles.policyButtons}>{renderButtons(sandboxPolicy, onChangeSandbox)}</div>
      </div>
      <div style={styles.runMenuSection}>
        <div style={styles.policyRow}>
          <span>간이 테스트</span>
        </div>
        <div style={styles.policyButtons}>{renderButtons(testerPolicy, onChangeTester)}</div>
      </div>
      <div style={styles.allowlistNote}>
        '허용'을 선택하면 동일 명령은 {allowlistPath} 에 기록되어 자동 실행됩니다.
      </div>
    </div>
  );
}

function ChatLog({ logs }) {
  if (!logs.length) {
    return <div style={styles.emptyState}>아직 메시지가 없습니다.</div>;
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
    append('error', { message: err.message || '작업을 수행하려면 로그인이 필요합니다.' });
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
    const status = entry.result?.ok ? '성공' : entry.result?.error || '실패';
    const target = entry.action.path ? ` (${entry.action.path})` : '';
    return `#${index + 1} ${entry.action.type}${target} → ${status}`;
  });
  const visibleLog = [
    '자동 작업 요약',
    ...lines,
    remainingBudget > 0
      ? `남은 신뢰 예산: ${remainingBudget}`
      : '신뢰 예산이 모두 소진되었습니다. 사용자 입력을 기다립니다.',
  ].join('\n');
  const promptForModel = [
    '<<ACTION_RESULTS>>',
    ...lines,
    remainingBudget > 0
      ? '추가 설명이 필요하지 않다면 사용자 응답을 기다리지 말고 계속 진행하세요.'
      : '신뢰 예산이 없으므로 현재 상태를 요약하고 사용자 입력을 기다리세요.',
  ].join('\n');
  return { visibleLog, promptForModel };
}

function buildModelPayload({ logs, requestText, attachmentBundle, options }) {
  const history = (logs || []).slice(-HISTORY_SLICE).map(convertLogToContent).filter(Boolean);
  const headerLines = [
    PROMPT_HEADER,
    options.userInstructions ? `사용자 지침: ${options.userInstructions}` : null,
    options.trustEnabled
      ? `자동 작업: 사용 (이번 회차 최대 ${options.remainingBudget ?? options.trustLimit}회).`
      : '자동 작업: 사용 안 함. 도구 실행 전 사용자에게 확인하세요.',
    options.sandboxEnabled
      ? '샌드박스 모드: 켜짐 (파일 수정/테스트 작업 허용).'
      : '샌드박스 모드: 꺼짐 (파괴적 변경은 피하세요).',
    options.testHarness
      ? '간이 테스트 환경을 사용할 수 있습니다.'
      : '간이 테스트 환경을 사용할 수 없습니다.',
    attachmentBundle?.summary ? `첨부 파일:\n${attachmentBundle.summary}` : null,
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
    text = `작업 ${entry.msg.action.type}: ${JSON.stringify(entry.msg.result || {})}`;
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

function computeDefaultPosition(size) {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_DOCK_PREFS.position };
  }
  const usableWidth = Math.min(size?.width || DEFAULT_DOCK_PREFS.size.width, window.innerWidth - 32);
  const usableHeight = Math.min(size?.height || DEFAULT_DOCK_PREFS.size.height, window.innerHeight - 32);
  return {
    x: Math.max(16, window.innerWidth - usableWidth - 24),
    y: Math.max(16, window.innerHeight - usableHeight - 24),
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
  backdropWindow: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    background: 'transparent',
    zIndex: 2000,
  },
  backdropFullscreen: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'auto',
    background: 'rgba(2, 6, 23, 0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 2000,
  },
  panelWindow: {
    pointerEvents: 'auto',
    width: '420px',
    height: '600px',
    background: 'rgba(5, 11, 22, 0.95)',
    border: '1px solid #131c2f',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
    position: 'relative',
    touchAction: 'none',
  },
  panelFullscreen: {
    pointerEvents: 'auto',
    width: 'calc(100vw - 48px)',
    height: 'calc(100vh - 48px)',
    background: '#040b18',
    border: '1px solid #1e293b',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
    position: 'relative',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1f2a3b',
    cursor: 'grab',
    touchAction: 'none',
  },
  headerInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: '#e2e8f0',
  },
  subtitle: {
    margin: 0,
    color: '#b6c2d9',
    fontSize: 12,
  },
  headerToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  toolbarButton: {
    minWidth: 36,
    height: 30,
    borderRadius: 9,
    border: '1px solid #2b3145',
    background: '#0d1424',
    color: '#e0e7ff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
    fontWeight: 500,
    fontSize: 12,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  closeButton: {
    minWidth: 34,
    height: 30,
    borderRadius: 10,
    border: '1px solid #b91c1c',
    background: '#7f1d1d',
    color: '#fee2e2',
    fontSize: 16,
    cursor: 'pointer',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 12px',
    flex: 1,
    minHeight: 0,
  },
  chatColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
  },
  logPanel: {
    flex: 1,
    border: '1px solid #273449',
    borderRadius: 14,
    padding: 12,
    background: '#020617',
    overflowY: 'auto',
    color: '#e2e8f0',
  },
  logBubble: {
    padding: 12,
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
    lineHeight: 1.6,
    maxWidth: '82%',
    alignSelf: 'flex-start',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  logUser: { background: 'rgba(167,139,250,0.18)', borderColor: '#a78bfa', alignSelf: 'flex-end', color: '#f5f3ff' },
  logAssistant: { background: 'rgba(96,165,250,0.15)', borderColor: '#60a5fa', alignSelf: 'flex-start', color: '#eaf2ff' },
  logSystem: { background: 'rgba(2,6,23,0.5)', borderColor: 'rgba(148,163,184,0.35)', color: '#cbd5e1' },
  logError: { background: 'rgba(127,29,29,0.3)', borderColor: 'rgba(248,113,113,0.5)', color: '#fee2e2' },
  logAction: { background: 'rgba(13,148,136,0.22)', borderColor: 'rgba(45,212,191,0.45)', color: '#ccfbf1' },
  logAttachmentList: {
    marginTop: 8,
    fontSize: 11,
    color: '#dbeafe',
  },
  attachmentsBar: {
    border: '1px solid #273449',
    borderRadius: 12,
    padding: 8,
    background: '#050d1c',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  attachmentRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  attachmentChip: {
    border: '1px solid #334155',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 12,
    color: '#dbeafe',
  },
  attachmentRemove: {
    marginLeft: 6,
    border: 'none',
    background: 'transparent',
    color: '#fca5a5',
    cursor: 'pointer',
  },
  chatInput: {
    flex: 1,
    minHeight: 34,
    resize: 'none',
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: '6px 10px',
    fontSize: 13,
    lineHeight: 1.35,
  },
  composerBar: {
    border: '1px solid #273449',
    borderRadius: 14,
    padding: '6px 8px',
    background: '#030a17',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  attachCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    fontSize: 20,
    lineHeight: 1,
    cursor: 'pointer',
  },
  sendGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sendButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  sendButton: (disabled) => ({
    borderRadius: 12,
    border: '1px solid #8b5cf6',
    background: disabled ? '#2d1b46' : '#7c3aed',
    color: '#f3e8ff',
    width: 36,
    height: 36,
    fontSize: 18,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }),
  sendMenuButton: {
    width: 32,
    height: 36,
    borderRadius: 10,
    border: '1px solid #273449',
    background: '#0b1222',
    color: '#dbeafe',
    fontSize: 14,
    cursor: 'pointer',
  },
  secondaryButton: {
    borderRadius: 8,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  primaryButton: (disabled) => ({
    borderRadius: 10,
    border: '1px solid #8b5cf6',
    background: disabled ? '#0f172a' : '#7c3aed',
    color: '#e0f2fe',
    padding: '8px 18px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }),
  infoBanner: {
    border: '1px solid #60a5fa',
    background: 'rgba(96,165,250,0.12)',
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
  historyDrawerBackdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(2,6,23,0.65)',
    display: 'flex',
    justifyContent: 'flex-start',
    padding: 16,
    zIndex: 2040,
  },
  historyPanel: {
    width: 240,
    border: '1px solid #273449',
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
    border: '1px solid #273449',
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
    width: 'min(520px, 92vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    borderRadius: 16,
    border: '1px solid #273449',
    background: '#030712',
    padding: 16,
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
  modalHeaderButtons: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  modalTitle: {
    margin: 0,
    color: '#e2e8f0',
  },
  modalSubtitle: {
    margin: 0,
    color: '#b6c2d9',
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
    borderRadius: 12,
    border: '1px solid #2a3245',
    background: '#050b18',
    color: '#e5edff',
    padding: 12,
  },
  keyGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  keyEntryCard: {
    border: '1px solid #2a3245',
    borderRadius: 14,
    padding: 14,
    background: '#070d1a',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  keyMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  keyProvider: {
    fontWeight: 600,
    color: '#f8fafc',
  },
  keyDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 13,
    color: '#cbd5f5',
  },
  keySample: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#a5b4fc',
  },
  keyActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  activeBadge: {
    fontSize: 10,
    padding: '2px 8px',
    borderRadius: 999,
    background: '#7c3aed',
    color: '#f3e8ff',
    textTransform: 'uppercase',
  },
  smallButton: (disabled) => ({
    borderRadius: 8,
    border: '1px solid #7c3aed',
    background: disabled ? '#2a1a44' : '#3b1d74',
    color: '#f3e8ff',
    padding: '4px 10px',
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
    border: '1px solid #60a5fa',
    background: 'rgba(96,165,250,0.12)',
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
    color: '#b6c2d9',
    textAlign: 'center',
  },
  instructionsTextarea: {
    width: '100%',
    minHeight: 200,
    borderRadius: 12,
    border: '1px solid #2a3245',
    background: '#050b18',
    color: '#e5edff',
    padding: 12,
  },
  menu: {
    position: 'absolute',
    top: 70,
    right: 40,
    width: 260,
    background: '#020617',
    border: '1px solid #273449',
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
    color: '#b6c2d9',
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
  menuList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  menuListButton: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid #273449',
    background: '#050d1c',
    color: '#e2e8f0',
    padding: '8px 10px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  menuInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    color: '#dbeafe',
  },
  menuPath: {
    fontFamily: 'monospace',
    fontSize: 12,
    background: '#0b1222',
    border: '1px solid #1d2536',
    borderRadius: 6,
    padding: '4px 6px',
    color: '#9fb3df',
  },
  emptyState: {
    color: '#64748b',
    textAlign: 'center',
  },
  runMenu: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    right: 8,
    width: 260,
    borderRadius: 12,
    border: '1px solid #273449',
    background: '#050b18',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    zIndex: 2050,
  },
  runMenuSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  policyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#e2e8f0',
  },
  policyButtons: {
    display: 'flex',
    gap: 6,
  },
  policyButton: (active) => ({
    borderRadius: 8,
    border: `1px solid ${active ? '#0ea5e9' : '#1f2937'}`,
    background: active ? 'rgba(167,139,250,0.15)' : '#0b1222',
    color: active ? '#ede9fe' : '#94a3b8',
    padding: '4px 8px',
    fontSize: 12,
    cursor: 'pointer',
  }),
  allowlistNote: {
    fontSize: 11,
    color: '#b6c2d9',
  },
  resizeHandle: {
    position: 'absolute',
    width: 18,
    height: 18,
    right: 8,
    bottom: 8,
    borderBottom: '2px solid rgba(148,163,184,0.6)',
    borderRight: '2px solid rgba(148,163,184,0.6)',
    borderBottomRightRadius: 4,
    cursor: 'nwse-resize',
  },
  autoHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#8ea2c8',
  },
};























