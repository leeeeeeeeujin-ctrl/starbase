"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "workspace.vfs.v1";

const defaultFiles = {
  "/README.md": {
    content:
      "# 작업공간 가이드\n\n- 좌측 파일트리에서 파일을 선택해 수정하세요.\n- 이 작업공간은 브라우저 LocalStorage에 저장됩니다.\n- 템플릿(JSON)과 동기화하기 전, 초기에 가상 파일로만 동작합니다.\n\n## 제공 변수(읽기 전용)\n- /context/player.json — 매칭된 플레이어 정보(샘플)\n- /context/owner.json — 오너/방장 정보(샘플)\n",
    readonly: false,
  },
  "/context/player.json": {
    content: JSON.stringify(
      {
        id: "player_demo",
        nickname: "DemoPlayer",
        level: 7,
        attributes: { hp: 100, attack: 20, defense: 8 },
      },
      null,
      2
    ),
    readonly: true,
  },
  "/context/owner.json": {
    content: JSON.stringify(
      {
        id: "owner_demo",
        title: "Room Owner",
        permissions: ["start", "kick", "mute"],
      },
      null,
      2
    ),
    readonly: true,
  },
  "/template.json": { content: "{}\n", readonly: false },
};

const WorkspaceCtx = createContext(null);

export function CodeWorkspaceProvider({ children }) {
  const [files, setFiles] = useState({});
  const [root, setRoot] = useState("/");
  const [activePath, setActivePath] = useState("/template.json");
  const [openPaths, setOpenPaths] = useState(["/template.json"]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setFiles(parsed.files || defaultFiles);
        setRoot(parsed.root || "/");
        setActivePath(parsed.activePath || "/template.json");
        setOpenPaths(parsed.openPaths || ["/template.json"]);
      } else {
        setFiles(defaultFiles);
      }
    } catch {
      setFiles(defaultFiles);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ files, root, activePath, openPaths })
      );
    } catch {}
  }, [files, root, activePath, openPaths]);

  const api = useMemo(() => {
    const exists = (path) => Boolean(files[path]);
    const inferLang = (path) => {
      if (!path) return "plaintext";
      const ext = (path.split(".").pop() || "").toLowerCase();
      if (ext === "json") return "json";
      if (ext === "md") return "markdown";
      if (ext === "js") return "javascript";
      if (ext === "ts") return "typescript";
      if (ext === "sql") return "sql";
      return "plaintext";
    };
    return {
      files,
      root,
      activePath,
      openPaths,
      setRoot,
      inferLang,
      open: (path) => {
        if (!exists(path)) return;
        if (!openPaths.includes(path)) setOpenPaths((arr) => [...arr, path]);
        setActivePath(path);
      },
      close: (path) =>
        setOpenPaths((arr) => arr.filter((p) => p !== path)),
      createFile: (path, content = "") =>
        setFiles((m) => ({ ...m, [path]: { content, readonly: false } })),
      writeFile: (path, content) =>
        setFiles((m) => {
          const f = m[path];
          if (!f) return m;
          if (f.readonly) return m;
          return { ...m, [path]: { ...f, content } };
        }),
      rename: (oldPath, newPath) =>
        setFiles((m) => {
          if (!m[oldPath]) return m;
          const { [oldPath]: old, ...rest } = m;
          return { ...rest, [newPath]: old };
        }),
      remove: (path) =>
        setFiles((m) => {
          const { [path]: _drop, ...rest } = m;
          return rest;
        }),
    };
  }, [files, root, activePath, openPaths]);

  return (
    <WorkspaceCtx.Provider value={api}>{children}</WorkspaceCtx.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used within CodeWorkspaceProvider");
  return ctx;
}

