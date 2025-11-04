"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const Ctx = createContext(null);

function makeId(pfx="evt") { return `${pfx}_${Math.random().toString(36).slice(2,9)}`; }

export function GameRuntimeProvider({ roomId = "local-room", roles = { players: [], observers: [] }, children, defaultDurations = [30, 60, 90, 120, 180] }) {
  const [connected, setConnected] = useState(false);
  const chanRef = useRef(null);
  const bcRef = useRef(null);
  const room = useMemo(() => String(roomId || "local-room"), [roomId]);

  // timers
  const [durations] = useState(defaultDurations);
  const [deadline, setDeadline] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [votes, setVotes] = useState({}); // { role -> Set(userId) }
  const [nextTriggered, setNextTriggered] = useState(false);

  // messages
  const [aiMessages, setAiMessages] = useState([]); // {id, roleScope, text, ts}
  const [chatMessages, setChatMessages] = useState([]); // {id, from, to, text, ts}
  // logs
  const aiFullLogsRef = useRef([]); // record full prompts/responses (not shown to players)

  // runtime graph/hooks
  const graphRef = useRef({ nodes: [], edges: [] });
  const hooksRef = useRef({});
  const configRef = useRef({});
  const filesRef = useRef({});
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const waitingRef = useRef(false);
  const indexById = useRef(new Map());
  const edgesBySource = useRef(new Map());

  const reindex = useCallback(() => {
    const map = new Map();
    (graphRef.current.nodes||[]).forEach((n,i)=>map.set(n.id, i));
    indexById.current = map;
    const eMap = new Map();
    (graphRef.current.edges||[]).forEach(e => {
      const arr = eMap.get(e.source) || []; arr.push(e); eMap.set(e.source, arr);
    });
    edgesBySource.current = eMap;
  }, []);

  const getNode = useCallback((id) => {
    const i = indexById.current.get(id);
    return (i!=null) ? graphRef.current.nodes[i] : null;
  }, []);
  const neighborsOf = useCallback((id) => {
    const list = edgesBySource.current.get(id) || [];
    return list.map(e => ({ id: e.target, label: e.label || '' }));
  }, []);

  const publish = useCallback((type, payload) => {
    const evt = { type, payload, room, id: makeId("e"), ts: Date.now() };
    try { if (chanRef.current) chanRef.current.send({ type: "broadcast", event: "evt", payload: evt }); } catch {}
    try { if (bcRef.current) bcRef.current.postMessage(evt); } catch {}
    // also loopback apply
    apply(evt);
  }, [room]);

  const apply = useCallback((evt) => {
    switch (evt.type) {
      case 'ai:message':
        setAiMessages(m => [...m, evt.payload]);
        return;
      case 'chat:message':
        setChatMessages(m => [...m, evt.payload]);
        // if waiting for user action, treat this as input and advance
        try {
          if (waitingRef.current) {
            const ctx = window.__GAME_RUNTIME_CTX__;
            if (ctx) {
              const hooks = hooksRef.current || {};
              let nextId = null;
              try { if (typeof hooks.onUserAction === 'function') nextId = hooks.onUserAction({ node: ctx.getCurrentNode?.() }, evt.payload?.text || ''); } catch {}
              if (nextId) ctx.setCurrentId(nextId);
              ctx.setWaiting(false);
              setTimeout(() => { try { step('user_action'); } catch {} }, 0);
            }
          }
        } catch {}
        return;
      case 'control:startTimer': {
        const until = Date.now() + (Math.max(1, evt.payload.seconds) * 1000);
        setDeadline(until); setNextTriggered(false); setVotes({});
        return;
      }
      case 'control:voteNext': {
        const { userId, role } = evt.payload || {};
        if (!userId || !role) return;
        setVotes(prev => {
          const nx = { ...prev };
          const cur = new Set(nx[role] || []); cur.add(userId); nx[role] = cur;
          return nx;
        });
        return;
      }
      case 'control:forceNext':
        setNextTriggered(true);
        setDeadline(Date.now());
        // attempt a step on force
        try { step('force'); } catch {}
        return;
    }
  }, []);

  // connect realtime
  useEffect(() => {
    let sub; let bc;
    try {
      if (supabase?.channel) {
        sub = supabase.channel(`game:${room}`).on('broadcast', { event: 'evt' }, ({ payload }) => {
          if (payload?.room !== room) return;
          apply(payload);
        }).subscribe((status) => { setConnected(status === 'SUBSCRIBED'); });
        chanRef.current = sub;
      }
    } catch {}
    try { bc = new BroadcastChannel(`game:${room}`); bc.onmessage = (ev) => { const p = ev.data; if (p?.room === room) apply(p); }; bcRef.current = bc; } catch {}
    return () => {
      try { if (sub) supabase.removeChannel(sub); } catch {}
      try { bc?.close(); } catch {}
      chanRef.current = null; bcRef.current = null;
    };
  }, [room, apply]);

  // timer tick
  useEffect(() => {
    const t = setInterval(() => {
      if (!deadline) return setSecondsLeft(0);
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setNextTriggered(true);
    }, 250);
    return () => clearInterval(t);
  }, [deadline]);

  // early next if all roles reached threshold (>= 2/3 members pressed next)
  useEffect(() => {
    if (!roles || !Object.keys(roles).length) return;
    const okPerRole = Object.entries(roles).map(([role, ids]) => {
      const total = Array.isArray(ids) ? ids.length : 0;
      if (total === 0) return true; // empty roles count as done
      const vset = votes[role] instanceof Set ? votes[role] : new Set();
      const need = Math.ceil((2/3) * total);
      return vset.size >= need;
    });
    if (okPerRole.every(Boolean) && !nextTriggered) {
      setNextTriggered(true);
      setDeadline(Date.now());
    }
  }, [votes, roles, nextTriggered]);

  const api = useMemo(() => ({
    room,
    connected,
    durations,
    secondsLeft,
    nextTriggered,
    votes, roles,
    aiMessages, chatMessages,
    publish,
    // helpers
    sendAI: (payload, fullPrompt, fullResponse) => {
      publish('ai:message', payload);
      if (fullPrompt || fullResponse) aiFullLogsRef.current.push({ ts: Date.now(), fullPrompt, fullResponse });
    },
    sendChat: (payload) => publish('chat:message', payload),
    startTimer: (seconds) => publish('control:startTimer', { seconds }),
    voteNext: (userId, role) => publish('control:voteNext', { userId, role }),
    forceNext: () => publish('control:forceNext', {}),
    exportBattleLog: () => {
      try {
        const blob = new Blob([JSON.stringify({ aiFull: aiFullLogsRef.current }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `battlelog_${room}_${Date.now()}.json`; a.click();
      } catch {}
    },
    // runtime configuration from VFS
    setRuntime: ({ graph, hooks, config, files }) => {
      graphRef.current = graph || { nodes: [], edges: [] };
      hooksRef.current = hooks || {};
      configRef.current = config || {};
      filesRef.current = files || {};
      reindex();
      const entry = config?.entryNode || graphRef.current.nodes?.[0]?.id || null;
      setCurrentNodeId(entry);
      waitingRef.current = false;
      // if entry exists and is not user_action, step immediately
      if (entry) setTimeout(() => { try { step('init'); } catch {} }, 0);
    },
  }), [room, connected, durations, secondsLeft, nextTriggered, votes, roles, aiMessages, chatMessages, publish]);

  // expose internal runtime context for helper step()
  useEffect(() => {
    try {
      window.__GAME_RUNTIME_CTX__ = {
        graphRef, hooksRef, configRef,
        getCurrentId: () => currentNodeId,
        setCurrentId: (id) => setCurrentNodeId(id),
        setWaiting: (b) => { waitingRef.current = !!b; },
        getNode, neighborsOf,
        filesRef,
        sendAI: (payload, fullPrompt, fullResponse) => api.sendAI(payload, fullPrompt, fullResponse),
        publish: (type, payload) => publish(type, payload),
      };
    } catch {}
    return () => { try { delete window.__GAME_RUNTIME_CTX__; } catch {} };
  }, [currentNodeId, getNode, neighborsOf, publish, api]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useGameRuntime() {
  const v = useContext(Ctx); if (!v) throw new Error('useGameRuntime outside provider');
  return v;
}

// ---- internal helpers (after hooks to avoid re-creation) ----
function step(reason){
  // this runs in closure via provider scope; bind to latest refs through window stash
  try {
    const ctx = window.__GAME_RUNTIME_CTX__;
    if (!ctx) return;
    const { graphRef, hooksRef, configRef, indexById, edgesBySource, getNode, neighborsOf, setCurrentNodeId, sendAI, publish } = ctx;
    let currentId = ctx.getCurrentId();
    if (!currentId) return;
    let guard = 0;
    while (guard++ < 5) {
      const node = getNode(currentId);
      if (!node) break;
      if (node.type === 'user_action') { ctx.setWaiting(true); break; }
      if (node.type === 'system') {
        publish('ai:message', { id: `sys_${Date.now()}`, roleScope: 'system', text: node.label || '', ts: Date.now() });
      } else {
        // ai node
        const hooks = hooksRef.current || {};
        let prompt = String(node.label || '');
        try { if (typeof hooks.transformPrompt === 'function') { prompt = hooks.transformPrompt({ node, reason }); } } catch {}
        sendAI({ id:`ai_${Date.now()}`, roleScope:'players', text: `(thinking)`, ts: Date.now() }, prompt, null);
      }
      const neigh = neighborsOf(currentId) || [];
      const hooks = hooksRef.current || {};
      let nextId = null;
      try { if (typeof hooks.selectNext === 'function') nextId = hooks.selectNext({ node: getNode(currentId) }, neigh); } catch {}
      if (!nextId) nextId = neigh?.[0]?.id || null;
      if (!nextId) break;
      setCurrentNodeId(nextId);
      currentId = nextId;
    }
  } catch {}
}
