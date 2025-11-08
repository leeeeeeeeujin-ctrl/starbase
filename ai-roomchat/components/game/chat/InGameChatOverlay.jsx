import React from "react";
import { useInGameChat } from "./InGameChatProvider.jsx";
import { matchesAudience } from "../../../lib/game/ai/template.js";

export default function InGameChatOverlay({ channel = "party", placeholder = "메시지 입력...", viewer }) {
  const { channels } = useInGameChat();
  const chat = channels[channel];
  const [text, setText] = React.useState("");

  const onSubmit = React.useCallback((e) => {
    e.preventDefault();
    if (!text.trim()) return;
    chat.send(text.trim());
    setText("");
  }, [chat, text]);

  return (
    <div style={{
      position: "absolute",
      right: 12,
      bottom: 12,
      width: 320,
      maxHeight: 240,
      display: "flex",
      flexDirection: "column",
      background: "rgba(12,12,16,0.9)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      overflow: "hidden",
      fontSize: 12,
      color: "#eaeaea",
      backdropFilter: "blur(4px)",
      zIndex: 20,
    }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 600 }}>
        {channel === "ai" ? "AI 진행" : "파티 채팅"}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {chat.messages.filter((m) => matchesAudience(m?.meta?.audience, viewer)).map((m) => (
          <div key={m.id} style={{ marginBottom: 6 }}>
            <span style={{ opacity: 0.7 }}>{m.from.name || m.from.id}</span>
            <span style={{ opacity: 0.5 }}> · </span>
            <span style={{ opacity: 0.5 }}>{new Date(m.at).toLocaleTimeString?.() || m.at}</span>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </div>
      <form onSubmit={onSubmit} style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          aria-label="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, padding: 8, background: "transparent", color: "#fff", border: "none", outline: "none" }}
        />
        <button type="submit" style={{ padding: "8px 12px", background: "#3a6df0", color: "#fff", border: "none" }}>전송</button>
      </form>
    </div>
  );
}
