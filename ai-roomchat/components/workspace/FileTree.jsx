"use client";

import { useMemo } from "react";
import { useWorkspace } from "./CodeWorkspaceProvider.jsx";

function byPath(a, b) {
  return a.localeCompare(b);
}

export default function FileTree() {
  const { files, root, setRoot, normalizeDir, open, activePath } = useWorkspace();
  const { folders, fileEntries } = useMemo(() => {
    const folders = new Set();
    const fileEntries = [];
    const rootPrefix = normalizeDir(root || '/');
    for (const full of Object.keys(files)) {
      if (!full.startsWith(rootPrefix)) continue;
      const rel = full.slice(rootPrefix.length);
      if (rel.length === 0) continue;
      if (rel.includes('/')) {
        const top = rel.split('/')[0];
        if (top) folders.add(top);
      } else {
        fileEntries.push(full);
      }
    }
    return { folders: Array.from(folders).sort(byPath), fileEntries: fileEntries.sort(byPath) };
  }, [files, root]);

  const goUp = () => {
    const r = normalizeDir(root || '/');
    if (r === '/') return;
    const parent = r.replace(/[^/]+\/$/, '');
    setRoot(parent || '/');
  };

  return (
    <div style={{ width: '100%', borderRight: "1px solid #25314a", background: "#0b1220" }}>
      <div style={{ padding: 8, color: "#e2e8f0", fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>파일</span>
        <button onClick={goUp} title="상위 폴더" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0' }}>⬆</button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {folders.map((name) => {
          const full = normalizeDir((normalizeDir(root || '/')) + name);
          return (
            <li key={full}>
              <button
                onClick={() => setRoot(full)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: "transparent",
                  color: "#93c5fd",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,0.12)",
                  cursor: "pointer",
                }}
              >
                📁 {name}
              </button>
            </li>
          );
        })}
        {fileEntries.map((full) => {
          const active = full === activePath;
          const name = full.split('/').pop();
          return (
            <li key={full}>
              <button
                onClick={() => open(full)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: active ? "#172033" : "transparent",
                  color: "#e2e8f0",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,0.12)",
                  cursor: "pointer",
                }}
              >
                📄 {name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
