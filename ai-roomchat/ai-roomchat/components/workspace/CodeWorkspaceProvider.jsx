"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { compressString, decompressToString } from "../../utils/compress.js";
import { injectFilesWithFallback } from "../../lib/workspace/injectFilesFallback.js";
// snapshot/local cache disabled in server-first mode

const BASE_KEY = "workspace.vfs.v1";

  const defaultFiles = {
    "/assets/": { dir: true, readonly: true },
    "/game/": { dir: true, readonly: true },
    "/game/state/": { dir: true, readonly: true },
    "/game/input/": { dir: true, readonly: true },
    "/game/maps/": { dir: true, readonly: true },
    "/game/pages/": { dir: true, readonly: true },
    "/game/pages/ui/": { dir: true, readonly: true },
    "/game/pages/scripts/": { dir: true, readonly: true },
    "/game/hooks/": { dir: true, readonly: true },
    "/docs/": { dir: true, readonly: true },
    "/docs/contracts/": { dir: true, readonly: true },
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
    "/game/state/variables.json": {
      content: JSON.stringify({
        player: { hp: 100, mp: 30 },
        flags: { tutorialDone: false },
        env: { difficulty: "normal" }
      }, null, 2)+"\n",
      readonly: false,
    },
    "/game/input/actions.json": {
      content: JSON.stringify({
        version: 1,
        actions: {
          jump: { keys: ["Space"], gamepad: [0] },
          attack: { keys: ["KeyJ"], gamepad: [1] },
          dash: { keys: ["ShiftLeft"], gamepad: [2] }
        },
        axes: {
          moveX: { keysNegative: ["ArrowLeft", "KeyA"], keysPositive: ["ArrowRight", "KeyD"], gamepadAxis: 0, deadzone: 0.2 },
          moveY: { keysNegative: ["ArrowUp", "KeyW"], keysPositive: ["ArrowDown", "KeyS"], gamepadAxis: 1, deadzone: 0.2 }
        }
      }, null, 2)+"\n",
      readonly: false,
    },
    "/game/maps/grid.sample.json": {
      content: JSON.stringify({
        type: "grid",
        width: 10,
        height: 8,
        tiles: [
          // 0=walkable, 1=blocked (rows)
          [0,0,0,0,0,0,0,0,0,0],
          [0,1,1,0,0,0,1,1,1,0],
          [0,0,0,0,1,0,0,0,1,0],
          [0,0,1,0,0,0,0,0,0,0],
          [0,0,0,0,0,1,0,0,0,0],
          [0,0,0,1,0,0,0,1,0,0],
          [0,0,0,0,0,0,0,0,0,0],
          [0,0,0,0,0,0,0,0,0,0]
        ]
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
    "/docs/USAGE.md": {
      content: [
        "# 작업공간 개요",
        "- 좌측 파일트리에서 /game, /graph, /docs 등을 확인할 수 있습니다.",
        "- /assets 폴더에 이미지/오디오 등 정적 자산을 둘 수 있습니다.",
        "- /game/state/variables.json 은 게임 변수의 스냅샷입니다(훅에서 updateVariables).",
        "- /docs/contracts 아래에 사용 가능한 계약(기능)과 예제를 정리합니다.",
      ].join("\n")+"\n",
      readonly: true,
    },
    "/docs/contracts/README.md": {
      content: [
        "# 계약(캡어빌리티) 가이드",
        "- hooks: onTurnStart, onUserAction, transformPrompt, selectNext",
        "- adapters: 렌더러, 입력, 네트워킹, 동기화 등을 동적으로 선택",
        "- UI Schema: /game/pages/** 를 통해 간단한 UI를 구성",
        "\n## 훅 컨텍스트",
        "- ctx.variables, ctx.updateVariables(patchOrFn)",
        "- ctx.files, ctx.config, ctx.node",
      ].join("\n")+"\n",
      readonly: true,
    },
    "/docs/contracts/runtime.md": {
      content: [
        "# 런타임 계약",
        "- onTurnStart(ctx): 턴 시작 시 1회 호출",
        "- onUserAction(ctx, input): 사용자 입력으로 다음 노드 결정/변수 갱신",
        "- transformPrompt(ctx): 프롬프트 문자열 또는 { prompt, ui } 반환",
        "- selectNext(ctx, neighbors): 다음 노드 id 선택",
      ].join("\n")+"\n",
      readonly: true,
    },
    "/docs/contracts/ui.md": {
      content: [
        "# UI 스키마",
        "- 지원 타입: vstack, hstack, text, button, image, spacer, card, number, table",
        "- number: { type:'number', label?, value, step?, min?, max?, event? }",
        "- table: { type:'table', columns:[{key,label}], data:[{...}], event? }",
      ].join("\n")+"\n",
      readonly: true,
    },
    "/docs/contracts/capabilities.md": {
      content: [
        "# 캡어빌리티(기능) 목록",
        "장르를 명시하지 않고 조합 가능한 기능 단위로 제공합니다.",
        "\n- 렌더러(Rendering): Canvas2D 기본, 선택적으로 Pixi/Three",
        "- 입력(Input): 액션/축 바인딩, 키/패드/터치",
        "- 물리/충돌(Physics): AABB 충돌, 타일 충돌",
        "- 타일맵(Tilemap): Tiled JSON/그리드 로드",
        "- 경로탐색(Pathfinding): 그리드 기반 findPath",
        "- 네트워크(Network): socket.io/colyseus 룸",
        "- 동기화(Sync): Yjs 문서 공유",
        "- 상태/스냅샷(State): variables.json & 이벤트 리플레이",
        "- UI 스키마(UI): vstack/hstack/…/number/table",
      ].join("\n")+"\n",
      readonly: true,
    },
    "/docs/contracts/input.md": {
      content: [
        "# 입력 계약",
        "- /game/input/actions.json 형식으로 액션/축을 정의합니다.",
        "- 예) { actions:{ jump:{keys:[\"Space\"], gamepad:[0]} }, axes:{ moveX:{keysNegative:[\"ArrowLeft\"], keysPositive:[\"ArrowRight\"], gamepadAxis:0, deadzone:0.2} } }",
        "- 런타임에서 onAction(name, handler), onAxis(name, handler) 사용(키/패드 지원)",
        "- touch는 후속 확장으로 제스처→액션 바인딩 예정",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/physics.md": {
      content: [
        "# 물리/충돌 계약",
        "- addCollider(entityId, { x,y,w,h })",
        "- removeCollider(entityId)",
        "- queryOverlap({ x,y,w,h }) → [entityId…]",
        "- 타일 충돌: setCollisionGrid(grid) (0=통과, 1=충돌)",
        "- slideBoxOnGrid(box, dx, dy): 그리드(1유닛=1타일) 기준 간단 슬라이딩",
        "- setCellSize(px): broad-phase 버킷 크기(px) 조절",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/tilemap.md": {
      content: [
        "# 타일맵 계약",
        "- loadTilemap(json) → 내부 레이어 등록",
        "- getGrid(): 그리드형 또는 Tiled JSON의 충돌 레이어를 0/1로 반환",
        "- Tiled: 레이어 properties에 { name:'collision', value:true }인 타일 레이어를 자동 탐색",
        "- findLayerByProp(name,value), getLayer(name), getTileAt(layer|grid,x,y)",
        "- extractObjectColliders(): collision=true인 objectgroup(사각형)에서 AABB 목록 산출",
        "- 샘플: /game/maps/grid.sample.json",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/pathfinding.md": {
      content: [
        "# 경로탐색 계약",
        "- setGrid(grid) // 0=통과,1=차단",
        "- findPath({ sx,sy, tx,ty }) → [{x,y}…]",
        "- 고급: ctx.loadAdapter('pathfinding:easystar', { costMode:true, blockValue:255, baseCost:1 })",
        "- 타일맵에서 getCostGrid() 이용 시: setGrid(costGrid) + setOptions({ costMode:true })",
        "- 옵션: 대각선 허용, 가중치",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/rendering.md": {
      content: [
        "# 렌더링 계약",
        "- 기본 Canvas2D 어댑터(renderer2d): attach(canvas), addRect, setText, addImage, addSpriteFrame, addSpriteAnim, play/pause, update, remove, clear, clearCache, unload, destroy",
        "- 고급: Pixi/Three는 동적 import로 선택",
        "- PIXI 예시: const pixi = await ctx.loadAdapter('renderer:pixi'); pixi.attach(canvas); pixi.addSprite({ texture:'/assets/player.png', x:100, y:100 });",
        "\n## UI 스키마에서 캔버스 노드",
        "- { type:'canvas', id:'gameCanvas', width, height, eventMount:'canvasReady' }",
        "- 마운트 시 onEvent('canvasReady', { id, canvas }) 호출",
        "\n## 스크립트 예시(canvasDemo.js)",
        "- handlers.canvasReady(payload){ const r = ctx.adaptersRef?.current?.renderer2d; r.attach(payload.canvas); r.addRect(...); r.addImage({ src:'/assets/hero.png', x:10, y:10 }); }",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/networking.md": {
      content: [
        "# 네트워크 계약",
        "- connect(roomId), publish(event,payload), on(event,cb)",
        "- socket.io: ctx.loadAdapter('net:socketio', { url, room }) 로드 후 사용",
        "- 자동 재연결/버퍼링: 연결 중단 시 publish는 큐에 저장되며 재연결 후 전송",
        "- ex) const net = await ctx.loadAdapter('net:socketio', { url:'/socket', room:'r1' }); net.on('evt', cb); net.publish('evt', data);",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/sync.md": {
      content: [
        "# 동기화 계약",
        "- joinDoc(docId), getSharedState(), applyPatch(p)",
        "- Yjs 기반 CRDT 문서 공유 (동적 import)",
      ].join('\n')+"\n",
      readonly: true,
    },
    "/docs/contracts/state.md": {
      content: [
        "# 상태/스냅샷",
        "- variables.json: 훅 컨텍스트의 게임 상태 스냅샷",
        "- updateVariables로 갱신되며 파일에도 반영",
        "- 이벤트 로그 export/import로 리플레이 가능",
      ].join('\n')+"\n",
      readonly: true,
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
      canvasDemo: { title: "Canvas2D Demo", type: "script", path: "/game/pages/scripts/canvasDemo.js" },
      pathDemo: { title: "Pathfinding Demo", type: "script", path: "/game/pages/scripts/pathDemo.js" },
      physicsDemo: { title: "Physics Demo", type: "script", path: "/game/pages/scripts/physicsDemo.js" },
      netDemo: { title: "Net Demo", type: "script", path: "/game/pages/scripts/netDemo.js" },
      httpNet: { title: "HTTP Net Demo", type: "script", path: "/game/pages/scripts/httpNetDemo.js" },
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
    "/game/pages/scripts/canvasDemo.js": {
      content: [
        "export function render(ctx){",
        "  const schema = {",
        "    type:'vstack', gap:8, children:[",
        "      { type:'text', value:'🖼 Canvas2D Demo', fontSize:16, bold:true },",
        "      { type:'canvas', id:'gameCanvas', width:320, height:200, eventMount:'canvasReady' },",
        "      { type:'button', label:'사각형 추가', event:'addRect' }",
        "    ]",
        "  };",
        "  const handlers = {",
        "    canvasReady({ canvas }){",
        "      const r = ctx.adaptersRef?.current?.renderer2d; if (!r) return; r.attach(canvas);",
        "      r.addRect({ id:'box', x:20, y:20, w:40, h:30, color:'#38bdf8' });",
        "      r.setText({ id:'label', x:10, y:18, text:'Hello', color:'#e2e8f0' });",
        "    },",
        "    addRect(){ const r = ctx.adaptersRef?.current?.renderer2d; if (!r) return; const id='r_'+Math.random().toString(36).slice(2); r.addRect({ id, x: 10+Math.random()*260, y: 10+Math.random()*160, w: 20+Math.random()*40, h: 10+Math.random()*30, color:'#fbbf24' }); }",
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
  "/game/pages/scripts/pathDemo.js": {
    content: [
      "export function render(ctx){",
      "  let grid = null; let pf = null; let r2d = null;",
      "  function readGrid(){",
      "    try { const raw = ctx.files?.['/game/maps/grid.sample.json']?.content; if (raw) { const obj = JSON.parse(raw||'{}'); grid = Array.isArray(obj.tiles)? obj.tiles : null; } } catch {}",
      "  }",
      "  function ensurePf(){",
      "    if (pf && grid) return Promise.resolve(pf);",
      "    readGrid();",
      "    const base = ctx.adaptersRef?.current?.pathfinding; if (base) { try { base.setGrid(grid); pf = base; return Promise.resolve(pf); } catch {} }",
      "    return (ctx.loadAdapter ? ctx.loadAdapter('pathfinding:easystar') : Promise.resolve(null)).then(inst => { if (inst && grid) inst.setGrid(grid); pf = inst; return pf; });",
      "  }",
      "  function drawGrid(){",
      "    if (!r2d || !grid) return; r2d.clear();",
      "    const h = grid.length, w = grid[0]?.length || 0;",
      "    const cw = Math.floor(300/Math.max(1,w)); const ch = Math.floor(180/Math.max(1,h));",
      "    for (let y=0;y<h;y++){ for (let x=0;x<w;x++){ const b = grid[y][x]===1; r2d.addRect({ id:'c_'+x+'_'+y, x:x*cw, y:y*ch, w:cw-1, h:ch-1, color: b?'#1f2937':'#0ea5e9' }); } }",
      "    r2d.setText({ id:'lbl', x:6, y:14, text:'Click 찾아보기: 좌상(0,0) → 우하(w-1,h-1)', color:'#e2e8f0' });",
      "  }",
      "  const schema = {",
      "    type:'vstack', gap:8, children:[",
      "      { type:'text', value:'🧭 Pathfinding Demo', fontSize:16, bold:true },",
      "      { type:'hstack', gap:8, children:[",
      "        { type:'number', id:'sx', label:'sx', value:0, min:0, event:'set' },",
      "        { type:'number', id:'sy', label:'sy', value:0, min:0, event:'set' },",
      "        { type:'number', id:'tx', label:'tx', value:9, min:0, event:'set' },",
      "        { type:'number', id:'ty', label:'ty', value:7, min:0, event:'set' },",
      "        { type:'button', label:'경로 찾기', event:'find' }",
      "      ]},",
      "      { type:'canvas', id:'gridCanvas', width:300, height:180, eventMount:'canvasReady' }",
      "    ]",
      "  };",
      "  const vals = { sx:0, sy:0, tx:9, ty:7 };",
      "  const handlers = {",
      "    canvasReady({ canvas }){ r2d = ctx.adaptersRef?.current?.renderer2d; if (!r2d) return; r2d.attach(canvas); readGrid(); drawGrid(); },",
      "    set({ id, value }){ vals[id] = value|0; },",
      "    async find(){",
      "      const inst = await ensurePf(); if (!inst || !grid) return; const path = await inst.findPath({ sx:vals.sx, sy:vals.sy, tx:vals.tx, ty:vals.ty });",
      "      if (!r2d) return; drawGrid();",
      "      const cw = Math.floor(300/Math.max(1,grid[0]?.length||0)); const ch = Math.floor(180/Math.max(1,grid.length||0));",
      "      path.forEach((p,i)=>{ r2d.addRect({ id:'p_'+i, x:p.x*cw+2, y:p.y*ch+2, w:Math.max(2,cw-4), h:Math.max(2,ch-4), color:'#fbbf24' }); });",
      "    }",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
    readonly: false,
  },
  "/game/pages/scripts/physicsDemo.js": {
    content: [
      "export function render(ctx){",
      "  let r2d = null; let phys = null; let grid = null;",
      "  function readGrid(){ try { const raw = ctx.files?.['/game/maps/grid.sample.json']?.content; if (raw) { const obj = JSON.parse(raw||'{}'); grid = Array.isArray(obj.tiles)? obj.tiles : null; } } catch {} }",
      "  function ensure(){ if (!phys) phys = ctx.adaptersRef?.current?.physics; if (phys && grid) phys.setCollisionGrid(grid); }",
      "  const box = { x:1, y:1, w:0.9, h:0.9 };",
      "  const schema = { type:'vstack', gap:8, children:[",
      "    { type:'text', value:'🧱 Physics Demo (grid slide)', fontSize:16, bold:true },",
      "    { type:'canvas', id:'pCanvas', width:300, height:180, eventMount:'canvasReady' },",
      "  ]};",
      "  function draw(){ if (!r2d || !grid) return; r2d.clear(); const h=grid.length, w=grid[0]?.length||0; const cw=Math.floor(300/Math.max(1,w)); const ch=Math.floor(180/Math.max(1,h));",
      "    for (let y=0;y<h;y++){ for (let x=0;x<w;x++){ const b=grid[y][x]===1; r2d.addRect({ id:'g_'+x+'_'+y, x:x*cw, y:y*ch, w:cw-1, h:ch-1, color:b?'#1f2937':'#0ea5e9' }); } }",
      "    r2d.addRect({ id:'player', x:box.x*cw, y:box.y*ch, w:Math.max(2,box.w*cw), h:Math.max(2,box.h*ch), color:'#22c55e' });",
      "  }",
      "  let offAxisX = null, offAxisY = null; const speed=0.05;",
      "  const handlers = {",
      "    canvasReady({ canvas }){ r2d = ctx.adaptersRef?.current?.renderer2d; if (!r2d) return; r2d.attach(canvas); readGrid(); ensure(); draw();",
      "      const input = ctx.adaptersRef?.current?.input; if (input){",
      "        offAxisX = input.onAxis('moveX', (v)=>{ const nx = (phys?.slideBoxOnGrid ? phys.slideBoxOnGrid(box, v*speed, 0) : { ...box, x: box.x + v*speed }); Object.assign(box, nx); draw(); });",
      "        offAxisY = input.onAxis('moveY', (v)=>{ const ny = (phys?.slideBoxOnGrid ? phys.slideBoxOnGrid(box, 0, v*speed) : { ...box, y: box.y + v*speed }); Object.assign(box, ny); draw(); });",
      "      }",
      "    },",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
    readonly: false,
  },
  "/game/pages/scripts/netDemo.js": {
    content: [
      "export function render(ctx){",
      "  let net = null; const logs=[]; function log(s){ logs.push(s); if (logs.length>6) logs.shift(); }",
      "  const schema = { type:'vstack', gap:8, children:[",
      "    { type:'text', value:'🔌 Socket.IO Demo', fontSize:16, bold:true },",
      "    { type:'hstack', gap:8, children:[",
      "      { type:'button', label:'Connect', event:'connect' },",
      "      { type:'button', label:'Send evt', event:'send' }",
      "    ]},",
      "    { type:'text', id:'logs', value:'', fontSize:13 }",
      "  ]};",
      "  const handlers = {",
      "    async connect(){ if (!ctx.loadAdapter) return; net = await ctx.loadAdapter('net:socketio', { url: (typeof location!=='undefined'? location.origin: ''), room: 'demo' }); if (!net) return; log('connected?'); net.on('connect', ()=>log('connected')); net.on('evt', (p)=>log('evt:'+JSON.stringify(p))); },",
      "    send(){ if (!net) return; net.publish('evt', { t: Date.now(), text:'hello' }); },",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
    readonly: false,
  },
  "/game/pages/scripts/httpNetDemo.js": {
    content: [
      "export function render(ctx){",
      "  let rid = null; let lastSeq = -1; let timer = null; const logs=[]; function log(s){ logs.push(s); if (logs.length>6) logs.shift(); }",
      "  const schema = { type:'vstack', gap:8, children:[",
      "    { type:'text', value:'🌐 HTTP Rooms Demo', fontSize:16, bold:true },",
      "    { type:'hstack', gap:8, children:[",
      "      { type:'button', label:'Create', event:'create' },",
      "      { type:'button', label:'Join', event:'join' },",
      "      { type:'button', label:'Send move', event:'send' }",
      "    ]},",
      "    { type:'text', id:'logs', value:'', fontSize:13 }",
      "  ]};",
      "  async function api(p, init){ const r = await fetch(p, { method: init?.method||'GET', headers: { 'content-type':'application/json' }, body: init?.body? JSON.stringify(init.body): undefined }); const j = await r.json(); return j; }",
      "  async function poll(){ if (!rid) return; try { const snap = await api(`/api/rooms/${'${'}rid}`); if (snap.seq !== lastSeq){ lastSeq = snap.seq; log('seq '+lastSeq); } } catch {} }",
      "  const handlers = {",
      "    async create(){ const j = await api('/api/rooms', { method:'POST', body: { id: 'demo' } }); rid = j.id; log('room '+rid); if (timer) clearInterval(timer); timer=setInterval(poll, 1000); },",
      "    async join(){ if (!rid) rid = 'demo'; const j = await api(`/api/rooms/${'${'}rid}/join`, { method:'POST', body: { user: { id:'me' } } }); log('join '+j.userId); if (timer) clearInterval(timer); timer=setInterval(poll, 1000); },",
      "    async send(){ if (!rid) return; await api(`/api/rooms/${'${'}rid}/event`, { method:'POST', body: { type:'move', payload:{ id:'obj', dx:1, dy:0 } } }); },",
      "  };",
      "  return { schema, handlers };",
      "}",
    ].join('\n')+"\n",
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
