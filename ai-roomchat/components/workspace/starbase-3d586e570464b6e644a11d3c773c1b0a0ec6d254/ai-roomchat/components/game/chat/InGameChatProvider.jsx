import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// Ephemeral, session-scoped chat provider with two isolated channels:
// - party: player-visible room chat (not indexed globally)
// - ai: system/AI game progression messages

const ChatCtx = createContext(null);

function nowIso() {
  try { return new Date().toISOString(); } catch { return ""; }
}

function makeMsg({ text, channel, from = {}, meta = {} }) {
  return {
    id: `${channel}-${Math.random().toString(36).slice(2)}`,
    at: nowIso(),
    channel,
    text,
    from: { id: from.id || "anon", name: from.name || "", role: from.role || "" },
    meta,
  };
}

export function InGameChatProvider({ children, sessionId, gameId, networkAdapter, currentUser }) {
  const [party, setParty] = useState([]);
  const [ai, setAI] = useState([]);
  const subsRef = useRef({ party: new Set(), ai: new Set() });

  const publish = useCallback((channel, message) => {
    if (channel === "party") {
      setParty(prev => {
        const next = [...prev, message];
        subsRef.current.party.forEach(fn => fn(next));
        return next;
      });
    } else if (channel === "ai") {
      setAI(prev => {
        const next = [...prev, message];
        subsRef.current.ai.forEach(fn => fn(next));
        return next;
      });
    }
  }, []);

  const post = useCallback((channel, text, meta = {}) => {
    const msg = makeMsg({ text, channel, from: currentUser, meta });
    publish(channel, msg);
    if (networkAdapter && typeof networkAdapter.send === "function") {
      try { networkAdapter.send("chat", { sessionId, gameId, channel, msg }); } catch {}
    }
    return msg;
  }, [currentUser, gameId, publish, sessionId, networkAdapter]);

  const subscribe = useCallback((channel, fn) => {
    const set = subsRef.current[channel];
    set.add(fn);
    return () => set.delete(fn);
  }, []);

  // Wire incoming network chat
  React.useEffect(() => {
    if (!networkAdapter || typeof networkAdapter.onMessage !== "function") return;
    const handler = (type, payload) => {
      if (type !== "chat") return;
      const { channel, msg } = payload || {};
      if (channel === "party" || channel === "ai") publish(channel, msg);
    };
    try { networkAdapter.onMessage(handler); } catch {}
    return () => {};
  }, [networkAdapter, publish]);

  const value = useMemo(() => ({
    channels: {
      party: {
        get messages() { return party; },
        send: (text, meta) => post("party", text, meta),
      },
      ai: {
        get messages() { return ai; },
        send: (text, meta) => post("ai", text, meta),
      },
    },
    post,
    subscribe,
  }), [ai, party, post, subscribe]);

  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}

export function useInGameChat() {
  const ctx = useContext(ChatCtx);
  if (!ctx) throw new Error("useInGameChat must be used within InGameChatProvider");
  return ctx;
}

