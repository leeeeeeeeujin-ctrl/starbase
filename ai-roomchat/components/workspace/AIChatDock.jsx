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

// Ensure styles is always defined in module scope before any usage.
// Some subcomponents may reference `styles` during early render in production builds.
// We assign the object at the end of the file.
let styles;

const PROMPT_HEADER = [
  '당신은 Starbase 워크스페이스에서 코드를 도와주는 어시스턴트입니다.',
  '반드시 한국어로, 그리고 아래 JSON 스키마로만 응답하세요. 설명/코드블록 없이 JSON 한 개만 출력합니다.',
  'JSON 스키마: {"message": string, "actions?": Action[], "followup?": string}',
  '출력 예시: {"message":"변경 요약","actions":[{"action":"write_file","payload":{"path":"/README.md","content":"..."}}]}',
  '',
  'Action 형식(정확한 이름을 사용하세요):',
  '- read_file { path: string }  — 워크스페이스의 파일 내용을 읽습니다.',
  '- list_files { path?: string }  — 디렉터리 목록을 읽습니다. 지정 안 하면 루트.',
  '- write_file { path: string, content: string }  — 파일을 새로 쓰거나 교체합니다.',
  '- edit_patch { path: string, diff: string }  — 해당 파일에 유니파이드 패치(diff)를 적용합니다.',
  '- delete_file { path: string } — 파일을 삭제합니다.',
  '- move_file { from: string, to: string } — 파일/경로를 이동 또는 이름 변경합니다.',
  '- mkdirs { path: string } — 디렉터리를 생성합니다(필요시 중첩).',
  '- delete_dir { path: string } — 디렉터리를 삭제합니다.',
  '- copy_file { from: string, to: string } — 파일 복사.',
  '- stat_file { path: string } — 파일/디렉터리 메타 조회.',
  '- search_text { query: string, path?: string, max_results?: number } — 텍스트를 검색합니다.',
  '- read_file_range { path: string, start?: number, end?: number } — 일부 범위만 읽습니다.',
  '- test_run { preset?: string } — 테스트 실행(unit/e2e 등 사전 정의).',
  '- lint_run { preset?: string } — 린트 실행.',
  '- build_run { preset?: string } — 빌드 실행.',
  '- batch { actions: {action,payload}[], sequential?: boolean } — 여러 작업을 묶어 순차/병렬 실행.',
  '- sandbox_exec { cmd: string, cwd?: string, timeout_ms?: number }  — 샌드박스에서 명령을 실행합니다.',
  '- memory_put { scope: "short"|"long", key: string, content: string } — 메모리에 기록합니다.',
  '- memory_delete { scope: "short"|"long", key: string } — 메모리에서 항목을 삭제합니다.',
  '- memory_promote { key: string } — 단기 → 장기로 승격합니다.',
  '- memory_list { scope: "short"|"long" } — 메모리 목록을 조회합니다.',
  '- memory_todo_add { text: string } — 단기기억 TODO에 항목 추가.',
  '- memory_todo_replace { items: string[] } — TODO 전체 교체.',
  '- memory_todo_remove { index?: number, text?: string } — TODO 항목 제거.',
  '- memory_todo_clear {} — TODO 모두 비우기.',
  '- memory_todo_list {} — TODO 목록 조회.',
  '- ui_sandbox_step { sessionId?: string, action: string, params?: object } — 외부 UI 테스트 샌드박스 에이전트에 한 스텝을 요청합니다.',
  '',
  '워크스페이스 이해 방법:',
  '- 레포 전체를 스캔하려 하지 말고, 먼저 사용자가 언급한 경로나 핵심 문서 몇 개만 읽으세요.',
  '- 파일 경로는 기본적으로 workspace/ 아래를 기준으로 합니다. 예: \"/game/runtime.config.json\" → 내부적으로 \"workspace/game/runtime.config.json\"으로 저장됩니다.',
  '- 특히 workspace/ai-roomchat와 관련된 작업에서는 필요 시 다음 문서부터 참고합니다:',
  '  • ai-roomchat/docs/WORKSPACE_EDITOR_RUNTIME.md',
  '  • ai-roomchat/docs/capabilities/*.md',
  '  • ai-roomchat/docs/AI_GAME_PROMPTS.md',
  '- 같은 파일을 여러 번 반복해서 읽지 말고, 한 번 읽은 내용은 memory_* 액션으로 요약/기억해 두세요.',
  '',
  '주의사항:',
  '- runCommand, readFile 같은 다른 이름은 사용하지 마세요. 위의 정확한 이름만 사용하세요.',
  '- 여러 단계를 합칠 수 있으면 batch로 묶어 순차 실행하세요(또는 actions 배열에 여러 개를 제시).',
  '- 첨부 파일이 있으면 message에 활용 계획을 간단히 쓰고, 필요 시 write_file로 반영하세요.',
  '- 기억 관리 원칙:',
  '  • 반복되거나 중요한 사실/규칙은 memory_put(scope:"short")로 기록한 뒤, 여러 번 쓰이거나 장기적으로 중요하면 memory_promote로 장기(long)로 올리세요.',
  '  • TODO는 memory_todo_* 액션으로 관리하세요. 완료/불필요 항목은 제거하거나 숨겨 가독성을 유지하고, 필요하면 memory_put(scope:"long", key:"TODO")로 장기 보관하세요.',
  '  • 불필요해진 단기 기억은 memory_delete로 정리해 프롬프트 길이를 줄이세요.',
  '- 연속 실행 예산이 제한되어 있으므로, 각 action은 목적을 달성하는 최소 단위로 작성하세요.',
  '- 설명은 간결하게. 불필요한 서문/인사말은 피하고 JSON만 출력하세요.',
].join('\n');

const DOCK_PREFS_KEY = 'workspace:aiChat:prefs.v2';
const AUTOINIT_FLAG = 'workspace:aiChat:autoinit.applied';
const REMOTE_MEMORY_ENABLED = process.env.NEXT_PUBLIC_REMOTE_MEMORY === '1';
const AUTOINIT_ENABLED = process.env.NEXT_PUBLIC_WORKSPACE_AUTOINIT === '1';
const DEFAULT_DOCK_PREFS = {
  mode: 'mini',
  position: { x: 24, y: 48 },
  size: { width: 360, height: 480 },
  historyOpen: false,
  trustEnabled: false,
  trustLimit: 5,
  sandboxEnabled: false,
  testHarness: false,
  userInstructions: '',
  sandboxPolicy: 'prompt',
  testerPolicy: 'prompt',
};

