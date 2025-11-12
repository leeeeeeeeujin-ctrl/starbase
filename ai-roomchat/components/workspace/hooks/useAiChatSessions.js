import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

const STORAGE_KEY = 'workspace:aiChat:sessions.v1';
const DEFAULT_TITLE = 'Untitled Chat';

const createSession = () => ({
  id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: DEFAULT_TITLE,
  createdAt: Date.now(),
  logs: [],
});

const hasLogs = (session) => Array.isArray(session?.logs) && session.logs.length > 0;

const INITIAL_STATE = { sessions: [], currentId: null };

function sessionReducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return action.payload;
    case 'SET_CURRENT':
      return state.sessions.some((s) => s.id === action.payload.id)
        ? { ...state, currentId: action.payload.id }
        : state;
    case 'START_NEW': {
      const fresh = createSession();
      const retained = state.sessions.filter((session) => hasLogs(session));
      return { sessions: [fresh, ...retained], currentId: fresh.id };
    }
    case 'DELETE': {
      const filtered = state.sessions.filter((session) => session.id !== action.payload.id);
      if (!filtered.length) {
        const fallback = createSession();
        return { sessions: [fallback], currentId: fallback.id };
      }
      const nextId =
        action.payload.id === state.currentId
          ? (filtered.find(hasLogs) || filtered[0]).id
          : state.currentId;
      return { sessions: filtered, currentId: nextId };
    }
    case 'APPEND': {
      const { sessionId, role, msg } = action.payload;
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const logs = [...(session.logs || []), { t: Date.now(), role, msg }];
        const shouldRename = session.title === DEFAULT_TITLE && role === 'user';
        const preview = typeof msg === 'string' ? msg : msg?.text || '';
        return {
          ...session,
          title: shouldRename ? preview.slice(0, 48) || DEFAULT_TITLE : session.title,
          logs,
        };
      });
      return { ...state, sessions: nextSessions };
    }
    case 'APPEND_PREVIEW': {
      const { sessionId, preview } = action.payload;
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const logs = [
          ...(session.logs || []),
          { t: Date.now(), role: 'user', msg: { type: 'uiPreview', ...preview } },
        ];
        return { ...session, logs };
      });
      return { ...state, sessions: nextSessions };
    }
    case 'RENAME': {
      const { sessionId, title } = action.payload;
      if (!sessionId || typeof title !== 'string') return state;
      const trimmed = title.trim() || DEFAULT_TITLE;
      const nextSessions = state.sessions.map((session) =>
        session.id === sessionId ? { ...session, title: trimmed } : session
      );
      return { ...state, sessions: nextSessions };
    }
    default:
      return state;
  }
}

function sanitizeLoadedSessions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((session) => ({
      id: session?.id || createSession().id,
      title: typeof session?.title === 'string' && session.title.trim()
        ? session.title
        : DEFAULT_TITLE,
      createdAt: session?.createdAt || Date.now(),
      logs: Array.isArray(session?.logs) ? session.logs : [],
    }))
    .filter((session) => hasLogs(session));
}

function hydrateSessions() {
  if (typeof window === 'undefined') {
    const fallback = createSession();
    return { sessions: [fallback], currentId: fallback.id };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cleaned = sanitizeLoadedSessions(parsed.sessions);
      if (cleaned.length) {
        const currentId = cleaned.find((s) => s.id === parsed.currentId)?.id || cleaned[0].id;
        return { sessions: cleaned, currentId };
      }
    }
  } catch {
    // ignore corrupted storage
  }
  const fallback = createSession();
  return { sessions: [fallback], currentId: fallback.id };
}

function persistSessions(state) {
  if (typeof window === 'undefined') return;
  const toSave = state.sessions.filter(
    (session) => hasLogs(session) || session.id === state.currentId,
  );
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessions: toSave, currentId: state.currentId }),
    );
  } catch {
    // ignore quota errors
  }
}

export function useAiChatSessions() {
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = hydrateSessions();
    dispatch({ type: 'INIT', payload: initial });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistSessions(state);
  }, [state, hydrated]);

  const setCurrentId = useCallback((id) => {
    dispatch({ type: 'SET_CURRENT', payload: { id } });
  }, []);

  const append = useCallback(
    (role, msg) => {
      if (!state.currentId) return;
      dispatch({ type: 'APPEND', payload: { sessionId: state.currentId, role, msg } });
    },
    [state.currentId],
  );

  const appendPreview = useCallback(
    (preview) => {
      if (!state.currentId) return;
      dispatch({ type: 'APPEND_PREVIEW', payload: { sessionId: state.currentId, preview } });
    },
    [state.currentId],
  );

  const startNewChat = useCallback(() => {
    dispatch({ type: 'START_NEW' });
  }, []);

  const deleteSession = useCallback((id) => {
    dispatch({ type: 'DELETE', payload: { id } });
  }, []);

  const renameSession = useCallback((id, title) => {
    dispatch({ type: 'RENAME', payload: { sessionId: id, title } });
  }, []);

  const currentSession = useMemo(() => {
    if (!state.sessions.length) {
      return { id: '', title: DEFAULT_TITLE, logs: [] };
    }
    return state.sessions.find((session) => session.id === state.currentId) || state.sessions[0];
  }, [state.sessions, state.currentId]);

  const logs = currentSession.logs || [];

  return {
    sessions: state.sessions,
    currentId: state.currentId,
    currentSession,
    logs,
    setCurrentId,
    append,
    appendPreview,
    startNewChat,
    deleteSession,
    renameSession,
  };
}
