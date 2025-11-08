"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { compressString, decompressToString } from "../../utils/compress.js";
import { injectFilesWithFallback } from "../../lib/workspace/injectFilesFallback.js";
// snapshot/local cache disabled in server-first mode

const BASE_KEY = "workspace.vfs.v1";

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
  "/graph/prompt-graph.json": { content: "{\n  \"nodes\": [],\n  \"edges\": []\n}\n", readonly: false },
  "/game/runtime.config.json": {
    content: JSON.stringify({
      version: 1,
      roles: ["players", "observers"],
      voteThreshold: 0.6667,
      durations: [30, 60, 90, 120, 180],
      entryNode: null,
      ai: { model: "gemini-2.5-flash" }
    }, null, 2)+"\n",
    readonly: false,
  },
  "/game/hooks/automation.js": {
    content:
      [
        "// User automation hooks for the prompt-graph runtime.",
        "// Export any of these if you need custom behavior.",
        "export function onTurnStart(ctx) {",
        "  // ctx: { turn, activeRole, variables, node, files }",
        "}",
        "export function onUserAction(ctx, input) {",
        "  // return optional next node id or mutation plan",
        "}",
        "export function transformPrompt(ctx) {",
        "  // You can return string or { prompt, ui }.",
        "  // Inline include markers are supported: {{file:/path}} or {{code:/path#L10-20}}.",
        "  const base = String(ctx?.node?.label || '');",
        "  // Example: inject code snippet from another file",
        "  const header = '[[Intro]]';",
        "  return `${header}\n\n${base}\n\nSee: {{code:/game/hooks/automation.js#L1-40}}`;",
        "}",
        "export function selectNext(ctx, neighbors) {",
        "  // neighbors: [{ id, label, type }]",
        "  return neighbors?.[0]?.id ?? null;",
        "}",
        "",
      ].join("\n")+"\n",
    readonly: false,
  },
  "/docs/AI_GUIDE.md": {
    content:
      [
        "# AI Coding Guide (Workspace)",
        "\n",
        "## Files",
        "- /template.json — raw studio template (nodes/edges)",
        "- /graph/prompt-graph.json — normalized graph produced from template",
        "- /game/runtime.config.json — runtime params (roles, durations, entry)",
        "- /game/hooks/automation.js — user-defined hooks",
        "\n",
        "## Prompt Composition",
        "- transformPrompt(ctx) can return string or { prompt, ui }.",
        "- Inline include markers are supported in prompt:",
        "  - {{file:/path/to/file.ext}} — embed whole file (truncated if large)",
        "  - {{code:/path/to/file.ext#Lstart-Lend}} — embed specific line range",
        "- Hooks receive ctx.files for direct access if needed.",
        "\n",
        "## Edit Actions JSON (for AI Code Chat)",
        "Return JSON only: { \"message?\": string, \"actions?\": [ { \"type\":\"create|write|delete|rename\", ... } ] }",
        "\n",
        "## Prompt Graph",
        "Each node has: { id, type: 'ai'|'user_action'|'system', label }. Edges define transitions.",
        "Use hooks to transform prompt or select next node.",
        "\n",
        "## Typical Workflow",
        "1. Modify /template.json or /graph/prompt-graph.json",
        "2. Adjust /game/runtime.config.json (entryNode, durations, roles)",
        "3. Implement /game/hooks/automation.js to handle user actions",
        "4. Test via the Editor's runtime panel",
        "\n",
        "## Pages (optional)",
        "- /game/pages/index.json — page registry: { \"main\": { \"title\": \"Main\", \"type\": \"ui|script\", \"path\": \"/game/pages/ui/main.json\" } }",
        "- UI page: JSON schema rendered by the editor (vstack/hstack/text/button/image/card).",
        "- Script page: JS file exporting function render(ctx) => { schema, handlers }.",
        "  - handlers[eventName] can be triggered from buttons.",
      ].join("\n")+"\n",
    readonly: false,
  },
  "/game/pages/index.json": {
    content: JSON.stringify({
      main: { title: "Main", type: "ui", path: "/game/pages/ui/main.json" },
      script: { title: "ScriptDemo", type: "script", path: "/game/pages/scripts/main.js" },
      chatUi: { title: "Chat UI", type: "ui", path: "/game/pages/ui/chat.json" },
      customHistory: { title: "History+", type: "script", path: "/game/pages/scripts/customHistory.js" }
    }, null, 2)+"\n",
    readonly: false,
  },
  "/game/pages/ui/main.json": {
    content: JSON.stringify({
      type: "vstack",
      gap: 10,
      children: [
        { type: "text", value: "🎮 Page: Main", fontSize: 16, bold: true },
        { type: "card", children: [
          { type: "text", value: "이 영역은 UI JSON 스키마로 작성됩니다.", color: "#cbd5e1" },
          { type: "button", label: "이벤트 전송", event: "ping", payload: { msg: "hello" } }
        ]}
      ]
    }, null, 2)+"\n",
    readonly: false,
  },
  "/game/pages/ui/chat.json": {
    content: JSON.stringify({
      type: "vstack",
      gap: 8,
      children: [
        { type: "text", value: "💬 Custom Chat UI", fontSize: 16, bold: true },
        { type: "card", children: [
          { type: "text", value: "이 패널은 템플릿 오버라이드로 교체되었습니다.", color: "#cbd5e1" },
          { type: "button", label: "Ping", event: "ping", payload: { msg: "hello" } }
        ]}
      ]
    }, null, 2)+"\n",
    readonly: false,
  },
  "/game/pages/scripts/main.js": {
    content: [
      "export function render(ctx){",
      "  const schema = {",
      "    type: 'vstack', gap: 10, children: [",
      "      { type:'text', value:'🧩 Script Page', fontSize:16, bold:true },",
      "      { type:'button', label:'자원보기', event:'showResources' }",
      "    ]",
      "  };",
      "  const handlers = {",
      "    showResources(){ console.log('resources', Object.keys(ctx.files||{})); }",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
    readonly: false,
  },
  "/game/pages/scripts/customHistory.js": {
    content: [
      "export function render(ctx){",
      "  const schema = {",
      "    type: 'vstack', gap: 8, children: [",
      "      { type:'text', value:'📜 History+', fontSize:16, bold:true },",
      "      { type:'button', label:'리소스 보기', event:'showResources' }",
      "    ]",
      "  };",
      "  const handlers = {",
      "    showResources(){ console.log('files', Object.keys(ctx.files||{})); }",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
    readonly: false,
  },
  "/characters/sample.json": {
    content: JSON.stringify({
      id: "char_sample",
      name: "샘플 캐릭터",
      description: "비실시간 조우용 샘플 캐릭터",
      image_url: "",
      background_url: "",
      ability1: "민첩",
      ability2: "지능",
      ability3: "체력",
      ability4: "행운"
    }, null, 2)+"\n",
    readonly: false,
  },
};

const WorkspaceCtx = createContext(null);

export function CodeWorkspaceProvider({ children, storageNamespace, initialFiles }) {
  // Per-instance storage namespace (set id); use explicit storageNamespace or server-provided patch scope.
  let ns = (typeof window !== 'undefined' ? (storageNamespace || (window.__VFS_SCOPED_PATCH__ && window.__VFS_SCOPED_PATCH__.scope)) : null) || null;
  const nsKey = (k) => (ns ? `${k}@${ns}` : k);
  const KEY = nsKey(BASE_KEY);
  const isDev = process.env.NODE_ENV !== 'production';
  // In development, require an explicit storageNamespace prop to avoid accidental cross-set bleed.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (isDev && !storageNamespace) {
        // Fail fast in dev to make the missing-namespace explicit during development.
        throw new Error('[Workspace] Missing storageNamespace prop (development). Provide storageNamespace to avoid cross-set state bleed.');
      }
      if (!isDev && !ns) {
        try { console.warn('[Workspace] Missing storageNamespace; state may bleed across sets.'); } catch {}
      }
    } catch (err) {
      // Throw in dev to make the problem obvious.
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [files, setFiles] = useState({});
  const [root, setRoot] = useState("/");
  const [activePath, setActivePath] = useState("/template.json");
  const [openPaths, setOpenPaths] = useState(["/template.json"]);
  const [entryPath, setEntryPath] = useState("/template.json");
  const [dirty, setDirty] = useState({}); // { [path]: true }
  // Track last saved content signature to avoid marking unchanged files dirty just by opening
  const [savedSig, setSavedSig] = useState({}); // { [path]: string(hash) }

  useEffect(() => {
    try {
      // Strict server-first: require initialFiles for hydrate; no localStorage fallback
      if (Array.isArray(initialFiles)) {
        if (initialFiles.length) {
          if (isDev) try { console.log('[Workspace] hydrate from initialFiles ns=%s count=%d', ns||'-', initialFiles.length); } catch {}
          const map = {};
          initialFiles.forEach((f) => { if (f && f.path) map[f.path] = { content: String(f.content||''), readonly: !!f.readonly, dir: !!f.dir }; });
          const merged = { ...defaultFiles, ...map };
          try {
            if (!merged['/graph/prompt-graph.json'] && typeof merged['/template.json']?.content === 'string') {
              const obj = JSON.parse(merged['/template.json'].content || '{}');
              const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
              const edges = Array.isArray(obj.edges) ? obj.edges : [];
              merged['/graph/prompt-graph.json'] = { content: JSON.stringify({
                nodes: nodes.map(n => ({ id: n.id, type: n.type || 'prompt', label: n.data?.name || n.label || '' })),
                edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || '' })),
              }, null, 2)+'\n', readonly: false };
            }
          } catch {}
          setFiles(merged);
          setRoot("/");
          setActivePath("/template.json");
          setOpenPaths(["/template.json"]);
          const nextSig = {};
          Object.entries(merged || {}).forEach(([p, meta]) => { nextSig[p] = contentSignature(meta); });
          setDirty({});
          setSavedSig(nextSig);
          return;
        }
        // empty initialFiles → defaults only
        setFiles(defaultFiles);
        const sigs = {};
        Object.entries(defaultFiles).forEach(([p, meta]) => { sigs[p] = contentSignature(meta); });
        setSavedSig(sigs);
        setDirty({});
        return;
      }
      if (isDev) {
        throw new Error('[Workspace] initialFiles is required in dev (server-first).');
      }
      setFiles(defaultFiles);
      const sigs = {};
      Object.entries(defaultFiles).forEach(([p, meta]) => { sigs[p] = contentSignature(meta); });
      setSavedSig(sigs);
      setDirty({});
    } catch {
      setFiles(defaultFiles);
      const sigs = {};
      Object.entries(defaultFiles).forEach(([p, meta]) => { sigs[p] = contentSignature(meta); });
      setSavedSig(sigs);
      setDirty({});
    }
  }, [initialFiles]);

  // Removed localStorage autosave: saving is owned by parent flows (prompt editor saves)

  // Persist a plain-files snapshot per set for external loaders (Starter Pack / reload)
  // Removed snapshot persistence to local cache.

  // Reconcile dirty flags with saved signatures & initialize missing signatures
  useEffect(() => {
    try {
      let sigChanged = false;
      const nextSig = { ...(savedSig || {}) };
      Object.entries(files || {}).forEach(([p, meta]) => {
        const sig = contentSignature(meta);
        if (!nextSig[p]) { nextSig[p] = sig; sigChanged = true; }
      });
      if (sigChanged) setSavedSig(nextSig);
      let dirtyChanged = false;
      const nextDirty = { ...(dirty || {}) };
      Object.entries(files || {}).forEach(([p, meta]) => {
        const sig = contentSignature(meta);
        if (nextDirty[p] && nextSig[p] && nextSig[p] === sig) { nextDirty[p] = false; dirtyChanged = true; }
      });
      if (dirtyChanged) setDirty(nextDirty);
    } catch {}
  }, [files]);

  const api = useMemo(() => {
    const exists = (path) => Boolean(files[path]);
    const MAX_VFS_BYTES = 15 * 1024 * 1024; // 15MB soft limit
    const isAssetPath = (p) => /^\/(assets|resources)\//.test(p) || /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|mp4)$/i.test(p||'');
    const totalBytes = () => Object.entries(files).reduce((sum, [p, meta]) => {
      if (!meta) return sum;
      if (meta.compressed && meta.data) return sum + (meta.rawLen || meta.compLen || (meta.data.length*0.75));
      const c = (typeof meta.content === 'string') ? meta.content.length : 0;
      return sum + c;
    }, 0);
    const canon = (p) => {
      const raw = String(p || '').trim();
      return '/' + raw.replace(/^\/+/, '');
    };
    const isDir = (path) => {
      if (!path) return false;
      if (path.endsWith('/')) return true;
      const meta = files[canon(path)];
      return meta && meta.dir === true;
    };
    const normalizeDir = (path) => {
      if (!path) return '/';
      const c = canon(path);
      return c.endsWith('/') ? c : c + '/';
    };
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
      entryPath,
      dirty,
      isDirty: (path) => {
        const meta = files[path];
        if (!meta) return false;
        const curSig = contentSignature(meta);
        const sig = savedSig[path];
        if (sig && sig === curSig) return false;
        return !!dirty[path];
      },
      saveFile: (path) => {
        const meta = files[path];
        const sig = contentSignature(meta);
        setSavedSig((m) => ({ ...m, [path]: sig }));
        setDirty((m) => ({ ...m, [path]: false }));
      },
      saveAll: () => {
        setSavedSig((m) => {
          const next = { ...m };
          Object.entries(files).forEach(([p, meta]) => {
            next[p] = contentSignature(meta);
          });
          return next;
        });
        setDirty((m) => {
          const next = { ...m };
          Object.keys(next).forEach((k) => { next[k] = false; });
          return next;
        });
      },
      setEntryPath,
      setRoot,
      isDir,
      normalizeDir,
      inferLang,
      open: (path) => {
        if (isDir(path)) {
          setRoot(normalizeDir(path));
          return;
        }
        const c = canon(path);
        if (!exists(c)) return;
        if (!openPaths.includes(c)) setOpenPaths((arr) => [...arr, c]);
        setActivePath(c);
      },
      close: (path) =>
        setOpenPaths((arr) => arr.filter((p) => p !== path)),
      createFile: (path, content = "") =>
        { const c=canon(path); setFiles((m) => ({ ...m, [c]: { content, readonly: false } })); setDirty((d) => ({ ...d, [c]: true })); },
      createFolder: (path) =>
        setFiles((m) => ({ ...m, [normalizeDir(path)]: { dir: true, readonly: true } })),
      writeFile: (path, content) =>
        setFiles((m) => {
          const c = canon(path);
          const f = m[c] || { readonly: false };
          if (f.readonly) return m;
          const next = { ...m };
          const curTotal = totalBytes();
          const isAsset = isAssetPath(path);
          let entry;
          if (isAsset && typeof window !== 'undefined') {
            // compress assets; large text also compressed
            // note: async compress; here we store placeholder then finalize in microtask
            entry = { ...f, pending: true };
            next[c] = entry;
            queueMicrotask(async () => {
              const r = await compressString(String(content||''));
              const after = { ...entry, pending: false, compressed: true, algo: r.algo, data: r.data, rawLen: r.rawLen, compLen: r.compLen };
              // size check
              const delta = (r.rawLen || 0) - ((typeof f.content === 'string') ? f.content.length : (f.rawLen||0));
              if (curTotal + Math.max(0, delta) > MAX_VFS_BYTES) {
                alert('최대 게임 파일 크기(15MB)를 초과하여 저장할 수 없습니다.');
                // revert
                setFiles((mm) => ({ ...mm, [c]: f }));
                return;
              }
              setFiles((mm) => ({ ...mm, [c]: after }));
              // Mark dirty only if signature changed vs last saved
              const newSig = contentSignature(after);
              setDirty((d) => {
                const prevSig = savedSig[c];
                if (prevSig && prevSig === newSig) return { ...d, [path]: false };
                return { ...d, [c]: true };
              });
            });
          } else {
            const newContent = String(content||'');
            // If content didn't actually change, no-op and don't mark dirty
            if (typeof f.content === 'string' && f.content === newContent) return m;
            entry = { ...f, content: newContent, compressed: false, data: undefined };
            const delta = entry.content.length - ((typeof f.content === 'string') ? f.content.length : 0);
            if (curTotal + Math.max(0, delta) > MAX_VFS_BYTES) {
              alert('최대 게임 파일 크기(15MB)를 초과하여 저장할 수 없습니다.');
              return m;
            }
            next[c] = entry;
          }
          // mark dirty on write
          queueMicrotask(() => {
            // Mark dirty only if content differs from last saved signature
            const metaNext = next[c];
            const curSig = contentSignature(metaNext);
            const sig = savedSig[c];
            if (!sig || sig !== curSig) setDirty((d) => ({ ...d, [c]: true }));
          });
          return next;
        }),
      rename: (oldPath, newPath) => {
        setFiles((m) => {
          const o=canon(oldPath), n=canon(newPath);
          if (!m[o]) return m;
          const { [o]: old, ...rest } = m;
          return { ...rest, [n]: old };
        });
        setOpenPaths((arr) => arr.map((p) => (p === o ? n : p)));
        setActivePath((p) => (p === o ? n : p));
        setEntryPath((p) => (p === o ? n : p));
        setDirty((d) => {
          const o=canon(oldPath), n=canon(newPath);
          const { [o]: _drop, ...rest } = d || {};
          return { ...rest, [n]: d?.[o] || false };
        });
        setSavedSig((s) => {
          const o=canon(oldPath), n=canon(newPath);
          const { [o]: sigOld, ...rest } = s || {};
          return { ...rest, [n]: sigOld };
        });
      },
      remove: (path) => {
        setFiles((m) => {
          const c=canon(path);
          const { [c]: _drop, ...rest } = m;
          return rest;
        });
        setOpenPaths((arr) => arr.filter((p) => p !== canon(path)));
        setActivePath((p) => (p === canon(path) ? "/template.json" : p));
        setEntryPath((p) => (p === canon(path) ? "/template.json" : p));
        setDirty((d) => {
          const c=canon(path);
          const { [c]: _drop, ...rest } = d || {};
          return rest;
        });
        setSavedSig((s) => {
          const c=canon(path);
          const { [c]: _drop, ...rest } = s || {};
          return rest;
        });
      },
      // Add multiple files with metadata (content, readonly, dir)
      addFiles: async (fileList = []) => {
        if (!Array.isArray(fileList) || fileList.length === 0) return;
        setFiles((m) => {
          const next = { ...m };
          fileList.forEach((f) => {
            if (!f || !f.path) return;
            const c=canon(f.path);
            next[c] = { content: f.content || "", readonly: !!f.readonly, dir: !!f.dir };
          });
          return next;
        });
        setDirty((d) => {
          const next = { ...(d || {}) };
          fileList.forEach((f) => { if (f && f.path) next[f.path] = true; });
          return next;
        });
      },
      // Add a single file (path, content, opts: { readonly, dir })
      addFile: async (path, content = "", opts = {}) => {
        if (!path) return;
        const c=canon(path);
        setFiles((m) => ({ ...m, [c]: { content: String(content || ""), readonly: !!opts.readonly, dir: !!opts.dir } }));
        setDirty((d) => ({ ...(d || {}), [c]: true }));
      },
      // Backwards compatible alias for batch import
      importFiles: async (fileList = []) => {
        if (!Array.isArray(fileList) || fileList.length === 0) return;
        setFiles((m) => {
          const next = { ...m };
          fileList.forEach((f) => {
            if (!f || !f.path) return;
            const c=canon(f.path);
            next[c] = { content: f.content || "", readonly: !!f.readonly, dir: !!f.dir };
          });
          return next;
        });
        setDirty((d) => {
          const next = { ...(d || {}) };
          fileList.forEach((f) => { if (f && f.path) next[canon(f.path)] = true; });
          return next;
        });
      },
    };
  }, [files, root, activePath, openPaths, entryPath, savedSig]);

  // NOTE: removed external "workspace:add-files" event listener to avoid hidden injection flows.

  // Simple stable hash (djb2) for content
  function stableHash(str){
    try {
      let h = 5381; for (let i=0;i<str.length;i++){ h = ((h<<5)+h) + str.charCodeAt(i); }
      return 'h'+(h>>>0).toString(16);
    } catch { return 'h0'; }
  }

  // Unified content signature (supports compressed entries)
  function contentSignature(meta){
    try {
      if (!meta) return 'h0';
      if (meta.compressed && meta.data && typeof meta.rawLen === 'number') {
        // combine lengths + first/last chars for stability without full decompression
        const d = String(meta.data||'');
        const sample = d.slice(0,16)+d.slice(-16);
        return stableHash(sample + '|' + meta.rawLen + '|' + meta.compLen);
      }
      if (meta.meta && (meta.meta.algo || meta.meta.data)) {
        const d = String(meta.meta.data||'');
        const sample = d.slice(0,16)+d.slice(-16);
        return stableHash(sample + '|' + meta.meta.algo + '|' + meta.meta.rawLen);
      }
      if (typeof meta.content === 'string') return stableHash(meta.content);
      return 'h0';
    } catch { return 'h0'; }
  }

  // Expose a debug inspector on window when debug mode enabled so E2E tests can drive the workspace.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WORKSPACE_DEBUG === '1') {
        try { window.__WORKSPACE_INSPECTOR__ = { ns, api }; } catch {}
      }
    } catch {}
  }, [ns, api]);

  return (
    <WorkspaceCtx.Provider value={api}>
      {children}
      {typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WORKSPACE_DEBUG === '1' ? (
        // Lazy load badge to avoid adding runtime deps into non-debug flows
        (() => {
          const Badge = require('./WorkspaceDebugBadge.jsx').default;
          return <Badge />;
        })()
      ) : null}
    </WorkspaceCtx.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace must be used within CodeWorkspaceProvider");
  return ctx;
}
