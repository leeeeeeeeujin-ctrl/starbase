"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useIsMobile from '@/utils/useIsMobile';
import { useWorkspace } from '../workspace/CodeWorkspaceProvider.jsx';
import DynamicSlot from './slots/DynamicSlot.jsx';
import { attachCanvas2D } from '../../lib/runtime/adapters/rendererCanvas2D.js';
import {
  buildInitialGridState,
  movePlayerOnGrid,
} from '../../lib/runtime/adapters/worldGridEngine.js';
import { useBattleLogDebug } from '../workspace/hooks/useBattleLogDebug.js';
import { applyShellStyleProps } from './uiShellStyle.js';

// Shared style tokens
const btn = { padding:'6px 10px', border:'1px solid #334155', background:'#1e293b', color:'#e2e8f0', borderRadius:8 };
const btnGhost = { padding:'6px 10px', border:'1px solid rgba(148,163,184,0.35)', background:'transparent', color:'#e2e8f0', borderRadius:8 };
const btnPrimary = { padding:'8px 14px', border:'1px solid #2563eb', background:'#1d4ed8', color:'#fff', borderRadius:10, fontWeight:700 };
const input = { flex:1, minWidth:0, padding:'8px 10px', background:'#0f172a', color:'#e2e8f0', border:'1px solid #334155', borderRadius:8, outline:'none' };
const ctl = { padding:'4px 8px', border:'1px solid #334155', background:'#0f172a', color:'#cbd5e1', borderRadius:6 };

function isLogEntryVisible(entry){
  if (!entry || typeof entry !== 'object') return true;

  if (typeof entry.isVisible === 'boolean') {
    return entry.isVisible;
  }

  const raw = typeof entry.visibility === 'string' ? entry.visibility.trim().toLowerCase() : '';
  if (raw) {
    if (['hidden', 'private', 'invisible', 'internal'].includes(raw)) {
      return false;
    }
    if (['public', 'party', 'visible', 'shared'].includes(raw)) {
      return true;
    }
  }

  if (typeof entry.public === 'boolean') {
    return entry.public;
  }

  return true;
}

