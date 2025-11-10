"use client";

import { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
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
  "/docs/README.md": {
    content: [
      "# Workspace Guides",
      "",
      "이 폴더는 제작자가 바로 참고할 수 있는 가이드 묶음입니다.",
      "- capabilities/ — 기능 단위 계약(파일/훅/어댑터) 요약",
      "- runtime/ — 런타임 훅/흐름/설정 가이드",
      "",
      "API",
      "- 기능 계약 목록: GET /api/runtime/capability-contracts",
      "- 루트 레퍼런스 탐색: GET /api/refroot/...",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/OVERVIEW.md": {
    content: [
      "# Capability Contracts Overview",
      "",
      "장르가 아닌 기능 단위로 엔진을 조립합니다. 각 항목은 필요한 파일/훅/어댑터를 정의합니다.",
      "- core.graph — /graph/prompt-graph.json",
      "- core.hooks — /game/hooks/automation.js (transformPrompt, onUserAction, selectNext)",
      "- core.runtimeConfig — /game/runtime.config.json",
      "- ui.text — 텍스트 UI(훅 반환 문자열 렌더)",
      "- ui.canvas2d — 캔버스 렌더러(어댑터)",
      "- input.keyboard — 키 입력을 액션으로 매핑",
      "- grid.tilemap, ai.pathfinding, physics.basic, network.socketio, crdt.yjs, worker.offthread 등",
      "",
      "참고: /api/runtime/capability-contracts, /api/refroot/...",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/runtime/HooksQuickstart.md": {
    content: [
      "# Hooks Quickstart",
      "",
      "파일: /game/hooks/automation.js",
      "",
      "export function transformPrompt(ctx) {",
      "  const label = String(ctx?.node?.label || '');",
      "  return label; // 또는 { prompt, ui }",
      "}",
      "",
      "export function onUserAction(ctx, input) {",
      "  // 입력을 보고 다음 노드 id 또는 { next } 반환",
      "}",
      "",
      "export function selectNext(ctx, neighbors) {",
      "  return neighbors?.[0]?.id ?? null;",
      "}",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/core.graph.md": {
    content: [
      "# core.graph",
      "필수 파일: /graph/prompt-graph.json",
      "노드/엣지 예시:",
      "{",
      "  \"nodes\": [ { \"id\": \"start\", \"type\": \"ai\", \"label\": \"Intro\" } ],",
      "  \"edges\": [ { \"source\": \"start\", \"target\": \"end\", \"label\": \"next\" } ]",
      "}",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/core.hooks.md": {
    content: [
      "# core.hooks",
      "필수 파일: /game/hooks/automation.js",
      "함수: transformPrompt, onUserAction, selectNext",
      "실행은 샌드박스/타임아웃 가드 하에 이루어집니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/core.runtimeConfig.md": {
    content: [
      "# core.runtimeConfig",
      "파일: /game/runtime.config.json",
      "예시:",
      "{",
      "  \"version\": 1, \"entryNode\": \"start\", \"roles\": [\"players\"], \"durations\": [30,60,90]",
      "}",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/ui.text.md": {
    content: [
      "# ui.text",
      "transformPrompt가 문자열을 반환하면 텍스트 UI로 렌더됩니다.",
      "선택지는 노드/엣지 라벨 또는 onUserAction 처리로 표현합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/ui.canvas2d.md": {
    content: [
      "# ui.canvas2d",
      "렌더러 어댑터: lib/runtime/adapters/rendererCanvas2D.js 의 attachCanvas2D",
      "hooks 예시: transformPrompt가 { prompt, ui } 형태로 상태를 반환하고, 렌더러가 상태를 그립니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/input.keyboard.md": {
    content: [
      "# input.keyboard",
      "어댑터: lib/runtime/adapters/inputKeyboard.js 의 attachKeyboard",
      "키 → 액션 매핑으로 onUserAction에 전달합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/input.gamepad.md": {
    content: [
      "# input.gamepad",
      "어댑터: lib/runtime/adapters/inputGamepad.js 의 attachGamepad",
      "스틱/버튼을 액션(move_*, confirm)으로 매핑하여 onUserAction으로 전달합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/ui.webgl3d.md": {
    content: [
      "# ui.webgl3d",
      "렌더러 어댑터: lib/runtime/adapters/rendererWebGL.js 의 attachWebGL",
      "주의: three 의존성은 프로젝트에서 제공되어야 합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/network.socketio.md": {
    content: [
      "# network.socketio",
      "어댑터: lib/runtime/adapters/netSocketIO.js 의 connectSocketIO",
      "주의: socket.io-client 의존성 필요.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/network.colyseus.md": {
    content: [
      "# network.colyseus",
      "어댑터: lib/runtime/adapters/netColyseus.js 의 connectColyseus",
      "주의: colyseus.js 의존성 필요.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/crdt.yjs.md": {
    content: [
      "# crdt.yjs",
      "어댑터: lib/runtime/adapters/syncYjs.js",
      "주의: yjs 의존성 필요.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/grid.tilemap.md": {
    content: [
      "# grid.tilemap",
      "격자/타일맵 이동/검증 등을 훅(onUserAction/selectNext)에서 처리합니다.",
      "경로탐색과 함께 사용 권장.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/ai.pathfinding.md": {
    content: [
      "# ai.pathfinding",
      "어댑터: lib/runtime/adapters/pathfindingEasystar.js 의 createPathfinder",
      "주의: easystarjs 의존성 필요.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/physics.basic.md": {
    content: [
      "# physics.basic",
      "렌더러와 통합된 충돌/중력 처리(Phaser 등)가 필요합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/worker.offthread.md": {
    content: [
      "# worker.offthread",
      "어댑터: lib/runtime/adapters/workerRpc.js 의 createWorkerRpc",
      "워커에서 메서드 호출을 메시지 기반으로 수행합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/timing.turns.md": {
    content: [
      "# timing.turns",
      "어댑터: lib/runtime/adapters/timingTurns.js 의 createTurnTimer",
      "턴 타이머/자동 전이를 관리합니다.",
    ].join("\n")+"\n",
    readonly: true,
  },
  "/docs/capabilities/storage.snapshot.md": {
    content: [
      "# storage.snapshot",
      "어댑터: lib/runtime/adapters/storageSnapshot.js 의 createSnapshotStore",
      "세트별 변수/히스토리 스냅샷 저장/복구.",
    ].join("\n")+"\n",
    readonly: true,
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

import { saveSet } from "../../lib/workspace/saveSet.js";

export function CodeWorkspaceProvider({ children, storageNamespace, initialFiles, initialEtag = null }) {
  // Per-instance storage namespace (set id); use explicit storageNamespace or server-provided patch scope.
  let ns = (typeof window !== 'undefined' ? (storageNamespace || (window.__VFS_SCOPED_PATCH__ && window.__VFS_SCOPED_PATCH__.scope)) : null) || null;
  const nsKey = (k) => (ns ? `${k}@${ns}` : k);
  const KEY = nsKey(BASE_KEY);
  const isDev = process.env.NODE_ENV !== 'production';
  // Require an explicit storageNamespace prop to avoid accidental cross-set bleed.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!storageNamespace) {
        throw new Error('[Workspace] Missing storageNamespace prop. Provide storageNamespace to avoid cross-set state bleed.');
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
      // initialFiles missing → configuration error in all environments
      throw new Error('[Workspace] initialFiles is required (server-first).');
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

  const serverEtagRef = useRef(initialEtag || null);
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
      // Save a single file locally then push full set to server
      saveFileAndPush: async (setId, path) => {
        try {
          const meta = files[path];
          const sig = contentSignature(meta);
          setSavedSig((m) => ({ ...m, [path]: sig }));
          setDirty((m) => ({ ...m, [path]: false }));
          const id = String(setId || storageNamespace || "").trim();
          if (!id) return { ok: false, error: 'missing_set_id' };
          const et = await saveSet(id, files, serverEtagRef.current);
          if (et) serverEtagRef.current = et;
          return { ok: true };
        } catch (e) { return { ok: false, error: e?.message || 'save_failed' }; }
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
      // Save all locally then push full set to server
      saveAllAndPush: async (setId) => {
        try {
          // local save-all
          const nextSigs = {};
          Object.entries(files).forEach(([p, meta]) => { nextSigs[p] = contentSignature(meta); });
          setSavedSig((m) => ({ ...m, ...nextSigs }));
          setDirty({});
          const id = String(setId || storageNamespace || "").trim();
          if (!id) return { ok: false, error: 'missing_set_id' };
          const et = await saveSet(id, files, serverEtagRef.current);
          if (et) serverEtagRef.current = et;
          return { ok: true };
        } catch (e) { return { ok: false, error: e?.message || 'save_failed' }; }
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
      close: (path) => {
        const c = canon(path);
        const isDirty = !!dirty[c];
        if (isDirty) {
          try {
            const yn = window.confirm('변경사항을 저장하고 닫을까요? (취소하면 닫지 않습니다)');
            if (yn) {
              // best-effort save + push
              const id = storageNamespace || '';
              const meta = files[c];
              const sig = contentSignature(meta);
              setSavedSig((m) => ({ ...m, [c]: sig }));
              setDirty((m) => ({ ...m, [c]: false }));
              if (id) saveSet(id, files, serverEtagRef.current).then((et) => { if (et) serverEtagRef.current = et; }).catch(()=>{});
            } else {
              // user chose not to save; proceed closing but keep unsaved changes in memory
            }
          } catch {}
        }
        setOpenPaths((arr) => arr.filter((p) => p !== c));
      },
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

  // Warn on navigating away with dirty changes
  useEffect(() => {
    const beforeUnload = (e) => {
      try {
        const anyDirty = Object.values(dirty || {}).some(Boolean);
        if (anyDirty) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      } catch {}
      return undefined;
    };
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload);
    return () => { try { if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload); } catch {} };
  }, [dirty]);

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
