"use client";

import { useMemo } from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";

function byPath(a, b) {
  return a.localeCompare(b);
}

export default function FileTree() {
  const { files, open, activePath } = useWorkspace();
  const entries = useMemo(() => Object.keys(files).sort(byPath), [files]);
  return (
    <div style={{ width: 220, borderRight: "1px solid #e5e7eb", background: "#0b1220" }}>
      <div style={{ padding: 8, color: "#e2e8f0", fontWeight: 700 }}>파일</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((p) => {
          const active = p === activePath;
          return (
            <li key={p}>
              <button
                onClick={() => open(p)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: active ? "#172033" : "transparent",
                  color: "#e2e8f0",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,0.2)",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