export default function MainGameMobileUI({
  template,
  user = null,
  mode = 'play', // 'play' | 'rank' 등
  onNext = () => {},
  runtimeFeed = null,
  runtimeSecondsLeft = null,
  onForceNext = null,
  onPlayerChat = null,
  runtimeBus = null,
  runtimeFeatures = [],
  rankContext = null,
  shellConfig = null,
  battleOutcome = null,
  consensus = null,
}) {
  const isMobile = useIsMobile(820); // currently unused but reserved for responsive adjustments
  const [layout, setLayout] = useState(() => loadLayout());
  const [gameChat, setGameChat] = useState(() => []);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');
  const { files } = useWorkspace();
  const uiConfig = useMemo(() => readUiConfig(template), [template]);

  // Derive turn progression policy (nextBar) from template and /game/runtime.config.json.
  const runtimeTurnTimer = useMemo(() => {
    try {
      const cfgText = files?.['/game/runtime.config.json']?.content || '';
      if (!cfgText) return null;
      const cfg = JSON.parse(cfgText || '{}');
      if (cfg && typeof cfg.turnTimer === 'object' && cfg.turnTimer !== null) {
        return cfg.turnTimer;
      }
    } catch {
      // ignore malformed runtime.config
    }
    return null;
  }, [files?.['/game/runtime.config.json']?.content]);

  const nextPolicy = useMemo(() => {
    const fromTemplate = uiConfig?.nextBar?.policy || null;
    const base = fromTemplate || runtimeTurnTimer || {};
    const timeoutSec =
      typeof base.timeoutSec === 'number' && Number.isFinite(base.timeoutSec)
        ? base.timeoutSec
        : null;
    const roleThreshold =
      typeof base.roleThreshold === 'number' && Number.isFinite(base.roleThreshold)
        ? base.roleThreshold
        : null;
    const requiredRoles = Array.isArray(base.requiredRoles) ? base.requiredRoles : undefined;
    return { timeoutSec, roleThreshold, requiredRoles };
  }, [uiConfig, runtimeTurnTimer]);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    typeof nextPolicy.timeoutSec === 'number' ? nextPolicy.timeoutSec : null
  );
  const [charViewIdx, setCharViewIdx] = useState(0);
  const [turnLogEvents, setTurnLogEvents] = useState([]);

  const character = useMemo(() => pickCharacter(template), [template]);
  const imageUrl = character?.image || pickFirstImage(template);
  const userLabel = useMemo(() => user?.name || '플레이어', [user]);

  const readySummary = useMemo(() => {
    if (!consensus || typeof consensus !== 'object') return null;
    const rawRequired = Number(consensus.required);
    const rawCount = Number(consensus.count);
    const required = Number.isFinite(rawRequired) && rawRequired > 0 ? Math.floor(rawRequired) : 0;
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;
    const safeCount = required > 0 ? Math.min(count, required) : count;
    const viewerHasConsented = Boolean(consensus.viewerHasConsented);
    if (!required && !safeCount && !viewerHasConsented) return null;
    return { required, count: safeCount, viewerHasConsented };
  }, [consensus]);

  // Persist layout edits driven by template/runtime (no manual edit UI)
  useEffect(() => {
    saveLayout(layout);
  }, [layout]);

  // Play 모드에서만 초기 "게임이 시작되었습니다." 시스템 메시지 출력
  useEffect(() => {
    if (mode !== 'play') return;
    setGameChat((prev) => {
      if (prev && prev.length > 0) return prev;
      return [{ role: 'system', text: '게임이 시작되었습니다.' }];
    });
  }, [mode]);
  // Optional runtime bus listeners (no-op when not provided)
  useEffect(() => {
    if (!runtimeBus || typeof runtimeBus.on !== 'function') return;
    const offLayout = runtimeBus.on('ui:setLayout', (order) => {
      try { if (Array.isArray(order)) setLayout(cur => ({ ...cur, order })); } catch {}
    });
    const offSystem = runtimeBus.on('system:message', (msg, meta) => {
      try { 
        if (msg != null) {
          const text = String(msg);
          const isFallback = meta?.fallback === true;
          const isDev = meta?.isDev === true;
          setGameChat(prev => [...prev, { 
            role: 'system', 
            text,
            fallback: isFallback,
            isDev,
            errorMessage: meta?.errorMessage
          }]);
        }
      } catch {}
    });
    return () => { try { offLayout?.(); offSystem?.(); } catch {} };
  }, [runtimeBus]);

  // Template-driven layout override (manual edit UI 제거)
  useEffect(() => {
    try {
      const tplLayout = template?.ui?.play?.layout?.order;
      if (Array.isArray(tplLayout) && tplLayout.every(x => typeof x === 'string')) {
        const allowed = ['header','gameChat','nextBar','playerChat','character','widgets'];
        const filtered = tplLayout.filter(id => allowed.includes(id));
        if (filtered.length) setLayout(cur => ({ ...cur, order: filtered }));
      }
    } catch {}
  }, [template]);

  const sendChat = useCallback(() => {
    const t = (chatText || '').trim();
    if (!t) return;
    if (typeof onPlayerChat === 'function') {
      try {
        onPlayerChat({ text: t });
      } catch {}
    } else {
      // 로컬 단일 플레이 모드용 기본 채팅 메시지
      setChat(prev => [
        ...prev,
        {
          role: 'me',
          text: t,
          at: Date.now(),
          fromName: userLabel,
          fromAvatar: imageUrl || null,
        },
      ]);
    }
    try {
      runtimeBus?.emit?.('player:chat', { text: t });
    } catch {}
    setChatText('');
  }, [chatText, onPlayerChat, runtimeBus, userLabel, imageUrl]);

  const retryLastTurn = useCallback(() => {
    // 마지막 AI 턴 재시도: turn:next 이벤트 재발행
    try { runtimeBus?.emit?.('turn:next'); } catch {}
  }, [runtimeBus]);

  const triggerNext = useCallback(() => {
    if (typeof onForceNext === 'function') {
      try { onForceNext(); } catch {}
    }
    // "다음 단계로 진행합니다." 메시지 제거: 실제 턴 내용은 useBuiltinRuntime에서 발행
    try { runtimeBus?.emit?.('turn:next'); } catch {}
    try { onNext?.(); } catch {}
    if (onForceNext == null && typeof nextPolicy.timeoutSec === 'number') setSecondsLeft(nextPolicy.timeoutSec);
  }, [onNext, onForceNext, nextPolicy?.timeoutSec, runtimeBus]);

  // Local countdown timer (skipped if external runtime controls)
  useEffect(() => {
    if (!(typeof nextPolicy.timeoutSec === 'number') || nextPolicy.timeoutSec <= 0) return;
    if (onForceNext != null) return;
    if (!(typeof secondsLeft === 'number')) return;
    if (secondsLeft <= 0) { triggerNext(); return; }
    const t = setTimeout(() => setSecondsLeft(s => (typeof s === 'number' ? s - 1 : s)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, nextPolicy?.timeoutSec, triggerNext, onForceNext]);

  const move = useCallback((id, dir) => {
    const order = [...layout.order];
    const idx = order.indexOf(id); if (idx < 0) return;
    const j = dir === 'up' ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
    if (j === idx) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    setLayout({ ...layout, order });
  }, [layout]);

  const hasWorldGridFeature = useMemo(
    () => Array.isArray(runtimeFeatures) && runtimeFeatures.some((f) => f && f.id === 'world.grid-basic'),
    [runtimeFeatures],
  );

  const gridInitial = useMemo(
    () => (hasWorldGridFeature ? buildInitialGridState(files) : null),
    [files, hasWorldGridFeature],
  );
  const [gridState, setGridState] = useState(() => gridInitial);

  useEffect(() => {
    setGridState(gridInitial);
  }, [gridInitial]);

  // Subscribe to world:grid:state events from the grid engine.
  useEffect(() => {
    if (!runtimeBus) return undefined;
    const handler = (payload) => {
      try {
        if (payload && payload.grid) {
          setGridState(payload.grid);
        }
      } catch {
        // ignore malformed payloads
      }
    };
    const off = runtimeBus.on?.('world:grid:state', handler);
    return () => {
      try {
        off && off();
      } catch {
        // ignore
      }
    };
  }, [runtimeBus]);

  // Subscribe to standardized turn log events so UI shell 위젯에서 사용할 수 있다.
  useEffect(() => {
    if (!runtimeBus || typeof runtimeBus.on !== 'function') return undefined;
    const off = runtimeBus.on('runtime:turn-log', (evt) => {
      try {
        if (!evt || typeof evt !== 'object') return;
        setTurnLogEvents(prev => {
          const next = [...prev, evt];
          // keep last 50 entries
          return next.slice(-50);
        });
      } catch {
        // ignore malformed events
      }
    });
    return () => {
      try {
        off && off();
      } catch {
        // ignore detach errors
      }
    };
  }, [runtimeBus]);

  // Debug: normalized battle log + highlights from turnLogEvents + rankContext.players
  const participantsMap = useMemo(() => {
    const map = {};
    const players = Array.isArray(rankContext?.players) ? rankContext.players : [];
    players.forEach((p) => {
      if (!p) return;
      const slotId = p.slotId || p.slot_id || p.ownerId || p.owner_id;
      if (!slotId) return;
      map[slotId] = {
        ownerId: p.ownerId || p.owner_id || null,
        name: p.displayName || p.display_name || p.heroName || p.hero_name || slotId,
        team: p.team || null,
        role: p.role || null,
        characterBio: p.hero?.bio || p.hero?.desc || null,
      };
    });
    return map;
  }, [rankContext]);

  const { log: debugLog, highlightEvents: debugHighlights } = useBattleLogDebug({
    events: turnLogEvents,
    participants: participantsMap,
    outcome: battleOutcome,
    scoreboard: null,
    meta: {},
  });

  // Broadcast normalized battle log to runtime bus so host/settle flow can consume automatically.
  useEffect(() => {
    try {
      if (runtimeBus?.emit && debugLog) {
        runtimeBus.emit('runtime:battle-log', debugLog);
      }
    } catch {
      // ignore broadcast errors
    }
  }, [runtimeBus, debugLog]);

  // Push battle log to host via fetch (optional) if API key present in shellConfig.
  useEffect(() => {
    const apiKey = shellConfig?.rankApiKey || null;
    const shouldPost = shellConfig?.autoSettle === true;
    if (!apiKey || !shouldPost) return;
    if (!debugLog || !debugLog.events || !debugLog.events.length) return;

    // 텍스트 배틀 세션 / 요약 정보가 있다면 settle payload에 함께 포함한다.
    const textSessionId =
      (rankContext && rankContext.session && rankContext.session.id) ||
      rankContext?.sessionId ||
      null;
    const textSummary =
      battleOutcome && typeof battleOutcome === 'object' && battleOutcome.finalizeSummary
        ? battleOutcome.finalizeSummary
        : null;

    const controller = new AbortController();
    const send = async () => {
      try {
        await fetch('/api/rank/settle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            sessionId:
              (rankContext && rankContext.session && rankContext.session.id) ||
              rankContext?.sessionId ||
              rankContext?.session_id ||
              'local-session',
            gameId:
              (rankContext && rankContext.game && rankContext.game.id) ||
              rankContext?.gameId ||
              rankContext?.game_id ||
              'local-game',
            battleLog: {
              ...debugLog,
              ...(textSessionId
                ? {
                    textBattleSessionId: textSessionId,
                  }
                : null),
              ...(textSummary
                ? {
                    textBattleSummary: textSummary,
                  }
                : null),
            },
            ...(textSessionId
              ? {
                  textBattleSessionId: textSessionId,
                }
              : null),
            ...(textSummary
              ? {
                  textBattleSummary: textSummary,
                }
              : null),
            userId: user?.id || user?.uid || null,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // ignore network errors in UI
      }
    };
    send();
    return () => controller.abort();
  }, [debugLog, shellConfig, rankContext, user, battleOutcome]);

  const modules = useMemo(() => {
    const panelsCfg =
      shellConfig && typeof shellConfig === 'object' && shellConfig.panels
        ? shellConfig.panels
        : {};
    const panelEnabled = (id, defaultOn) => {
      const panel = panelsCfg[id];
      if (!panel || typeof panel !== 'object') return defaultOn;
      if (panel.enabled === false) return false;
      if (panel.enabled === true) return true;
      return defaultOn;
    };

    // widgets 영역에 배치할 위젯 리스트 결정
    let playWidgets = [];
    const shellWidgetsCfg =
      panelsCfg.widgets && Array.isArray(panelsCfg.widgets.widgets)
        ? panelsCfg.widgets.widgets
        : null;
    if (shellWidgetsCfg && shellWidgetsCfg.length) {
      playWidgets = buildWidgetsFromShell(shellWidgetsCfg, {
        template,
        rankContext,
        gridState,
        turnLogEvents,
        battleLog: debugLog,
        highlightEvents: debugHighlights,
      });
    } else {
      const widgetFlags = readWidgetFlags(template);
      playWidgets = buildDefaultWidgets(
        template,
        widgetFlags,
        gridState,
        rankContext,
        debugLog,
        debugHighlights,
        consensus,
      );
    }

    const defs = {};
    if (panelEnabled('header', true)) {
      defs.header = (
        <DynamicSlot
          key="header"
          slotId="play.header"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => <Header userLabel={userLabel} />}
        />
      );
    }
    if (panelEnabled('gameChat', true)) {
      defs.gameChat = (
        <DynamicSlot
          key="gameChat"
          slotId="play.gameChat"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => (
            <GameChat
              items={
                Array.isArray(runtimeFeed)
                  ? runtimeFeed.map(m => ({
                      role: m.roleScope === 'system' ? 'system' : 'ai',
                      text: m.text,
                    }))
                  : gameChat
              }
              onRetryLast={retryLastTurn}
            />
          )}
        />
      );
    }
    if (panelEnabled('nextBar', true)) {
      defs.nextBar = (
        <DynamicSlot
          key="nextBar"
          slotId="play.nextBar"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => (
            <NextBar
              onNext={triggerNext}
              secondsLeft={
                onForceNext != null && typeof runtimeSecondsLeft === 'number'
                  ? runtimeSecondsLeft
                  : secondsLeft
              }
              policy={nextPolicy}
              readySummary={readySummary}
            />
          )}
        />
      );
    }
    if (panelEnabled('playerChat', true)) {
      defs.playerChat = (
        <DynamicSlot
          key="playerChat"
          slotId="play.playerChat"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => (
            <PlayerChat
              items={chat}
              text={chatText}
              setText={setChatText}
              onSend={sendChat}
              currentUserLabel={userLabel}
              currentUserAvatar={imageUrl}
            />
          )}
        />
      );
    }
    if (panelEnabled('widgets', playWidgets.length > 0) && playWidgets.length > 0) {
      defs.widgets = (
        <DynamicSlot
          key="widgets"
          slotId="play.widgets"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => <WidgetRow widgets={playWidgets} />}
        />
      );
    }
    if (panelEnabled('character', true)) {
      defs.character = (
        <DynamicSlot
          key="character"
          slotId="play.character"
          files={files}
          resolveAsset={x => x}
          defaultRender={() => (
            <CharacterCard
              name={character?.name || '캐릭터'}
              image={imageUrl}
              desc={character?.desc || '설명'}
              stats={character?.stats || [10, 10, 10, 10]}
              cycle={
                uiConfig?.character?.behavior?.tapCycle || [
                  'desc',
                  'abilities',
                  'score',
                  'image',
                ]
              }
              viewIdx={charViewIdx}
              setViewIdx={setCharViewIdx}
            />
          )}
        />
      );
    }

    return layout.order.map(id => defs[id]).filter(Boolean);
  }, [
    layout.order,
    userLabel,
    gameChat,
    runtimeFeed,
    triggerNext,
    chat,
    chatText,
    template,
    character,
    imageUrl,
    sendChat,
    onForceNext,
    runtimeSecondsLeft,
    uiConfig,
    charViewIdx,
    files,
    secondsLeft,
    gridState,
    rankContext,
    shellConfig,
    turnLogEvents,
    debugLog,
    debugHighlights,
    nextPolicy,
    consensus,
  ]);

  return (
    <div style={{ position:'fixed', inset:0, background:'#0b1220', color:'#e2e8f0', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto auto auto', gap:8, padding: 'env(safe-area-inset-top) 8px calc(env(safe-area-inset-bottom) + 8px) 8px', minHeight:'100svh' }}>
        {modules.map((m, i) => (
          <div key={i} style={{ position: 'relative' }}>
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ userLabel }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'#0f172a', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:28, height:28, borderRadius:14, background:'#111827' }} />
        <strong style={{ fontSize:14 }}>{userLabel}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8 }} />
    </div>
  );
}

