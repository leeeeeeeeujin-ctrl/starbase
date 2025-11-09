import React from "react";

// Simple on-screen controls for mobile: D-pad + 2 action buttons
// Emits onInput-style events via onInput prop.

export default function VirtualControls({ onInput, layout = "right" }) {
  const [pressed, setPressed] = React.useState({});
  const press = (key, down) => {
    setPressed((p) => ({ ...p, [key]: down }));
    onInput?.({ type: down ? "keydown" : "keyup", key });
  };

  const dirBtn = (k, label, style) => (
    <button
      key={k}
      onPointerDown={(e) => { e.preventDefault(); press(k, true); }}
      onPointerUp={(e) => { e.preventDefault(); press(k, false); }}
      onPointerCancel={() => press(k, false)}
      style={{
        width: 40, height: 40, borderRadius: 8, margin: 4,
        background: pressed[k] ? "#3a6df0" : "#222",
        color: "#fff", border: "1px solid #444", ...style,
      }}>{label}</button>
  );

  const actionBtn = (k, label) => (
    <button
      key={k}
      onPointerDown={(e) => { e.preventDefault(); press(k, true); }}
      onPointerUp={(e) => { e.preventDefault(); press(k, false); }}
      onPointerCancel={() => press(k, false)}
      style={{
        width: 56, height: 56, borderRadius: 28, margin: 6,
        background: pressed[k] ? "#f05a3a" : "#333",
        color: "#fff", border: "1px solid #555",
      }}>{label}</button>
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* D-pad */}
      <div style={{ position: "absolute", left: 12, bottom: 12, pointerEvents: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {dirBtn("ArrowUp", "▲")}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {dirBtn("ArrowLeft", "◀")}
          {dirBtn("ArrowDown", "▼")}
          {dirBtn("ArrowRight", "▶")}
        </div>
      </div>
      {/* Action buttons */}
      <div style={{ position: "absolute", right: 12, bottom: 12, pointerEvents: "auto", display: "flex" }}>
        {actionBtn("Space", "A")}
        {actionBtn("KeyX", "B")}
      </div>
    </div>
  );
}