const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const HISTORY_SLICE = 12;
const MAX_AUTO_CHAIN_DEPTH = 4;
const ACTION_ALLOWLIST_PATH = 'workspace/config/ai-actions-allowlist.json';
const POLICY_LABELS = {
  allow: '허용',
  prompt: '매번 확인',
  deny: '거부',
};
const ALLOWED_ACTIONS = new Set([
  'read_file','list_files','write_file','edit_patch','delete_file','move_file','mkdirs','delete_dir','copy_file','stat_file','search_text','read_file_range','sandbox_exec','memory_put','memory_delete','memory_promote','memory_list','test_run','lint_run','build_run','batch',
  'memory_todo_add','memory_todo_replace','memory_todo_remove','memory_todo_clear','memory_todo_list',
  'memory_todo_prefs_set','memory_todo_prefs_get'
]);

// --- Allowlist helpers (client-side) ---
const ALLOWLIST_DEFAULT = { sandbox_exec: { cmds: [] } };

function loadPrefsFromStorage() {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem('workspace:aiChat:prefs.v2');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function readAllowlist(token) {
  try {
    const res = await fetch('/api/rank/handle-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ action: 'read_file', payload: { path: ACTION_ALLOWLIST_PATH } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error || 'read_failed');
    try {
      const obj = JSON.parse(String(data?.result?.content || data?.content || '{}'));
      return obj && typeof obj === 'object' ? obj : { ...ALLOWLIST_DEFAULT };
    } catch {
      return { ...ALLOWLIST_DEFAULT };
    }
  } catch {
    return { ...ALLOWLIST_DEFAULT };
  }
}

async function writeAllowlist(token, allowlist) {
  try {
    const content = JSON.stringify(allowlist || ALLOWLIST_DEFAULT, null, 2);
    const res = await fetch('/api/rank/handle-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ action: 'write_file', payload: { path: ACTION_ALLOWLIST_PATH, content } }),
    });
    const data = await res.json().catch(() => ({}));
    return !!(res.ok && !data?.error);
  } catch {
    return false;
  }
}

async function recordSandboxAllowIfEnabled(token, cmd) {
  if (!cmd) return;
  try {
    const prefs = loadPrefsFromStorage();
    if (!prefs || prefs.sandboxPolicy !== 'allow') return;
    const allow = await readAllowlist(token);
    const list = Array.isArray(allow?.sandbox_exec?.cmds) ? allow.sandbox_exec.cmds : [];
    if (!list.includes(cmd)) {
      const next = { ...ALLOWLIST_DEFAULT, ...(allow || {}) };
      const cur = Array.isArray(next.sandbox_exec?.cmds) ? next.sandbox_exec.cmds : [];
      next.sandbox_exec = { cmds: [...cur, cmd].slice(0, 200) };
      await writeAllowlist(token, next);
    }
  } catch {
    /* ignore */
  }
}

async function checkSandboxAllowed(token, cmd) {
  const prefs = loadPrefsFromStorage();
  const policy = prefs?.sandboxPolicy || 'prompt';
  if (policy === 'deny') return false;
  if (policy === 'allow') {
    // Ensure allowlist has the cmd before server-side enforcement
    try {
      const allow = await readAllowlist(token);
      const next = { ...ALLOWLIST_DEFAULT, ...(allow || {}) };
      const cur = Array.isArray(next.sandbox_exec?.cmds) ? next.sandbox_exec.cmds : [];
      if (!cur.includes(cmd)) {
        next.sandbox_exec = { cmds: [...cur, cmd].slice(0, 200) };
        await writeAllowlist(token, next);
      }
    } catch {}
    return true;
  }
  // prompt policy: allow if already in allowlist, else ask user
  try {
    const allow = await readAllowlist(token);
    const list = Array.isArray(allow?.sandbox_exec?.cmds) ? allow.sandbox_exec.cmds : [];
    if (list.includes(cmd)) return true;
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`샌드박스 명령을 실행할까요?\n\n${cmd}`);
      if (ok) {
        // optimistic: 기록 후 서버 실행 (서버가 allowlist를 강제함)
        const allow = await readAllowlist(token);
        const next = { ...ALLOWLIST_DEFAULT, ...(allow || {}) };
        const cur = Array.isArray(next.sandbox_exec?.cmds) ? next.sandbox_exec.cmds : [];
        if (!cur.includes(cmd)) {
          next.sandbox_exec = { cmds: [...cur, cmd].slice(0, 200) };
          await writeAllowlist(token, next);
        }
      }
      return ok;
    }
  } catch {}
  return false;
}

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

  // Token helper is defined early to avoid TDZ issues when referenced by hooks below
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

  // Auto-init workspace if empty and flag enabled (one-time per browser)
  useEffect(() => {
    if (!AUTOINIT_ENABLED) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(AUTOINIT_FLAG) === '1') return;
    let cancelled = false;
    (async () => {
      try {
        const token = sessionToken || (await refreshSessionToken());
        if (!token) return;
        const resList = await fetch('/api/rank/handle-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'list_files', payload: { path: '/' } }),
        });
        const dataList = await resList.json().catch(() => ({}));
        const items = dataList?.result?.items || dataList?.items || [];
        if (!Array.isArray(items) || items.length > 0) return;
        // fetch starter pack
        const packRes = await fetch('/api/workspace/starter-pack');
        if (!packRes.ok) return;
        const pack = await packRes.json().catch(() => ({}));
        const files = Array.isArray(pack?.files) ? pack.files : [];
        for (const f of files) {
          if (cancelled) return;
          await fetch('/api/rank/handle-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'write_file', payload: { path: f.path, content: f.content || '' } }),
          });
        }
        if (!cancelled) window.localStorage.setItem(AUTOINIT_FLAG, '1');
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [AUTOINIT_ENABLED, sessionToken, refreshSessionToken]);

  

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
    markExpired: markKeyExpired,
  } = useKeyringController({ sessionUser, getSessionToken });

  const [menuOpen, setMenuOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [keyringOpen, setKeyringOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(true);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [chatError, setChatError] = useState('');
  const [sending, setSending] = useState(false);
  const [autoStatus, setAutoStatus] = useState({ running: false, executed: 0, remaining: 0 });
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [stickBottom, setStickBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

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

  // Kill stray bottom-left UA/overlay resize handle if present
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.setAttribute('data-ai-dock-anti-resize', '1');
    style.textContent = [
      'div[title="드래그로 크기 조절"],',
      'div[title="Resize by dragging"],',
      'div[aria-label="Drag to resize"] { display: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
    return () => { try { style.remove(); } catch {} };
  }, []);

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
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 36;
    if (nearBottom || stickBottom) {
      el.scrollTop = el.scrollHeight;
      setNewMsgCount(0);
    } else {
      setNewMsgCount((c) => c + 1);
    }
  }, [logs, stickBottom]);

  const handleLogScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    setStickBottom(nearBottom);
    if (nearBottom) setNewMsgCount(0);
  }, []);

  const scrollLogToBottom = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setStickBottom(true);
    setNewMsgCount(0);
  }, []);

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
      todo: readTodoList(),
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

      // Prepare memory header (short: local, long: remote preferred)
      const tokenForMem = REMOTE_MEMORY_ENABLED
        ? await getSessionToken({ optional: true }).catch(() => null)
        : null;
      const longMemItems = REMOTE_MEMORY_ENABLED
        ? await readLongMemoryRemote(tokenForMem).catch(() => readMemory('long'))
        : readMemory('long');
      const shortMemItems = readMemory('short');
      // Build memory header with TODO first
      const todoListRaw = readTodoList();
      const todoPrefs = readTodoPrefs();
      const todoList = todoPrefs.hideCompleted ? todoListRaw.filter((t) => !t.done) : todoListRaw;
      const sections = [];
      if (todoList.length) {
        sections.push('TODO:\n' + todoList.map((t, i) => `- ${t.done ? '[x]' : '[ ]'} ${t.text}`).join('\n'));
      }
      const shortSummary = summarizeMemory(shortMemItems);
      const longSummary = summarizeMemory(longMemItems);
      if (shortSummary) sections.push(`단기기억:\n${shortSummary}`);
      if (longSummary) sections.push(`장기기억:\n${longSummary}`);
      const memoryHeader = sections.join('\n\n');

      const payload = buildModelPayload({
        logs: workingLogs,
        requestText: trimmed,
        attachmentBundle,
        options: {
          ...chatOptions,
          remainingBudget: actionBudget,
        },
        memoryHeader,
      });

      const token = tokenForMem || (await getSessionToken({ optional: false }));
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
        // Auto-disable active API key on quota/overload/unauthorized
        if (res.status === 401 || res.status === 403 || res.status === 429) {
          try {
            const active = (keyringEntries || []).find((e) => e.isActive);
            if (active && typeof deactivate === 'function') {
              await deactivate(active);
              if (typeof markKeyExpired === 'function') markKeyExpired(active.id);
              append('system', '활성 API 키가 과부하/만료로 비활성화되었습니다. 다른 키를 선택하세요.');
            }
          } catch {}
        }
        throw Object.assign(new Error(data?.error || 'AI 응답을 받지 못했습니다.'), {
          status: res.status,
          detail: data,
        });
      }

      const rawText = extractGeminiText(data.data) || '';
      const structured = parseStructuredResponse(rawText);
      const parseMode = structured?._parseMode || 'none';
      const assistantText = structured?.message || rawText || '(empty response)';
      const assistantEntry = { role: 'assistant', msg: assistantText };
      workingLogs.push(assistantEntry);
      append('assistant', assistantText);

      // 파싱 결과가 스키마와 완전히 맞지 않는 경우에는
      // 작업을 자동 실행하지 않고 경고만 남깁니다.
      if (parseMode === 'salvaged') {
        const salvagedCount = Array.isArray(structured?.actions) ? structured.actions.length : 0;
        const warning =
          salvagedCount > 0
            ? 'AI 응답에서 JSON 블록을 일부 복구했지만, 지정된 스키마와 완전히 일치하지 않아 자동 실행하지 않았습니다. ' +
              '응답에 포함된 작업 내용을 검토한 뒤 필요하면 직접 실행해 주세요.'
            : 'AI 응답이 JSON 형식에 가깝지만 지정된 스키마와 맞지 않아 작업을 실행하지 않았습니다. ' +
              '필요하면 올바른 JSON 한 개만 다시 보내 주세요.';
        workingLogs.push({ role: 'system', msg: warning });
        append('system', warning);
        return;
      }

      if (!Array.isArray(structured?.actions) || !structured.actions.length) {
        if (parseMode === 'none') {
          const warning =
            'AI 응답이 지정된 JSON 스키마에 맞지 않아 작업(action)을 실행하지 않았습니다. ' +
            '필요하면 응답 내용을 확인한 뒤, 올바른 JSON 한 개만 다시 보내 주세요.';
          workingLogs.push({ role: 'system', msg: warning });
          append('system', warning);
        }
        return;
      }

      const normalizedActions = Array.isArray(structured?.actions) ? structured.actions : [];
      const canAutoRun = allowActions && chatOptions.trustEnabled && actionBudget > 0;
      if (!normalizedActions.length) {
        return;
      }
      if (!canAutoRun) {
        const warning =
          `AI가 ${normalizedActions.length}개의 작업을 요청했지만 자동 실행이 꺼져 있습니다. ` +
          '상단 … 메뉴에서 "자동 실행 횟수"를 2 이상으로 올린 뒤 다시 시도해 주세요.';
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

  const statusBadges = useMemo(() => {
    const badges = [];
    badges.push({
      label: hasActiveKey ? '키 연결' : '키 필요',
      tone: hasActiveKey ? 'ok' : 'warn',
      title: hasActiveKey ? 'API 키가 활성화되었습니다.' : '먼저 API 키를 등록하세요.',
    });
    badges.push({
      label: chatOptions.trustLimit > 1 ? `자동 ${chatOptions.trustLimit}회` : '자동 꺼짐',
      tone: chatOptions.trustLimit > 1 ? 'ok' : 'neutral',
      title:
        chatOptions.trustLimit > 1
          ? `자동 실행을 최대 ${chatOptions.trustLimit}회 허용합니다.`
          : '자동 실행이 비활성화되어 있습니다.',
    });
    const sandboxTone =
      chatOptions.sandboxPolicy === 'allow'
        ? 'ok'
        : chatOptions.sandboxPolicy === 'prompt'
        ? 'neutral'
        : 'warn';
    const sandboxLabel =
      chatOptions.sandboxPolicy === 'allow'
        ? '샌드 허용'
        : chatOptions.sandboxPolicy === 'prompt'
        ? '샌드 확인'
        : '샌드 차단';
    badges.push({
      label: sandboxLabel,
      tone: sandboxTone,
      title: '샌드박스 실행 정책',
    });
    const testerTone =
      chatOptions.testerPolicy === 'allow'
        ? 'ok'
        : chatOptions.testerPolicy === 'prompt'
        ? 'neutral'
        : 'warn';
    const testerLabel =
      chatOptions.testerPolicy === 'allow'
        ? '테스트 허용'
        : chatOptions.testerPolicy === 'prompt'
        ? '테스트 확인'
        : '테스트 차단';
    badges.push({
      label: testerLabel,
      tone: testerTone,
      title: '간이 테스트 실행 정책',
    });
    return badges;
  }, [
    chatOptions.sandboxPolicy,
    chatOptions.testerPolicy,
    chatOptions.trustLimit,
    hasActiveKey,
  ]);

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
            <div style={styles.todoBar} data-stop-drag="true">
              <button type="button" style={styles.todoToggle} onClick={() => setTodoOpen((v) => !v)} aria-label="TODO 토글">
                {todoOpen ? '▼' : '▶'} TODO
              </button>
              <span style={styles.todoProgress}>
                {(() => { const list = readTodoList(); const done = list.filter(i=>i.done).length; return `${done}/${list.length}`; })()}
              </span>
              {REMOTE_MEMORY_ENABLED && (
                <span style={styles.todoActions}>
                  <button
                    type="button"
                    style={styles.smallButton(false)}
                    onClick={async () => {
                      try { const token = await getSessionToken({ optional: true }); await writeLongTodoRemote(readTodoList(), token); append('system','TODO를 장기 메모리에 저장했습니다.'); } catch {}
                    }}
                  >원격 저장</button>
                  <button
                    type="button"
                    style={styles.smallButton(false)}
                    onClick={async () => {
                      try { const token = await getSessionToken({ optional: true }); const remote = await readLongTodoRemote(token); if (remote.length) { writeTodoList(remote); append('system','장기 메모리의 TODO를 불러왔습니다.'); } } catch {}
                    }}
                  >불러오기</button>
                </span>
              )}
            </div>
            {todoOpen && (
              <div style={styles.todoList} data-stop-drag="true">
                {(() => { const list = readTodoList(); return list.length === 0 ? <div style={styles.todoEmpty}>등록된 TODO가 없습니다.</div> : null; })()}
                {(() => { const prefs = readTodoPrefs(); const list = readTodoList(); const render = prefs.hideCompleted ? list.filter(i=>!i.done) : list; return render; })().map((item, idx) => (
                  <label key={idx} style={styles.todoItem}>
                    <input
                      type="checkbox"
                      checked={!!item.done}
                      onChange={() => { toggleTodo(idx); setTodoOpen(true); }}
                    />
                    <span style={{ ...(styles.todoText), ...(item.done ? styles.todoDone : null) }}>{item.text}</span>
                  </label>
                ))}
              </div>
            )}
            {keyringMessage && <div style={styles.infoBanner}>{keyringMessage}</div>}
            {chatError && <div style={styles.errorBanner}>{chatError}</div>}

            <div ref={logRef} style={styles.logPanel} onScroll={handleLogScroll}>
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
            {newMsgCount > 0 && !stickBottom && (
              <button type="button" style={styles.newMessagePill} data-stop-drag="true" onClick={scrollLogToBottom}>
                새 메시지 {newMsgCount}
              </button>
            )}
          </section>
        </div>
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

        {prefs.mode !== 'fullscreen' && (
          <div
            role="separator"
            aria-label="창 크기 조절"
            title="크기 조절"
            style={styles.resizeHandle}
            onPointerDown={(e) => beginPointerInteraction(e, 'resize')}
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
  
  const markExpired = useCallback(
    (entryId) => {
      setEntries((prev) => {
        const next = prev.map((item) =>
          item.id === entryId ? { ...item, expired: true, isActive: false } : item
        );
        applySnapshot(sessionUser?.id || '', next);
        return next;
      });
    },
    [applySnapshot, sessionUser?.id]
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
    markExpired,
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
  const [showExpiredOnly, setShowExpiredOnly] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const expiredEntries = Array.isArray(entries) ? entries.filter((e) => e.expired) : [];
  const renderList = showExpiredOnly ? expiredEntries : (entries || []);

  const handleBulkDeleteExpired = async () => {
    if (!expiredEntries.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const entry of expiredEntries) {
        await onRemove(entry);
      }
      await onRefresh();
    } catch (e) {
      // ignore
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div style={styles.modalBackdrop}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>API 키 관리</h3>
            <p style={styles.modalSubtitle}>
              저장된 키는 Supabase에 암호화되어 보관됩니다. {entries.length}/{limit}개
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#b6c2d9' }}>
              <input
                type="checkbox"
                checked={showExpiredOnly}
                onChange={(e) => setShowExpiredOnly(e.target.checked)}
              />
              만료만 보기
            </label>
            <button
              type="button"
              style={styles.smallDangerButton(bulkBusy || !expiredEntries.length)}
              onClick={handleBulkDeleteExpired}
              disabled={bulkBusy || !expiredEntries.length}
              title={expiredEntries.length ? `만료된 키 ${expiredEntries.length}개 삭제` : '만료된 키가 없습니다.'}
            >
              만료 일괄 삭제
            </button>
            <button type="button" style={styles.secondaryButton} onClick={onRefresh}>
              새로고침
            </button>
            <button type="button" style={styles.secondaryButton} onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        {message && <div style={styles.infoBox}>{message}</div>}
        {loading && <div style={styles.infoBox}>키 정보를 불러오는 중입니다…</div>}
        {error && <div style={styles.errorBox}>{error.message || '키 정보를 읽어 오는 중 오류가 발생했습니다.'}</div>}
        <div style={styles.modalSection}>
          <div style={styles.keyRow}>
            <input
              type="text"
              value={pendingKey}
              onChange={(event) => setPendingKey(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingKey.trim() && !submitting) onRegister();
              }}
              placeholder="예: AIza... 형식의 Google Gemini 키"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              style={styles.keyInputLine}
            />
            <button
              type="button"
              style={styles.primaryButton(!pendingKey.trim() || submitting)}
              onClick={onRegister}
              disabled={!pendingKey.trim() || submitting}
            >
              {submitting ? '저장 중...' : '저장 후 활성화'}
            </button>
          </div>
        </div>
        <div style={styles.keyList}>
          {renderList.length === 0 && <div style={styles.emptyBox}>저장된 키가 없습니다.</div>}
          {renderList.map((entry) => (
            <div key={entry.id} style={styles.keyItem}>
              <div style={styles.keyLeft}>
                <div style={styles.keyProviderRow}>
                  <span style={styles.keyProviderChip}>{formatKeyProviderLabel(entry.provider)}</span>
                  {entry.isActive && <span style={styles.keyDot} title="사용 중" aria-label="사용 중" />}
                  {entry.expired && (
                    <span style={styles.keyExpiredBadge} title="만료됨" aria-label="만료됨">만료됨</span>
                  )}
                </div>
                <div style={styles.keyModel}>{entry.modelLabel || entry.geminiModel || '사용자 지정 모델'}</div>
                <div style={styles.keySampleText}>{entry.keySample || '••••••'}</div>
              </div>
              <div style={styles.keyRight}>
                <button
                  type="button"
                  style={styles.keyPrimary(entry.isActive)}
                  onClick={() => (entry.isActive ? onDeactivate(entry) : onActivate(entry))}
                  disabled={submitting}
                >
                  {entry.isActive ? '해제' : '사용'}
                </button>
                <button
                  type="button"
                  style={styles.keyDangerIcon(submitting)}
                  onClick={() => onRemove(entry)}
                  disabled={submitting}
                  aria-label="삭제"
                  title="삭제"
                >
                  🗑
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
    <div style={styles.menu} data-ai-chat-menu="true" data-stop-drag="true">
      <div style={styles.menuSection}>
        <div style={styles.sliderHeader}>
          <span>자동 실행 횟수</span>
          <strong>{trustLimit}회</strong>
        </div>
        <input
          type="range"
          min="1"
          max="25"
          value={trustLimit}
          onChange={(event) => onTrustLimitChange(Number(event.target.value))}
          style={styles.sliderTrack}
        />
        <small style={styles.sliderHint}>오른쪽으로 밀면 AI가 연속으로 실행할 수 있는 횟수가 늘어나요.</small>
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
          실행 버튼 옆 ▼ 메뉴에서 샌드박스·테스트 권한을 허용/거부할 수 있습니다.
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
    <div style={styles.runMenu} data-run-menu="true" data-stop-drag="true">
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {logs.map((entry, index) => (
        <LogRow key={entry.t || index} entry={entry} />
      ))}
    </div>
  );
}

function LogRow({ entry }) {
  const { role, msg } = entry;

  // Compact, line-style rendering for internal action/system logs
  if (role === 'action') {
    const summary = (() => {
      if (msg?.action) {
        const t = msg.action.type || msg.action.name || 'unknown';
        const p = msg.action.payload?.path || msg.action.path || '';
        const r = msg.result?.ok ? 'ok' : `error: ${msg.result?.error || 'failed'}`;
        return `• ${t}${p ? ` (${p})` : ''} • ${r}`;
      }
      if (typeof msg === 'string') return `• ${msg}`;
      return `• ${JSON.stringify(msg)}`;
    })();
    return (
      <div style={{ ...styles.logBubble, padding: '4px 6px', background: 'transparent', border: 'none', color: '#a5f3fc', fontSize: 12 }}>
        {summary}
      </div>
    );
  }

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
      const t = msg.action.type || msg.action.name || 'unknown';
      const p = msg.action.path ? ` (${msg.action.path})` : '';
      const r = msg.result?.ok ? 'ok' : `error: ${msg.result?.error || 'failed'}`;
      return `action ${t}${p} • ${r}`;
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

  // Batch fast-path: reduce network roundtrips
  if (normalized.length > 1) {
    const items = normalized.map((a) => ({
      action: a.type,
      payload: a.payload || (a.path ? { path: a.path } : {}),
      session_id: a.sessionId || null,
      game_id: a.gameId || null,
      idempotencyKey: a.idempotencyKey || null,
    }));
    const batchRes = await executeWorkspaceAction({ type: 'batch', payload: { actions: items, sequential: true } }, token);
    if (batchRes?.ok) {
      const results = Array.isArray(batchRes.result?.results) ? batchRes.result.results : [];
      results.forEach((r, i) => {
        const act = normalized[i];
        const rec = (r && typeof r === 'object' && 'result' in r) ? r.result : r;
        executed.push({ action: act, result: rec });
        append('action', { action: act, result: rec });
        workingLogs.push({ role: 'action', msg: { action: act, result: rec } });
      });
      remaining = Math.max(0, remaining - results.length);
      setAutoStatus({ running: false, executed: executed.length, remaining });
      const summary = buildActionSummary(executed, remaining);
      return {
        nextPrompt: summary.promptForModel,
        visibleLog: summary.visibleLog,
        remainingBudget: remaining,
        executed,
      };
    }
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

function buildActionSummary(executed, remainingBudget) {
  const items = executed.map((entry) => {
    const a = entry?.action || {};
    const r = entry?.result || {};
    const ok = r.ok !== false;
    const kind = a.type || a.name || 'action';
    const path = a.path ? ` (${a.path})` : '';
    const res = ok ? 'ok' : `error: ${r.error || 'unknown'}`;
    return `• ${kind}${path} — ${res}`;
  });
  const visibleLog = items.filter(Boolean).join('\n');
  const promptForModel = [
    '위 작업 결과를 반영해 다음 응답을 간결히 준비하세요.',
    `남은 자동 실행 예산: ${remainingBudget}`,
  ]
    .filter(Boolean)
    .join('\n');

  const parts = [{ text: `${visibleLog}\n\n${promptForModel}` }];
  return { visibleLog, promptForModel, parts };
}

function normalizeActions(actions) {
  return actions
    .map((action, index) => {
      if (!action || typeof action !== 'object') return null;
      const type =
        action.action || action.name || action.type || action.kind || `action_${index + 1}`;
      const out = {
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
      if (!ALLOWED_ACTIONS.has(String(type))) return null;
      return out;
    })
    .filter(Boolean);
}

async function executeWorkspaceAction(action, token) {
  if (!action.type) {
    return { ok: false, error: 'missing_action_name' };
  }
  try {
    const alias = {
      runCommand: 'sandbox_exec',
      readFile: 'read_file',
      writeFile: 'write_file',
      editFile: 'edit_patch',
      readDir: 'list_files',
      listFiles: 'list_files',
      deleteFile: 'delete_file',
      removeFile: 'delete_file',
      renameFile: 'move_file',
      moveFile: 'move_file',
      makeDir: 'mkdirs',
      mkdir: 'mkdirs',
      searchFiles: 'search_text',
      grep: 'search_text',
      readRange: 'read_file_range',
      testRun: 'test_run',
      lintRun: 'lint_run',
      buildRun: 'build_run',
      statFile: 'stat_file',
      deleteDir: 'delete_dir',
      removeDir: 'delete_dir',
      copyFile: 'copy_file',
      memoryPut: 'memory_put',
      memoryDelete: 'memory_delete',
      memoryPromote: 'memory_promote',
      memoryList: 'memory_list',
      todoAdd: 'memory_todo_add',
      todoReplace: 'memory_todo_replace',
      todoRemove: 'memory_todo_remove',
      todoClear: 'memory_todo_clear',
      todoList: 'memory_todo_list',
      todoPrefsSet: 'memory_todo_prefs_set',
      todoPrefsGet: 'memory_todo_prefs_get',
    };
    const actionType = alias[action.type] || action.type;
    // Debounce read-only actions during resize/drag to avoid bursts
    if (typeof window !== 'undefined') {
      const READ_ONLY = new Set(['list_files','read_file','read_file_range','search_text','stat_file']);
      if (READ_ONLY.has(actionType) && window.__aiDockIsResizing) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Handle memory actions locally (no server call)
    if (actionType === 'memory_put') {
      const scope = (action.payload?.scope || 'short').toLowerCase();
      const key = String(action.payload?.key || '').trim();
      const content = String(action.payload?.content || '').trim();
      if (!key || !content) return { ok: false, error: 'invalid_args' };
      if (scope === 'long') {
        const ok = await writeLongMemoryRemote({ key, content }, token).catch(() => false);
        if (!ok) saveMemoryEntry('long', { key, content });
      } else {
        saveMemoryEntry(scope, { key, content });
      }
      return { ok: true };
    }
    if (actionType === 'memory_delete') {
      const scope = (action.payload?.scope || 'short').toLowerCase();
      const key = String(action.payload?.key || '').trim();
      if (!key) return { ok: false, error: 'invalid_args' };
      if (scope === 'long') {
        const ok = await deleteLongMemoryRemote(key, token).catch(() => false);
        if (!ok) deleteMemoryEntry('long', key);
      } else {
        deleteMemoryEntry(scope, key);
      }
      return { ok: true };
    }
    if (actionType === 'memory_promote') {
      const key = String(action.payload?.key || '').trim();
      if (!key) return { ok: false, error: 'invalid_args' };
      // promote: short -> remote long (fallback local)
      const short = readMemory('short');
      const item = short.find((e) => e.key === key);
      if (!item) return { ok: false, error: 'not_found' };
      const ok = await writeLongMemoryRemote({ key, content: item.content }, token).catch(() => false);
      if (!ok) promoteMemoryEntry(key); else deleteMemoryEntry('short', key);
      return { ok: true };
    }
    if (actionType === 'memory_list') {
      const scope = (action.payload?.scope || 'short').toLowerCase();
      const items = scope === 'long'
        ? await readLongMemoryRemote(token).catch(() => readMemory('long'))
        : readMemory('short');
      return { ok: true, data: { items } };
    }
    if (actionType === 'memory_todo_add') {
      const text = String(action.payload?.text || '').trim();
      if (!text) return { ok: false, error: 'invalid_args' };
      addTodo(text);
      return { ok: true };
    }
    if (actionType === 'memory_todo_replace') {
      const items = Array.isArray(action.payload?.items) ? action.payload.items : [];
      writeTodoList(items);
      return { ok: true };
    }
    if (actionType === 'memory_todo_remove') {
      const index = Number.isInteger(action.payload?.index) ? action.payload.index : null;
      const text = action.payload?.text ? String(action.payload.text) : null;
      if (index == null && !text) return { ok: false, error: 'invalid_args' };
      removeTodo({ index, text });
      return { ok: true };
    }
    if (actionType === 'memory_todo_clear') {
      writeTodoList([]);
      return { ok: true };
    }
    if (actionType === 'memory_todo_list') {
      const items = readTodoList();
      return { ok: true, data: { items } };
    }
    if (actionType === 'memory_todo_prefs_set') {
      const hideCompleted = !!action.payload?.hideCompleted;
      writeTodoPrefs({ hideCompleted });
      return { ok: true };
    }
    if (actionType === 'memory_todo_prefs_get') {
      const prefs = readTodoPrefs();
      return { ok: true, data: { prefs } };
    }
    // Pre-check sandbox allowlist for sandbox_exec/test/lint/build
    if (['sandbox_exec','test_run','lint_run','build_run'].includes(actionType)) {
      const cmdPreview = actionType === 'sandbox_exec' ? (action.payload?.cmd || '') : actionType;
      const allowed = await checkSandboxAllowed(token, String(cmdPreview));
      if (!allowed) return { ok: false, error: 'sandbox_blocked' };
    }

    const res = await fetch('/api/rank/handle-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: actionType,
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
    // Record allow for sandbox_exec when policy is 'allow'
    if (actionType === 'sandbox_exec') {
      await recordSandboxAllowIfEnabled(token, action.payload?.cmd || '');
    }
    return { ok: true, result: data.result || null };
  } catch (err) {
    return { ok: false, error: err?.message || 'action_request_failed' };
  }
}

// NOTE: Renamed to avoid duplicate definition; keep primary buildActionSummary above.
function buildActionSummary_alt(executed, remainingBudget) {
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

function buildModelPayload({ logs, requestText, attachmentBundle, options, memoryHeader }) {
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
    memoryHeader || null,
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

  const tryParse = (candidate, mode) => {
    if (!candidate) return null;
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const result = {
        _parseMode: mode,
      };
      if (typeof parsed.message === 'string') {
        result.message = parsed.message;
      }
      if (Array.isArray(parsed.actions)) {
        result.actions = parsed.actions;
      }
      if (typeof parsed.followup === 'string') {
        result.followup = parsed.followup;
      }
      if (!result.message) {
        result.message = trimmed;
      }
      return result;
    } catch {
      return null;
    }
  };

  // 1) 전체 문자열이 순수 JSON인 경우 먼저 시도
  const strict = tryParse(trimmed, 'strict');
  if (strict) return strict;

  // 2) ```json ... ``` 코드 블록 안에서 JSON 추출
  const blockMatch = trimmed.match(/```(?:json)?([\s\S]+?)```/i);
  if (blockMatch) {
    const inner = blockMatch[1]?.trim();
    const fromBlock = tryParse(inner, 'code-block');
    if (fromBlock) return fromBlock;
  }

  // 3) 텍스트 안에서 { ... } 블록 하나를 찾아 복구 시도
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const salvaged = tryParse(candidate, 'salvaged');
    if (salvaged) return salvaged;
  }

  // 4) 어떤 형태로든 JSON을 뽑아내지 못한 경우: 순수 메시지로 취급
  return {
    message: trimmed,
    _parseMode: 'none',
  };
}

// --- Memory helpers ---
const MEMORY_KEYS = {
  short: 'workspace:aiChat:mem.short',
  long: 'workspace:aiChat:mem.long',
};
const TODO_KEY = 'TODO';
const TODO_PREFS_KEY = 'TODO_PREFS';

function readMemory(scope) {
  if (typeof window === 'undefined') return [];
  const key = MEMORY_KEYS[scope] || MEMORY_KEYS.short;
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr
          .map((e) => ({
            key: String(e?.key || ''),
            content: String(e?.content || ''),
            usedCount: Number(e?.usedCount || 0),
            updatedAt: Number(e?.updatedAt || 0),
          }))
          .filter((e) => e.key && e.content)
      : [];
  } catch {
    return [];
  }
}

function writeMemory(scope, list) {
  if (typeof window === 'undefined') return;
  const key = MEMORY_KEYS[scope] || MEMORY_KEYS.short;
  try {
    window.localStorage.setItem(key, JSON.stringify(list || []));
  } catch {}
}

function saveMemoryEntry(scope, { key, content }) {
  const list = readMemory(scope);
  const idx = list.findIndex((e) => e.key === key);
  const now = Date.now();
  if (idx >= 0) {
    list[idx] = { ...list[idx], content, updatedAt: now };
  } else {
    list.unshift({ key, content, usedCount: 0, updatedAt: now });
  }
  writeMemory(scope, list.slice(0, 100)); // soft cap
}

function deleteMemoryEntry(scope, key) {
  const list = readMemory(scope).filter((e) => e.key !== key);
  writeMemory(scope, list);
}

function promoteMemoryEntry(key) {
  const short = readMemory('short');
  const item = short.find((e) => e.key === key);
  if (!item) return;
  writeMemory('short', short.filter((e) => e.key !== key));
  const long = readMemory('long');
  long.unshift({ ...item, updatedAt: Date.now(), usedCount: 0 });
  writeMemory('long', long.slice(0, 200));
}

function summarizeMemory(list, maxChars = 800) {
  if (!Array.isArray(list) || !list.length) return '';
  const lines = [];
  let used = 0;
  for (const e of list) {
    const text = `${e.key}: ${String(e.content).replace(/\s+/g, ' ').slice(0, 160)}`;
    if (used + text.length > maxChars) break;
    lines.push(`- ${text}`);
    used += text.length;
  }
  return lines.join('\n');
}

// --- TODO helpers (short memory) ---
function readTodoList() {
  try {
    const list = readMemory('short');
    const item = list.find((e) => e.key === TODO_KEY);
    if (!item || !item.content) return [];
    try {
      const arr = JSON.parse(String(item.content));
      if (Array.isArray(arr)) {
        return arr.map((v) => {
          if (typeof v === 'string') return { text: v, done: false };
          const text = String(v?.text || '');
          const done = !!v?.done;
          return text ? { text, done } : null;
        }).filter(Boolean);
      }
      return [];
    } catch {
      return String(item.content)
        .split(/\r?\n/)
        .filter(Boolean)
        .map((t) => ({ text: t, done: false }));
    }
  } catch { return []; }
}

function writeTodoList(items) {
  const list = Array.isArray(items)
    ? items
        .map((v) => ({ text: String(v?.text || v || ''), done: !!(v?.done) }))
        .filter((v) => v.text)
    : [];
  saveMemoryEntry('short', { key: TODO_KEY, content: JSON.stringify(list) });
}

function addTodo(text) {
  const cur = readTodoList();
  const t = String(text || '').trim();
  if (!t) return;
  const next = [...cur, { text: t, done: false }];
  writeTodoList(next);
}

function removeTodo({ index = null, text = null } = {}) {
  const cur = readTodoList();
  let next = cur;
  if (index != null && Number.isInteger(index)) {
    next = cur.filter((_, i) => i !== index);
  } else if (text) {
    next = cur.filter((t) => t.text !== text);
  }
  writeTodoList(next);
}

function toggleTodo(index) {
  const cur = readTodoList();
  if (index < 0 || index >= cur.length) return;
  const next = cur.slice();
  next[index] = { ...next[index], done: !next[index].done };
  writeTodoList(next);
}

async function readLongTodoRemote(token) {
  try {
    const items = await readLongMemoryRemote(token);
    const row = (items || []).find((e) => e.key === TODO_KEY);
    if (!row) return [];
    const parsed = JSON.parse(String(row.content || '[]'));
    return Array.isArray(parsed)
      ? parsed.map((v) => ({ text: String(v?.text || v || ''), done: !!(v?.done) })).filter((v) => v.text)
      : [];
  } catch { return []; }
}

async function writeLongTodoRemote(list, token) {
  try {
    const content = JSON.stringify(list || []);
    const ok = await writeLongMemoryRemote({ key: TODO_KEY, content }, token);
    return !!ok;
  } catch { return false; }
}

function readTodoPrefs() {
  try {
    const list = readMemory('short');
    const item = list.find((e) => e.key === TODO_PREFS_KEY);
    if (!item || !item.content) return { hideCompleted: false };
    const obj = JSON.parse(String(item.content));
    return {
      hideCompleted: !!obj?.hideCompleted,
    };
  } catch {
    return { hideCompleted: false };
  }
}

function writeTodoPrefs(prefs) {
  const merged = { hideCompleted: !!prefs?.hideCompleted };
  saveMemoryEntry('short', { key: TODO_PREFS_KEY, content: JSON.stringify(merged) });
}

// Remote long-memory helpers (best-effort)
async function readLongMemoryRemote(token) {
  if (!REMOTE_MEMORY_ENABLED) throw new Error('remote_disabled');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch('/api/ai/memory/long', { method: 'GET', headers });
  if (!res.ok) throw new Error('remote_memory_failed');
  const json = await res.json().catch(() => ({}));
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((e) => ({ key: String(e.key||''), content: String(e.content||''), usedCount: Number(e.usedCount||0), updatedAt: Number(e.updatedAt||0) })).filter((e)=>e.key&&e.content);
}

async function writeLongMemoryRemote(entry, token) {
  if (!REMOTE_MEMORY_ENABLED) return false;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch('/api/ai/memory/long', { method: 'POST', headers, body: JSON.stringify(entry) });
  return res.ok;
}

async function deleteLongMemoryRemote(key, token) {
  if (!REMOTE_MEMORY_ENABLED) return false;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const url = `/api/ai/memory/long?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  return res.ok;
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
styles = {
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
    alignItems: 'stretch',
    padding: 16,
    overflowY: 'auto',
    zIndex: 2000,
  },
  panelWindow: {
    pointerEvents: 'auto',
    width: '420px',
    height: '600px',
    background: 'rgba(5, 11, 22, 0.60)',
    border: '1px solid rgba(19, 28, 47, 0.5)',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
    position: 'relative',
    isolation: 'isolate',
    touchAction: 'none',
    overflow: 'hidden',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  resizeHandle: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 16,
    height: 16,
    borderRadius: 4,
    border: '1px solid #273449',
    background: '#050d1c',
    boxShadow: 'inset 0 0 0 2px rgba(148,163,184,0.1)',
    cursor: 'nwse-resize',
    zIndex: 2050,
  },
  panelFullscreen: {
    pointerEvents: 'auto',
    width: 'min(960px, 100vw - 32px)',
    maxHeight: 'calc(100svh - 32px)',
    background: '#040b18',
    border: '1px solid #1e293b',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
    position: 'relative',
    margin: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #1a2536',
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
    gap: 4,
  },
  toolbarButton: {
    minWidth: 34,
    height: 30,
    borderRadius: 8,
    border: '1px solid #2b3448',
    background: '#0b1222',
    color: '#e2e8f0',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
    fontWeight: 600,
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
    gap: 10,
    padding: '10px 14px',
    flex: 1,
    minHeight: 0,
    overflowX: 'hidden',
    position: 'relative',
  },
  chatColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 0,
    overflowX: 'hidden',
  },
  statusRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
  },
  badgeOk: {
    border: '1px solid #8b5cf6',
    color: '#d8b4fe',
  },
  badgeWarn: {
    border: '1px solid #f97316',
    color: '#ffd8b4',
  },
  badgeNeutral: {
    border: '1px solid #2d3a4e',
    color: '#cfd6ea',
  },
  logPanel: {
    flex: 1,
    border: '1px solid #273449',
    borderRadius: 14,
    padding: 12,
    background: 'rgba(2, 6, 23, 0.55)',
    overflowY: 'auto',
    color: '#e2e8f0',
  },
  todoBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  todoToggle: {
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#e2e8f0',
    borderRadius: 8,
    padding: '2px 6px',
    cursor: 'pointer',
  },
  todoProgress: {
    fontSize: 12,
    color: '#b6c2d9',
  },
  todoActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: 6,
  },
  todoList: {
    border: '1px solid #273449',
    borderRadius: 10,
    padding: 8,
    background: 'rgba(3, 10, 23, 0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  todoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#e2e8f0',
  },
  todoText: {
    flex: 1,
  },
  todoDone: {
    textDecoration: 'line-through',
    color: '#94a3b8',
  },
  todoEmpty: {
    fontSize: 12,
    color: '#9fb3df',
  },
  newMessagePill: {
    position: 'absolute',
    right: 20,
    bottom: 78,
    borderRadius: 999,
    border: '1px solid #2563eb',
    background: '#0b1222',
    color: '#93c5fd',
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0,0,0,0.35)'
  },
  logBubble: {
    padding: 8,
    borderRadius: 14,
    border: '1px solid rgba(148,163,184,0.25)',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
    lineHeight: 1.4,
    maxWidth: '82%',
    alignSelf: 'flex-start',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  logUser: {
    background: 'linear-gradient(135deg, rgba(168,85,247,0.45), rgba(99,102,241,0.4))',
    borderColor: '#a78bfa',
    alignSelf: 'flex-end',
    color: '#f5f3ff',
    textAlign: 'right',
  },
  logAssistant: {
    background: 'rgba(37,99,235,0.16)',
    borderColor: '#60a5fa',
    alignSelf: 'flex-start',
    color: '#eaf2ff',
  },
  logSystem: { background: 'rgba(2,6,23,0.5)', borderColor: 'rgba(148,163,184,0.35)', color: '#cbd5e1' },
  logError: { background: 'rgba(127,29,29,0.3)', borderColor: 'rgba(248,113,113,0.5)', color: '#fee2e2' },
  logAction: { background: 'rgba(13,148,136,0.22)', borderColor: 'rgba(45,212,191,0.45)', color: '#ccfbf1' },
  logAttachmentList: {
    marginTop: 8,
    fontSize: 11,
    color: '#dbeafe',
  },
  attachmentsBar: {
    border: '1px solid rgba(39, 52, 73, 0.8)',
    borderRadius: 12,
    padding: 8,
    background: 'rgba(5, 13, 28, 0.45)',
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
    minHeight: 0,
    height: 38,
    resize: 'none',
    borderRadius: 10,
    border: '1px solid #2c3448',
    background: '#020617',
    color: '#e2e8f0',
    padding: '8px 12px',
    fontSize: 13,
    lineHeight: 1.2,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  composerBar: {
    border: '1px solid rgba(39, 52, 73, 0.8)',
    borderRadius: 14,
    padding: '4px 6px',
    background: 'rgba(3, 10, 23, 0.55)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  attachCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    border: '1px solid #2c3448',
    background: '#050d1c',
    color: '#e2e8f0',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
  },
  sendGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sendButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  sendButton: (disabled) => ({
    borderRadius: 12,
    border: '1px solid #8b5cf6',
    background: disabled ? '#0f172a' : '#7c3aed',
    color: '#e0f2fe',
    width: 34,
    height: 34,
    fontSize: 16,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }),
  sendMenuButton: {
    width: 30,
    height: 34,
    borderRadius: 10,
    border: '1px solid #273449',
    background: '#0b1222',
    color: '#dbeafe',
    fontSize: 13,
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
    width: 'min(460px, 94vw)',
    maxHeight: '86vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    borderRadius: 16,
    border: '1px solid #273449',
    background: '#030712',
    padding: '18px 20px',
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
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: 10,
    boxSizing: 'border-box',
  },
  keyRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  keyInputLine: {
    width: '100%',
    height: 38,
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#020617',
    color: '#e2e8f0',
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: '100%',
  },
  keyItem: {
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  keyLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  keyProviderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  keyProviderChip: {
    borderRadius: 999,
    border: '1px solid #273449',
    background: '#050d1c',
    color: '#e2e8f0',
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 700,
  },
  keyDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: '#10b981',
    border: '1px solid #064e3b',
  },
  keyModel: {
    fontSize: 12,
    color: '#dbeafe',
  },
  keySampleText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#9ca3af',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  keyRight: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flex: '0 0 auto',
  },
  keyExpiredBadge: {
    marginLeft: 6,
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    border: '1px solid #7f1d1d',
    color: '#fecaca',
    background: '#450a0a',
  },
  keyPrimary: (active) => ({
    borderRadius: 10,
    border: `1px solid ${active ? '#475569' : '#2563eb'}`,
    background: active ? '#0f172a' : '#1d4ed8',
    color: active ? '#cbd5e1' : '#e0f2fe',
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  }),
  keyDangerIcon: (disabled) => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid #7f1d1d',
    background: disabled ? '#2b0d0d' : '#450a0a',
    color: '#fecaca',
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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
    resize: 'none',
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
    background: 'rgba(2, 6, 23, 0.9)',
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
    boxSizing: 'border-box',
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
    boxSizing: 'border-box',
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
    overflowWrap: 'anywhere',
    wordBreak: 'break-all',
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
    background: 'rgba(5, 11, 24, 0.88)',
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
  autoHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#8ea2c8',
    textAlign: 'left',
    alignSelf: 'flex-start',
    marginLeft: 6,
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#e2e8f0',
  },
  sliderTrack: {
    width: '100%',
  },
  sliderHint: {
    display: 'block',
    marginTop: 4,
    fontSize: 11,
    color: '#9fb3df',
  },
};