function GameChat({ items, onRetryLast }) {
  return (
    <div style={{ background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, minHeight:200, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'8px 10px', borderBottom:'1px solid rgba(148,163,184,0.2)', fontSize:12, color:'#93c5fd' }}>AI 게임 채팅</div>
      <div style={{ flex:1, minHeight:0, overflow:'auto', padding:10, display:'grid', gap:8 }}>
        {items.map((m, i) => {
          const isFallback = m.fallback === true;
          const isDev = m.isDev === true;
          const baseColor = m.role === 'system' ? '#e2e8f0' : '#cbd5e1';
          const isLastFallback = isFallback && i === items.length - 1;
          
          // Fallback 스타일: 개발=빨강+아이콘, 프로덕션=노랑+미묘한 경고
          const style = isFallback
            ? {
                fontSize: 13,
                lineHeight: 1.5,
                color: isDev ? '#fca5a5' : '#fbbf24',
                padding: '6px 8px',
                borderRadius: 6,
                border: isDev ? '1px solid #dc2626' : '1px solid rgba(245,158,11,0.3)',
                background: isDev ? 'rgba(127,29,29,0.15)' : 'rgba(245,158,11,0.05)',
              }
            : { fontSize: 13, lineHeight: 1.5, color: baseColor };
          
          return (
            <div key={i} style={style}>
              {isFallback && isDev && '⚠️ '}
              {m.text}
              {isFallback && isDev && m.errorMessage && (
                <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
                  에러: {m.errorMessage}
                </div>
              )}
              {isLastFallback && onRetryLast && (
                <button
                  onClick={onRetryLast}
                  style={{
                    marginTop: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #f59e0b',
                    background: 'rgba(245,158,11,0.2)',
                    color: '#fbbf24',
                    cursor: 'pointer',
                  }}
                >
                  🔄 재시도
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NextBar({ onNext, secondsLeft, policy, readySummary }) {
  const thresholdPct =
    policy && typeof policy.roleThreshold === 'number' && Number.isFinite(policy.roleThreshold)
      ? Math.round(policy.roleThreshold * 100)
      : null;
  const requiredRoles =
    policy && Array.isArray(policy.requiredRoles) && policy.requiredRoles.length > 0
      ? policy.requiredRoles.join(', ')
      : null;

  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        {policy && (thresholdPct != null || requiredRoles) ? (
          <span style={{ fontSize:11, color:'#94a3b8' }}>
            {requiredRoles ? `역할: ${requiredRoles}` : null}
            {requiredRoles && thresholdPct != null ? ' · ' : null}
            {thresholdPct != null ? `ready ≥ ${thresholdPct}%` : null}
          </span>
        ) : null}
        {readySummary && (readySummary.required > 0 || readySummary.count > 0) ? (
          <span style={{ fontSize:11, color:'#a5b4fc' }}>
            ready {readySummary.count} / {readySummary.required || '–'}
          </span>
        ) : null}
        {readySummary ? (
          <span
            style={{
              fontSize:11,
              color: readySummary.viewerHasConsented ? '#bbf7d0' : '#a5b4fc',
            }}
          >
            ready {Number(readySummary.count) || 0} / {readySummary.required || '–'}
            {readySummary.viewerHasConsented ? ' · 내 투표 완료' : ''}
          </span>
        ) : null}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {typeof secondsLeft === 'number' && secondsLeft >= 0 && (
          <span style={{ fontSize:12, color:'#93c5fd' }}>자동 진행: {secondsLeft}s</span>
        )}
        <button onClick={onNext} style={btnPrimary}>다음 ▶</button>
      </div>
    </div>
  );
}

function PlayerChat({ items, text, setText, onSend, currentUserLabel, currentUserAvatar }) {
  return (
    <div style={{ background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12 }}>
      <div style={{ maxHeight:120, overflow:'auto', padding:10, display:'flex', flexDirection:'column', gap:6 }}>
        {items.map((m, i) => {
          const isMe = m.role === 'me';
          const name = m.fromName || (isMe ? (currentUserLabel || '나') : '상대');
          const avatar = m.fromAvatar || currentUserAvatar || null;
          const alignStyle = isMe ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' };
          const bubbleColor = isMe ? '#1d4ed8' : '#111827';
          const bubbleBorder = isMe ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(148,163,184,0.6)';
          const textColor = '#e5e7eb';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                ...alignStyle,
              }}
            >
              {!isMe && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '999px',
                    background: '#020617',
                    marginRight: 6,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#9ca3af',
                      }}
                    >
                      {name?.[0] || '?'}
                    </div>
                  )}
                </div>
              )}
              <div style={{ maxWidth: '78%' }}>
                <div
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    marginBottom: 2,
                    textAlign: isMe ? 'right' : 'left',
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: bubbleColor,
                    border: bubbleBorder,
                    color: textColor,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text}
                </div>
              </div>
              {isMe && (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '999px',
                    background: '#020617',
                    marginLeft: 6,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {currentUserAvatar ? (
                    <img
                      src={currentUserAvatar}
                      alt={currentUserLabel || 'me'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        color: '#9ca3af',
                      }}
                    >
                      {(currentUserLabel || '나')?.[0] || '나'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:8, padding:8, borderTop:'1px solid rgba(148,163,184,0.2)' }}>
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="메시지 입력" style={input} />
        <button onClick={onSend} style={btn}>전송</button>
      </div>
    </div>
  );
}

function WidgetRow({ widgets = [] }) {
  return (
    <div style={{ display:'flex', gap:8, overflowX:'auto' }}>
      {widgets.map((w, i) => (
        <div key={i} style={{ minWidth: 180, background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, padding:8 }}>
          <div style={{ fontSize:12, color:'#93c5fd', marginBottom:6 }}>{w.title}</div>
          {w.body}
        </div>
      ))}
    </div>
  );
}

function CharacterCard({ name, image, desc, stats = [], cycle = ['desc','abilities','score','image'], viewIdx = 0, setViewIdx = () => {} }) {
  const onTap = useCallback(() => {
    try { setViewIdx((i) => (i + 1) % Math.max(1, cycle.length)); } catch {}
  }, [setViewIdx, cycle]);
  const mode = cycle?.[viewIdx] || 'desc';
  return (
    <div onClick={onTap} title="탭하여 전환" style={{ display:'grid', gridTemplateColumns:'72px 1fr', gap:10, alignItems:'center', background:'#0a1220', border:'1px solid rgba(148,163,184,0.25)', borderRadius:12, padding:10 }}>
      <div style={{ width:72, height:72, borderRadius:8, background:'#111827', overflow:'hidden' }}>
        {image && mode==='image' ? <img src={image} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : null}
      </div>
      <div style={{ minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{name}</div>
        {mode==='desc' && (
          <div style={{ fontSize:12, color:'#cbd5e1', marginTop:4, lineHeight:1.5, maxHeight:48, overflow:'hidden' }}>{desc}</div>
        )}
        {mode==='abilities' && (
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            {stats.slice(0,4).map((s,i) => (
              <div key={i} style={{ fontSize:12, color:'#93c5fd' }}>능력{i+1}: <span style={{ color:'#e2e8f0' }}>{s}</span></div>
            ))}
          </div>
        )}
        {mode==='score' && (
          <div style={{ fontSize:12, color:'#93c5fd', marginTop:8 }}>점수: <span style={{ color:'#e2e8f0' }}>{(stats[0]||0) + (stats[1]||0)}</span></div>
        )}
      </div>
    </div>
  );
}

function pickCharacter(template){
  try{
    const obj = template||{}; const ch = obj?.resources?.characters; if (Array.isArray(ch) && ch.length) {
      const c = ch[0];
      return {
        name: c.name || '캐릭터',
        image: c.image || null,
        desc: c.desc || c.description || '',
        stats: Array.isArray(c.stats) ? c.stats : [c.hp||10, c.attack||10, c.defense||10, c.magic||10],
      };
    }
  }catch{}
  return null;
}

function pickFirstImage(template){
  try{
    const files = template?.resources?.files || [];
    const img = files.find(f => String(f?.mime||'').startsWith('image/'));
    return img?.url || null;
  }catch{}
  return null;
}

function readUiConfig(template){
  try{
    const ui = template?.ui?.main?.modules || [];
    const nextBar = ui.find(m => m?.type === 'NextBar') || null;
    const character = ui.find(m => m?.type === 'CharacterCards') || null;
    return {
      nextBar,
      character,
    };
  }catch{}
  return {};
}

function buildDefaultWidgets(
  template,
  flags,
  gridState,
  rankContext,
  battleLog,
  highlightEvents,
  consensus,
){
  const list = [];
  const logEvents = Array.isArray(battleLog?.events) ? battleLog.events : [];
  const highlights = Array.isArray(highlightEvents) ? highlightEvents : [];
  // Resource preview (only if explicitly enabled)
  if (flags?.resourcePreviewEnabled) {
    const image = pickFirstImage(template);
    list.push({ title: '리소스 미리보기', body: image ? <img src={image} alt="res" style={{ width:'100%', height:120, objectFit:'cover', borderRadius:8 }} /> : <div style={{ fontSize:12, color:'#94a3b8' }}>이미지가 없습니다.</div> });
  }
  // Code runner placeholder (only if explicitly enabled)
  if (flags?.codeRunnerEnabled) {
    list.push({ title: '사용자 지정 코드', body: <div style={{ fontSize:12, color:'#94a3b8' }}>코드 실행 위젯 (연결 예정)</div> });
  }
  if (gridState) {
    list.push({ title: '그리드 월드', body: <GridCanvas grid={gridState} /> });
  }
  // Rank participants (if provided via rankContext)
  const participants = Array.isArray(rankContext?.players) ? rankContext.players : [];
  const viewerOwnerId =
    typeof rankContext?.viewer?.ownerId === 'string'
      ? rankContext.viewer.ownerId.trim()
      : typeof rankContext?.viewer?.owner_id === 'string'
        ? rankContext.viewer.owner_id.trim()
        : '';
  const readyOwnerIds = (() => {
    if (!consensus || typeof consensus !== 'object') return new Map();
    const eligible = Array.isArray(consensus.eligibleOwnerIds)
      ? consensus.eligibleOwnerIds
      : [];
    const consented = Array.isArray(consensus.consentedOwnerIds)
      ? consensus.consentedOwnerIds
      : [];
    const eligibleSet = new Set(
      eligible
        .map(id => (id == null ? '' : String(id).trim()))
        .filter(id => id)
    );
    const consentedSet = new Set(
      consented
        .map(id => (id == null ? '' : String(id).trim()))
        .filter(id => id)
    );
    const map = new Map();
    eligibleSet.forEach(id => {
      map.set(id, { eligible: true, consented: consentedSet.has(id) });
    });
    consentedSet.forEach(id => {
      if (!map.has(id)) {
        map.set(id, { eligible: false, consented: true });
      }
    });
    return map;
  })();
  const consensusActive = Boolean(consensus && typeof consensus === 'object' && consensus.active);
  const participantsBySlot = {};
  participants.forEach((p) => {
    if (!p) return;
    const slotId = p.slotId || p.slot_id || p.ownerId || p.owner_id;
    if (!slotId) return;
    participantsBySlot[String(slotId)] = p;
  });
  if (participants.length) {
    list.push({
      title: '참가자',
      body: (
        <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#e5e7eb' }}>
          {participants.map((p, idx) => {
            const heroName =
              p?.hero?.name ||
              p?.hero_name ||
              p?.heroName ||
              p?.display_name ||
              p?.displayName ||
              p?.owner_id ||
              p?.ownerId ||
              `참가자 ${idx + 1}`;
            const role = p?.role || '';
            const score =
              typeof p?.score === 'number' && Number.isFinite(p.score) ? p.score : null;
            const ownerRaw = p?.ownerId ?? p?.owner_id;
            const ownerId =
              ownerRaw === null || ownerRaw === undefined ? '' : String(ownerRaw).trim();
            const readyInfo = ownerId ? readyOwnerIds.get(ownerId) : null;
            const isReady =
              consensusActive && readyInfo && readyInfo.consented === true;
            const isViewer =
              ownerId && viewerOwnerId && ownerId === viewerOwnerId;
            const borderColor = isReady
              ? 'rgba(56,189,248,0.85)'
              : 'rgba(51,65,85,0.7)';
            const backgroundColor = isReady
              ? 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(8,47,73,0.9))'
              : 'rgba(15,23,42,0.85)';
            const boxShadow = isReady
              ? isViewer
                ? '0 0 0 1px rgba(56,189,248,0.55)'
                : '0 0 0 1px rgba(56,189,248,0.35)'
              : 'none';
            return (
              <div
                key={p?.id || `${heroName}-${idx}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: backgroundColor,
                  border: `1px solid ${borderColor}`,
                  boxShadow,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {heroName}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {role ? (
                      <div style={{ fontSize: 11, color: '#93c5fd' }}>
                        역할: <span style={{ color: '#e5e7eb' }}>{role}</span>
                      </div>
                    ) : null}
                    {isReady ? (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(34,197,94,0.2)',
                          border: '1px solid rgba(34,197,94,0.7)',
                          color: '#bbf7d0',
                        }}
                      >
                        다음 투표 완료
                        {isViewer ? ' · 내 캐릭터' : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
                {score != null ? (
                  <div style={{ fontSize: 11, color: '#fde68a', marginLeft: 8 }}>점수 {score}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ),
    });
  }
  // Battle outcome / scoreboard (if onBattleEnd/settle provided one)
  const outcome = battleLog && typeof battleLog === 'object' ? battleLog.outcome || null : null;
  const scoreboard =
    battleLog && typeof battleLog.scoreboard === 'object' ? battleLog.scoreboard : null;
  const winnerIds = Array.isArray(outcome?.winners) ? outcome.winners : [];
  const loserIds = Array.isArray(outcome?.losers) ? outcome.losers : [];
  const isDraw = !!outcome?.draw;
  const hasScoreboard =
    scoreboard && typeof scoreboard === 'object' && Object.keys(scoreboard).length > 0;
  const hasOutcomeSummary = winnerIds.length || loserIds.length || isDraw;
  if (hasOutcomeSummary || hasScoreboard) {
    const formatSlotLabel = (slotId) => {
      const key = String(slotId);
      const p = participantsBySlot[key];
      if (!p) return key;
      return (
        p?.hero?.name ||
        p?.hero_name ||
        p?.heroName ||
        p?.display_name ||
        p?.displayName ||
        p?.owner_id ||
        p?.ownerId ||
        key
      );
    };
    list.push({
      title: '전투 결과',
      body: (
        <div style={{ display: 'grid', gap: 6, fontSize: 12, color: '#e5e7eb' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span>
              승자:{' '}
              {winnerIds.length ? winnerIds.map((id) => formatSlotLabel(id)).join(', ') : '없음'}
            </span>
            <span>
              패자:{' '}
              {loserIds.length ? loserIds.map((id) => formatSlotLabel(id)).join(', ') : '없음'}
            </span>
            <span>무승부: {isDraw ? '예' : '아니오'}</span>
          </div>
          {hasScoreboard ? (
            <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
              {Object.entries(scoreboard).map(([slotId, row]) => {
                const score = typeof row?.score === 'number' ? row.score : null;
                const delta =
                  typeof row?.delta === 'number' && Number.isFinite(row.delta)
                    ? row.delta
                    : null;
                return (
                  <div
                    key={slotId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '2px 4px',
                      borderRadius: 4,
                      background: 'rgba(15,23,42,0.85)',
                      border: '1px solid rgba(51,65,85,0.7)',
                    }}
                  >
                    <span>{formatSlotLabel(slotId)}</span>
                    <span>
                      점수 {score != null ? score : '-'}
                      {delta != null && delta !== score ? ` (Δ ${delta})` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ),
    });
  }
  if (logEvents.length) {
    const visibleHighlights = highlights.length ? highlights : logEvents.slice(-6);
    list.push({
      title: '배틀 로그(디버그)',
      body: (
        <ShellBattleHighlights
          events={visibleHighlights}
          participants={battleLog?.participants || {}}
        />
      ),
    });
  }
  return list;
}

function buildWidgetsFromShell(configs, ctx){
  const list = [];
  const participants = Array.isArray(ctx.rankContext?.players) ? ctx.rankContext.players : [];
  const baseEvents = Array.isArray(ctx.battleLog?.events)
    ? ctx.battleLog.events
    : Array.isArray(ctx.turnLogEvents)
    ? ctx.turnLogEvents
    : [];
  const lastTurn = baseEvents.length ? baseEvents[baseEvents.length - 1] : null;
  configs.forEach((cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    const kind = cfg.kind;
    const visible = evaluateVisibleWhen(cfg.visibleWhen, {
      rankContext: ctx.rankContext,
      lastTurn,
    });
    if (!visible) return;
    const style = applyShellStyleProps(cfg.style || cfg.styleProps);
    if (kind === 'chatLog') {
      list.push({
        title: cfg.title || '턴 로그',
        body: (
          <div style={style}>
            <ShellChatLogRich
              events={baseEvents}
              rankContext={ctx.rankContext || null}
            />
          </div>
        ),
      });
      return;
    }
    if (kind === 'aiHistory') {
      list.push({
        title: cfg.title || 'AI 히스토리',
        body: (
          <div style={style}>
            <ShellAiHistory
              events={baseEvents}
              rankContext={ctx.rankContext || null}
            />
          </div>
        ),
      });
      return;
    }
    if (kind === 'playerHistory') {
      list.push({
        title: cfg.title || '플레이어 히스토리',
        body: (
          <div style={style}>
            <ShellPlayerHistory
              events={baseEvents}
              rankContext={ctx.rankContext || null}
            />
          </div>
        ),
      });
      return;
    }
    if (kind === 'turnTimeline') {
      list.push({
        title: cfg.title || '턴 타임라인',
        body: (
          <div style={style}>
            <ShellTurnTimeline
              events={baseEvents}
            />
          </div>
        ),
      });
      return;
    }
    if (kind === 'image') {
      const src = typeof cfg.source === 'string' ? cfg.source : '';
      let url = null;
      if (src.startsWith('rank.') && ctx.rankContext) {
        url = resolveBindingFromRoot(ctx.rankContext, src.slice('rank.'.length));
      } else if (src.startsWith('variables.') && lastTurn && lastTurn.variables) {
        url = resolveBindingFromRoot(lastTurn.variables, src.slice('variables.'.length));
      } else if (src.startsWith('turn.') && lastTurn) {
        url = resolveBindingFromRoot(lastTurn, src.slice('turn.'.length));
      } else if (src) {
        // literal URL
        url = src;
      }
      if (typeof url !== 'string' || !url.trim()) return;
      list.push({
        title: cfg.title || '이미지',
        body: (
          <div style={style}>
            <ShellImage src={url.trim()} variant={cfg.variant} />
          </div>
        ),
      });
      return;
    }
    if (kind === 'heroCard' || kind === 'participantCard') {
      let player = null;
      const src = typeof cfg.source === 'string' ? cfg.source : 'rank.viewer';
      if (src === 'rank.viewer' && ctx.rankContext && ctx.rankContext.viewer) {
        const ownerId = ctx.rankContext.viewer.ownerId || ctx.rankContext.viewer.owner_id || null;
        if (ownerId) {
          player =
            participants.find((p) => {
              const oid =
                p.owner_id ||
                p.ownerId ||
                (p.owner && p.owner.id) ||
                null;
              return oid && String(oid).trim() === String(ownerId).trim();
            }) || null;
        }
      } else if (src.startsWith('rank.') && ctx.rankContext) {
        // rank.* 경로는 rankContext 루트에서 직접 resolve한다.
        const bound = resolveBindingFromRoot(ctx.rankContext, src.slice('rank.'.length));
        if (bound && typeof bound === 'object') {
          player = bound;
        }
      } else if (src.startsWith('variables.') && lastTurn && lastTurn.variables) {
        const bound = resolveBindingFromRoot(lastTurn.variables, src.slice('variables.'.length));
        if (bound && typeof bound === 'object') {
          player = bound;
        }
      } else {
        const m = src.match(/^rank\.players\[(\d+)\]$/);
        if (m) {
          const idx = Number(m[1]);
          if (Number.isFinite(idx) && idx >= 0 && idx < participants.length) {
            player = participants[idx];
          }
        }
      }

      if (!player && participants.length) {
        player = participants[0];
      }
      if (!player) return;

      list.push({
        title: cfg.title || '참가자',
        body: (
          <div style={style}>
            <ShellHeroCard player={player} variant={cfg.variant} />
          </div>
        ),
      });
      return;
    }
    if (kind === 'statMeter') {
      const src = typeof cfg.source === 'string' ? cfg.source : '';
      let rawValue = null;
      if (src.startsWith('variables.') && lastTurn && lastTurn.variables) {
        rawValue = resolveBindingFromRoot(lastTurn.variables, src.slice('variables.'.length));
      } else if (src.startsWith('rank.') && ctx.rankContext) {
        rawValue = resolveBindingFromRoot(ctx.rankContext, src.slice('rank.'.length));
      }
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) return;
      const max =
        typeof cfg.max === 'number' && Number.isFinite(cfg.max) && cfg.max > 0
          ? cfg.max
          : Math.max(Math.abs(numeric), 1);
      list.push({
        title: cfg.title || '수치',
        body: (
          <div style={style}>
            <ShellStatMeter value={numeric} max={max} />
          </div>
        ),
      });
      return;
    }
    if (kind === 'badge') {
      const src = typeof cfg.source === 'string' ? cfg.source : '';
      let rawValue = null;
      if (src.startsWith('variables.') && lastTurn && lastTurn.variables) {
        rawValue = resolveBindingFromRoot(lastTurn.variables, src.slice('variables.'.length));
      } else if (src.startsWith('rank.') && ctx.rankContext) {
        rawValue = resolveBindingFromRoot(ctx.rankContext, src.slice('rank.'.length));
      } else if (src.startsWith('turn.') && lastTurn) {
        rawValue = resolveBindingFromRoot(lastTurn, src.slice('turn.'.length));
      } else if (typeof cfg.text === 'string') {
        rawValue = cfg.text;
      }
      const label = (cfg.label || cfg.text || rawValue || '').toString().trim();
      if (!label) return;
      list.push({
        title: cfg.title || '',
        body: (
          <div style={style}>
            <ShellBadge text={label} tone={cfg.tone || cfg.variant} />
          </div>
        ),
      });
      return;
    }
    if (kind === 'textBlock') {
      const src = typeof cfg.source === 'string' ? cfg.source : '';
      let bodyText = null;
      if (src.startsWith('variables.') && lastTurn && lastTurn.variables) {
        bodyText = resolveBindingFromRoot(lastTurn.variables, src.slice('variables.'.length));
      } else if (src.startsWith('rank.') && ctx.rankContext) {
        bodyText = resolveBindingFromRoot(ctx.rankContext, src.slice('rank.'.length));
      } else if (src.startsWith('turn.') && lastTurn) {
        bodyText = resolveBindingFromRoot(lastTurn, src.slice('turn.'.length));
      } else if (typeof cfg.text === 'string') {
        bodyText = cfg.text;
      }
      const bodyStr = bodyText != null ? String(bodyText).trim() : '';
      if (!bodyStr) return;
      const heading = cfg.title || cfg.heading || '';
      list.push({
        title: heading || cfg.title || '',
        body: (
          <div style={style}>
            <ShellTextBlock heading={heading} body={bodyStr} />
          </div>
        ),
      });
      return;
    }
  });
  return list;
}

function evaluateVisibleWhen(expr, ctx) {
  if (!expr || typeof expr !== 'string') return true;
  const text = expr.trim();
  if (!text) return true;

  const evalToken = (token) => {
    const trimmed = token.trim();
    if (!trimmed) return false;
    const isNegated = trimmed.startsWith('!');
    const core = isNegated ? trimmed.slice(1).trim() : trimmed;
    let value = null;
    if (core.startsWith('rank.') && ctx.rankContext) {
      value = resolveBindingFromRoot(ctx.rankContext, core.slice('rank.'.length));
    } else if (core.startsWith('variables.') && ctx.lastTurn && ctx.lastTurn.variables) {
      value = resolveBindingFromRoot(ctx.lastTurn.variables, core.slice('variables.'.length));
    } else if (core.startsWith('turn.') && ctx.lastTurn) {
      value = resolveBindingFromRoot(ctx.lastTurn, core.slice('turn.'.length));
    } else {
      // unsupported token → treat as false
      return false;
    }
    const truthy = !!value;
    return isNegated ? !truthy : truthy;
  };

  // 지원하는 간단 표현식:
  // - "rank.viewer"
  // - "!rank.viewer"
  // - "rank.viewer && variables.turn"
  // - "rank.viewer || variables.turn"
  if (text.includes('&&')) {
    return text.split('&&').every((tok) => evalToken(tok));
  }
  if (text.includes('||')) {
    return text.split('||').some((tok) => evalToken(tok));
  }
  return evalToken(text);
}

function resolveBindingFromRoot(root, path){
  if (!root || !path) return null;
  const segments = String(path)
    .split('.')
    .map(s => s.trim())
    .filter(Boolean);
  let cur = root;
  for (const seg of segments) {
    if (cur == null) return null;
    const m = seg.match(/^(\w+)\[(\d+)\]$/);
    if (m) {
      const key = m[1];
      const idx = Number(m[2]);
      const arr = cur[key];
      if (!Array.isArray(arr) || !Number.isFinite(idx) || idx < 0 || idx >= arr.length) {
        return null;
      }
      cur = arr[idx];
    } else {
      cur = cur[seg];
    }
  }
  return cur;
}

function ShellChatLog({ events }){
  const items = Array.isArray(events) ? events : [];
  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>아직 진행된 턴이 없습니다.</div>;
  }
  return (
    <div style={{ display:'grid', gap:6, maxHeight:160, overflowY:'auto' }}>
      {items
        .slice()
        .reverse()
        .map((evt, idx) => {
          const turn = typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
          const firstLine =
            typeof evt.prompt === 'string'
              ? (evt.prompt.split(/\r?\n/)[0] || '')
              : evt.nodeLabel || evt.nodeId || '';
          const text =
            firstLine.length > 80 ? `${firstLine.slice(0, 76).trimEnd()}…` : firstLine || '내용 없음';
          return (
            <div key={idx} style={{ fontSize:11, lineHeight:1.4 }}>
              <div style={{ color:'#93c5fd' }}>
                {turn != null ? `턴 ${turn}` : '턴 ?'}
                {evt.reason ? <span style={{ marginLeft:4, opacity:0.8 }}>{String(evt.reason)}</span> : null}
              </div>
              <div style={{ color:'#e5e7eb' }}>{text}</div>
            </div>
          );
        })}
    </div>
  );
}

function ShellTurnTimeline({ events }){
  const items = Array.isArray(events) ? events.filter(isLogEntryVisible) : [];
  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>아직 진행된 턴이 없습니다.</div>;
  }
  const lastItems = items.slice(-12);
  return (
    <div style={{ display:'grid', gap:6, fontSize:12, color:'#e5e7eb' }}>
      {lastItems.map((evt, idx) => {
        const baseIndex = items.length - lastItems.length;
        const rawTurn = evt && typeof evt.turn !== 'undefined' ? Number(evt.turn) : NaN;
        const turn = Number.isFinite(rawTurn) && rawTurn > 0 ? rawTurn : baseIndex + idx + 1;
        const label = evt?.nodeLabel || evt?.nodeId || `턴 ${turn}`;
        const preview =
          typeof evt?.prompt === 'string' && evt.prompt.trim()
            ? evt.prompt.trim().slice(0, 80)
            : '';
        return (
          <div
            key={evt?.id || `${turn}-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 8,
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 18,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                color: '#9ca3af',
              }}
            >
              {turn}
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ color: '#e5e7eb', fontWeight: 600 }}>{label}</div>
              {preview ? (
                <div style={{ color: '#cbd5e1', opacity: 0.85 }}>{preview}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ShellBattleHighlights({ events, participants = {} }){
  const items = Array.isArray(events) ? events.filter(isLogEntryVisible) : [];
  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>하이라이트가 없습니다.</div>;
  }
  return (
    <div style={{ display:'grid', gap:6, maxHeight:200, overflowY:'auto' }}>
      {items.map((evt, idx) => {
        const turn = typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
        const speaker = evt.speaker || {};
        const slotId = speaker.slotId || speaker.ownerId || null;
        const participant = slotId && participants ? participants[slotId] : null;
        const name = speaker.name || participant?.name || slotId || '참가자';
        const role = speaker.role || participant?.role || null;
        const text =
          typeof evt.summary === 'string' && evt.summary.trim()
            ? evt.summary.trim()
            : typeof evt.prompt === 'string'
            ? (evt.prompt.split(/\r?\n/)[0] || '')
            : evt.nodeLabel || evt.nodeId || evt.type;
        return (
          <div
            key={evt.id || `${idx}-${turn || 't'}`}
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid rgba(148,163,184,0.4)',
              background: 'rgba(15,23,42,0.9)',
              display: 'grid',
              gap: 2,
              fontSize: 12,
              color: '#e5e7eb',
            }}
          >
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#9ca3af' }}>
              {turn != null ? <span>턴 {turn}</span> : <span>턴 ?</span>}
              <span>{evt.type || 'event'}</span>
              {name ? <span>{name}</span> : null}
              {role ? <span style={{ opacity:0.8 }}>({role})</span> : null}
            </div>
            <div>{text}</div>
          </div>
        );
      })}
    </div>
  );
}

function ShellChatLogRich({ events, rankContext }){
  const items = Array.isArray(events) ? events.filter(isLogEntryVisible) : [];
  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>아직 진행된 턴이 없습니다.</div>;
  }

  const players = Array.isArray(rankContext?.players) ? rankContext.players : [];

  const pickSpeaker = (evt) => {
    const v = evt?.variables || {};
    const speaker = v.speaker || v.currentSpeaker || {};
    const ownerId =
      speaker.ownerId || speaker.owner_id || evt.speakerOwnerId || null;
    const heroId =
      speaker.heroId || speaker.hero_id || evt.speakerHeroId || null;
    const role = speaker.role || evt.speakerRole || null;
    const accent =
      speaker.accentColor ||
      speaker.color ||
      evt.speakerAccent ||
      null;
    const explicitAvatar =
      speaker.avatarUrl ||
      speaker.avatar_url ||
      evt.speakerAvatarUrl ||
      null;

    let player = null;
    if (players.length && (ownerId || heroId)) {
      player =
        players.find((p) => {
          if (ownerId && p.ownerId && String(p.ownerId) === String(ownerId)) return true;
          if (heroId && p.heroId && String(p.heroId) === String(heroId)) return true;
          return false;
        }) || null;
    }

    const avatarUrl = explicitAvatar || player?.avatarUrl || player?.avatar_url || null;
    const heroName = player?.heroName || null;
    const resolvedRole = role || player?.role || null;

    return {
      ownerId,
      heroId,
      role: resolvedRole,
      accentColor: accent || null,
      avatarUrl,
      heroName,
    };
  };

  return (
    <div style={{ display:'grid', gap:6, maxHeight:160, overflowY:'auto' }}>
      {items
        .slice()
        .reverse()
        .map((evt, idx) => {
          const turn = typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
          const speaker = pickSpeaker(evt);
          const promptText =
            typeof evt.prompt === 'string' && evt.prompt.length
              ? evt.prompt
              : String(evt.nodeLabel || evt.nodeId || '');
          const firstLine = promptText.split('\n')[0] || promptText;

          const accentBorder =
            speaker.accentColor && typeof speaker.accentColor === 'string'
              ? speaker.accentColor
              : 'rgba(148,163,184,0.45)';
          const accentBg =
            speaker.accentColor && typeof speaker.accentColor === 'string'
              ? 'rgba(15,23,42,0.95)'
              : 'rgba(15,23,42,0.85)';

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              {speaker.avatarUrl ? (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: `1px solid ${accentBorder}`,
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={speaker.avatarUrl}
                    alt={speaker.heroName || 'speaker'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ) : null}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: `1px solid ${accentBorder}`,
                  background: accentBg,
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, fontSize:11, color:'#9ca3af' }}>
                  {turn != null ? (
                    <span style={{ fontWeight:600, color:'#e5e7eb' }}>턴 {turn}</span>
                  ) : (
                    <span style={{ fontWeight:600, color:'#e5e7eb' }}>턴 ?</span>
                  )}
                  {speaker.heroName ? (
                    <span>{speaker.heroName}</span>
                  ) : null}
                  {speaker.role ? (
                    <span style={{ opacity:0.85 }}>({speaker.role})</span>
                  ) : null}
                  {evt.reason ? (
                    <span style={{ marginLeft:4, opacity:0.8 }}>{String(evt.reason)}</span>
                  ) : null}
                </div>
                <div style={{ color:'#e5e7eb', fontSize:12 }}>{firstLine}</div>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function ShellAiHistory({ events, rankContext }){
  const all = Array.isArray(events) ? events.filter(isLogEntryVisible) : [];
  const items = all.filter(evt => {
    const speaker = evt?.variables?.speaker || evt?.variables?.currentSpeaker || {};
    const role = (speaker.role || '').toLowerCase();
    if (role === 'ai' || role === 'assistant' || role === 'judge') return true;
    // fallback: reason 으로 추측
    const reason = (evt.reason || '').toLowerCase();
    return reason.includes('ai') || reason.includes('judge');
  });

  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>AI 결과가 아직 없습니다.</div>;
  }

  const players = Array.isArray(rankContext?.players) ? rankContext.players : [];

  const pickSpeaker = (evt) => {
    const v = evt?.variables || {};
    const speaker = v.speaker || v.currentSpeaker || {};
    const ownerId =
      speaker.ownerId || speaker.owner_id || evt.speakerOwnerId || null;
    const heroId =
      speaker.heroId || speaker.hero_id || evt.speakerHeroId || null;
    const role = speaker.role || evt.speakerRole || null;

    let player = null;
    if (players.length && (ownerId || heroId)) {
      player =
        players.find((p) => {
          if (ownerId && p.ownerId && String(p.ownerId) === String(ownerId)) return true;
          if (heroId && p.heroId && String(p.heroId) === String(heroId)) return true;
          return false;
        }) || null;
    }

    const heroName = player?.heroName || null;
    const resolvedRole = role || player?.role || null;

    return {
      heroName,
      role: resolvedRole,
    };
  };

  return (
    <div style={{ display:'grid', gap:6, maxHeight:160, overflowY:'auto' }}>
      {items
        .slice()
        .reverse()
        .map((evt, idx) => {
          const turn = typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
          const speaker = pickSpeaker(evt);
          const promptText =
            typeof evt.prompt === 'string' && evt.prompt.length
              ? evt.prompt
              : String(evt.nodeLabel || evt.nodeId || '');
          const firstLine = promptText.split('\n')[0] || promptText;
          const summary = (evt.summary && evt.summary.text) || evt.summary || null;

          return (
            <div
              key={idx}
              style={{
                display: 'grid',
                gap: 4,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.5)',
                background: 'rgba(15,23,42,0.9)',
                fontSize: 12,
                color: '#e5e7eb',
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {turn != null ? (
                  <span style={{ fontSize:11, color:'#9ca3af' }}>턴 {turn}</span>
                ) : null}
                {speaker.heroName ? (
                  <span style={{ fontSize:11, color:'#9ca3af' }}>{speaker.heroName}</span>
                ) : null}
                {speaker.role ? (
                  <span style={{ fontSize:11, color:'#9ca3af' }}>({speaker.role})</span>
                ) : null}
              </div>
              <div style={{ fontWeight:600 }}>{firstLine}</div>
              {summary ? (
                <div style={{ fontSize:11, color:'#cbd5e1', opacity:0.9 }}>{summary}</div>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}

function ShellPlayerHistory({ events, rankContext }){
  const all = Array.isArray(events) ? events.filter(isLogEntryVisible) : [];
  const items = all.filter(evt => {
    const reason = (evt.reason || '').toLowerCase();
    return reason.includes('user') || reason.includes('player') || reason.includes('chat');
  });

  if (!items.length) {
    return <div style={{ fontSize:12, color:'#94a3b8' }}>플레이어 기록이 아직 없습니다.</div>;
  }

  const players = Array.isArray(rankContext?.players) ? rankContext.players : [];

  const resolvePlayerName = (evt) => {
    const ownerId = evt.ownerId || evt.owner_id || evt.playerOwnerId || null;
    const heroId = evt.heroId || evt.hero_id || evt.playerHeroId || null;
    if (!players.length || (!ownerId && !heroId)) return null;
    const p =
      players.find((pl) => {
        if (ownerId && pl.ownerId && String(pl.ownerId) === String(ownerId)) return true;
        if (heroId && pl.heroId && String(pl.heroId) === String(heroId)) return true;
        return false;
      }) || null;
    return p?.heroName || null;
  };

  return (
    <div style={{ display:'grid', gap:6, maxHeight:160, overflowY:'auto' }}>
      {items
        .slice()
        .reverse()
        .map((evt, idx) => {
          const turn = typeof evt.turn === 'number' && Number.isFinite(evt.turn) ? evt.turn : null;
          const who = resolvePlayerName(evt);
          const text =
            typeof evt.prompt === 'string' && evt.prompt.length
              ? evt.prompt
              : typeof evt.input === 'string'
              ? evt.input
              : '';
          const firstLine = text.split('\n')[0] || text;

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'rgba(15,23,42,0.9)',
                fontSize: 12,
                color: '#e5e7eb',
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#9ca3af' }}>
                {turn != null ? <span>턴 {turn}</span> : null}
                {who ? <span>{who}</span> : null}
              </div>
              <div>{firstLine}</div>
            </div>
          );
        })}
    </div>
  );
}

function ShellHeroCard({ player, variant }){
  const heroName =
    player?.hero?.name ||
    player?.hero_name ||
    player?.heroName ||
    player?.display_name ||
    player?.displayName ||
    player?.owner_id ||
    player?.ownerId ||
    '참가자';
  const role = player?.role || '';
  const score =
    typeof player?.score === 'number' && Number.isFinite(player.score) ? player.score : null;
  const isCompact = variant === 'compact';
  const avatarUrl =
    player?.avatarUrl ||
    player?.avatar_url ||
    player?.hero?.avatar_url ||
    player?.hero?.image_url ||
    null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: '#e5e7eb',
      }}
    >
      {avatarUrl ? (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            overflow: 'hidden',
            border: '1px solid rgba(148,163,184,0.7)',
            flexShrink: 0,
          }}
        >
          <img
            src={avatarUrl}
            alt={heroName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      ) : null}
      <div style={{ display:'grid', gap:2 }}>
        <div style={{ fontWeight: 600 }}>{heroName}</div>
        {role ? (
          <div style={{ color: '#93c5fd' }}>
            역할: <span style={{ color: '#e5e7eb' }}>{role}</span>
          </div>
        ) : null}
        {!isCompact && score != null ? (
          <div style={{ color: '#fde68a' }}>
            점수: <span style={{ color: '#e5e7eb' }}>{score}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShellImage({ src, variant }){
  const shape = variant === 'circle' ? 'circle' : 'square';
  return (
    <div
      style={{
        width: '100%',
        height: 120,
        borderRadius: shape === 'circle' ? 999 : 10,
        overflow: 'hidden',
        background: '#020617',
        border: '1px solid rgba(148,163,184,0.45)',
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}

function ShellStatMeter({ value, max }){
  const safeMax = Number.isFinite(Number(max)) && max > 0 ? Number(max) : 1;
  const ratio = Math.max(0, Math.min(1, Number(value) / safeMax));
  const percent = Math.round(ratio * 100);
  return (
    <div style={{ display:'grid', gap:4, fontSize:12, color:'#e5e7eb' }}>
      <div
        style={{
          position:'relative',
          width:'100%',
          height:8,
          borderRadius:999,
          background:'rgba(15,23,42,0.9)',
          overflow:'hidden',
          border:'1px solid rgba(148,163,184,0.4)',
        }}
      >
        <div
          style={{
            position:'absolute',
            left:0,
            top:0,
            bottom:0,
            width:`${percent}%`,
            background:'linear-gradient(90deg, #22c55e, #16a34a)',
          }}
        />
      </div>
      <div style={{ fontSize:11, color:'#9ca3af' }}>
        {value} / {safeMax} ({percent}%)
      </div>
    </div>
  );
}

function ShellBadge({ text, tone }){
  const t = tone || 'secondary';
  let bg = 'rgba(30,64,175,0.35)';
  let border = '1px solid rgba(129,140,248,0.7)';
  let color = '#e5e7eb';
  if (t === 'primary') {
    bg = 'rgba(37,99,235,0.35)';
    border = '1px solid rgba(96,165,250,0.9)';
  } else if (t === 'muted') {
    bg = 'rgba(15,23,42,0.8)';
    border = '1px solid rgba(148,163,184,0.45)';
    color = '#cbd5e1';
  } else if (t === 'danger') {
    bg = 'rgba(220,38,38,0.22)';
    border = '1px solid rgba(248,113,113,0.9)';
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        border,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

function ShellTextBlock({ heading, body }){
  return (
    <div style={{ display:'grid', gap:4, fontSize:12, color:'#e5e7eb' }}>
      {heading ? (
        <div style={{ fontWeight:600, color:'#e5e7eb' }}>{heading}</div>
      ) : null}
      <div style={{ fontSize:12, lineHeight:1.6, color:'#cbd5e1', whiteSpace:'pre-wrap' }}>
        {body}
      </div>
    </div>
  );
}

function readWidgetFlags(template){
  const safe = (v) => v === true || v === 'true' || v === 1;
  try{
    const ui = template?.ui || {};
    // Check a few possible locations to consider the widget as "included"
    const main = ui?.main || {};
    const mainWidgets = main?.widgets || {};
    const generic = ui?.widgets || {};
    const play = ui?.play || {};
    const playWidgets = play?.widgets || {};
    const resourcePreviewEnabled = safe(mainWidgets?.resourcePreview?.enabled) || safe(generic?.resourcePreview?.enabled) || safe(playWidgets?.resourcePreview?.enabled) || safe(mainWidgets?.resourcePreview) || safe(generic?.resourcePreview) || safe(playWidgets?.resourcePreview);
    const codeRunnerEnabled = safe(mainWidgets?.codeRunner?.enabled) || safe(generic?.codeRunner?.enabled) || safe(playWidgets?.codeRunner?.enabled) || safe(mainWidgets?.codeRunner) || safe(generic?.codeRunner) || safe(playWidgets?.codeRunner);
    return { resourcePreviewEnabled, codeRunnerEnabled };
  }catch{}
  return { resourcePreviewEnabled: false, codeRunnerEnabled: false };
}

function loadLayout(){
  try {
    const raw = localStorage.getItem('mainGame:layout');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { order: ['header','gameChat','nextBar','playerChat','character'] }; // default layout
}
function saveLayout(layout){
  try { localStorage.setItem('mainGame:layout', JSON.stringify(layout)); } catch {}
}

function GridCanvas({ grid }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    rendererRef.current = attachCanvas2D(canvasRef.current, {});
    return () => {
      try {
        rendererRef.current?.dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current) return;
    try {
      rendererRef.current.draw({ grid });
    } catch {
      // ignore draw errors
    }
  }, [grid]);

  return (
    <div style={{ width:'100%', height:180, border:'1px solid #1f2937', borderRadius:8, background:'#020617', overflow:'hidden' }}>
      <canvas ref={canvasRef} style={{ width:'100%', height:'100%', display:'block' }} />
    </div>
  );
}
