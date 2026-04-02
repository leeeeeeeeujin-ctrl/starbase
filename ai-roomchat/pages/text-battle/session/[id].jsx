"use client";

import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getCurrentTurn,
  buildTurnPromptContext,
  resolveTurnActorId,
  rehydrateBattleSession,
} from '@/lib/battle/session';
import { buildRuntimePromptFromTurn } from '@/lib/battle/agentRuntime';
import {
  readStoredTextBattleSession,
  writeStoredTextBattleSession,
} from '@/lib/battle/clientSessionStorage';
import {
  clearActiveSessionRecord,
  readActiveSession,
  updateActiveSessionRecord,
} from '@/lib/rank/activeSessionStorage';
import CharacterRouteHud from '@/components/character/routes/CharacterRouteHud';
import CharacterDetailOverlay from '@/components/character/CharacterDetailOverlay';

function buildStatusTone(status = '') {
  if (status === 'completed') {
    return {
      bg: 'rgba(20, 83, 45, 0.78)',
      border: 'rgba(74, 222, 128, 0.35)',
      text: '#dcfce7',
    };
  }
  return {
    bg: 'rgba(15, 23, 42, 0.78)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#dbeafe',
  };
}

function shortText(value, limit = 90) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

function getBattleRunErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('invalid api key') ||
    message.includes('api key') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'API 키를 확인해주세요. 캐릭터 AI 페이지에서 교체할 수 있습니다.';
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('connection')
  ) {
    return '연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
  }
  if (
    message.includes('json') ||
    message.includes('format') ||
    message.includes('schema') ||
    message.includes('parse')
  ) {
    return '응답 형식이 맞지 않습니다. 다시 시도해주세요.';
  }
  return String(error?.message || '턴을 진행하지 못했습니다.');
}

function hydrateRuntimeSession(value) {
  if (!value || typeof value !== 'object') return null;
  return rehydrateBattleSession(value);
}

function parseJsonLikeText(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {}
  }
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    } catch {}
  }
  return null;
}

function toSceneSegments(sourceText, participants) {
  const parsed = parseJsonLikeText(sourceText);
  if (Array.isArray(parsed?.segments) && parsed.segments.length) {
    return parsed.segments
      .map((segment, index) => ({
        id: segment.id || `segment-${index}`,
        type: segment.type || 'narration',
        speaker: segment.speaker || '',
        text: String(segment.text || '').trim(),
        placement: segment.placement || '',
        title: String(segment.title || '').trim(),
        subtitle: String(segment.subtitle || '').trim(),
        delivery: String(segment.delivery || '').trim(),
      }))
      .filter(segment => segment.text || segment.type === 'sceneCue');
  }
  const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim() : '';
  const fallbackText = reply || (typeof sourceText === 'string' ? sourceText.trim() : '');
  if (!fallbackText) return [];
  const lines = fallbackText
    .split(/\n{2,}/)
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  return lines.map((text, index) => ({
    id: `fallback-${index}`,
    type: 'narration',
    speaker: '',
    text,
    placement: '',
    title: '',
    subtitle: '',
    delivery: '',
  }));
}

function getTypingDelay(segment, visibleChars) {
  const text = segment?.text || '';
  const delivery = String(segment?.delivery || '').toLowerCase();
  const nextChar = text.charAt(visibleChars) || '';
  const previousSlice = text.slice(Math.max(0, visibleChars - 3), visibleChars + 1);

  let delay = 18;
  if (delivery === 'calm') delay = 26;
  if (delivery === 'urgent') delay = 10;
  if (delivery === 'hesitant') delay = 34;
  if (delivery === 'angry') delay = 14;

  if (previousSlice.includes('...') || previousSlice.includes('…')) {
    delay += delivery === 'hesitant' ? 120 : 70;
  }
  if (/[,.!?]/.test(nextChar)) {
    delay += 34;
  }
  if (/\s/.test(nextChar)) {
    delay += 6;
  }
  return delay;
}

function getSegmentTone(segment) {
  const type = String(segment?.type || 'narration');
  if (type === 'effect') {
    return {
      label: '연출',
      textAlign: 'center',
      color: '#fef08a',
      fontStyle: 'italic',
    };
  }
  if (type === 'dialogue') {
    return {
      label: '대사',
      textAlign: 'left',
      color: '#f8fafc',
      fontStyle: 'normal',
    };
  }
  return {
    label: type === 'sceneCue' ? '장면 전환' : '서술',
    textAlign: 'left',
    color: '#dbeafe',
    fontStyle: 'normal',
  };
}

export default function TextBattleSessionPage() {
  const router = useRouter();
  const { id } = router.query || {};
  const logRef = useRef(null);
  const autoRunRef = useRef(false);
  const tapRef = useRef({ id: null, ts: 0 });
  const [state, setState] = useState({
    loading: true,
    error: null,
    payload: null,
  });
  const [runtimeState, setRuntimeState] = useState({
    session: null,
    input: '',
    running: false,
    status: '',
    error: '',
    showDebug: false,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailParticipant, setDetailParticipant] = useState(null);
  const [dialogueState, setDialogueState] = useState({
    segmentIndex: 0,
    visibleChars: 0,
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: null }));
    fetch(`/api/text-battle/session?id=${encodeURIComponent(id)}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (!json?.ok) {
          setState({
            loading: false,
            error: json?.error || 'failed_to_load',
            payload: null,
          });
          return;
        }
        const storedSession = hydrateRuntimeSession(readStoredTextBattleSession(id));
        const remoteSession = hydrateRuntimeSession(json?.runtimeSession);
        setState({
          loading: false,
          error: null,
          payload: json,
        });
        setRuntimeState(prev => ({
          ...prev,
          session: remoteSession || prev.session,
        }));
      })
      .catch(err => {
        if (cancelled) return;
        const storedSession = hydrateRuntimeSession(readStoredTextBattleSession(id));
        setState({
          loading: false,
          error: err?.message || String(err),
          payload: null,
        });
        if (storedSession) {
          setRuntimeState(prev => ({
            ...prev,
            session: prev.session || storedSession,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.payload?.turns?.length, runtimeState.status]);

  const payload = state.payload || {};
  const dbSession = payload.session || null;
  const runtimeSession = runtimeState.session || null;
  const currentTurn = runtimeSession ? getCurrentTurn(runtimeSession) : null;
  const resolvedActorId =
    runtimeSession && currentTurn
      ? resolveTurnActorId(runtimeSession, currentTurn, runtimeSession.actorId)
      : '';
  const livePromptContext =
    runtimeSession && currentTurn
      ? buildTurnPromptContext(runtimeSession, currentTurn, resolvedActorId)
      : null;
  const liveRuntime =
    runtimeSession && currentTurn
      ? buildRuntimePromptFromTurn(runtimeSession, currentTurn, resolvedActorId)
      : { agentContexts: [], runtimePrompt: '' };
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const agentContexts = Array.isArray(payload.agentContexts) ? payload.agentContexts : [];
  const currentActor = useMemo(
    () => participants.find(participant => participant.id === resolvedActorId) || null,
    [participants, resolvedActorId]
  );
  const statusTone = buildStatusTone(runtimeSession?.status || dbSession?.status || '');
  const lastTurn = turns.length ? turns[turns.length - 1] : null;
  const sessionStatus = runtimeSession?.status || dbSession?.status || '';
  const isEnded = ['completed', 'abandoned', 'defeated', 'closed', 'ended', 'cancelled', 'canceled'].includes(
    String(sessionStatus || '').toLowerCase()
  );
  const historyTurns = turns.slice(0, -1);
  const featuredTurn = turns.length ? turns[turns.length - 1] : null;
  const featuredSpeaker =
    participants.find(participant => participant.hero_id === featuredTurn?.hero_id || participant.id === featuredTurn?.hero_id) ||
    currentActor ||
    participants[0] ||
    null;
  const teams = useMemo(() => {
    const grouped = new Map();
    participants.forEach(participant => {
      const key = String(participant.team || '미지정');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(participant);
    });
    return Array.from(grouped.entries()).map(([team, members]) => ({ team, members }));
  }, [participants]);
  const anchorSlots = [
    { top: 20, left: 18, justify: 'start', align: 'start' },
    { top: 20, right: 18, justify: 'end', align: 'start' },
    { bottom: 156, right: 18, justify: 'end', align: 'end' },
    { bottom: 156, left: 18, justify: 'start', align: 'end' },
    { top: 20, left: '50%', translateX: '-50%', justify: 'center', align: 'start' },
    { bottom: 156, left: '50%', translateX: '-50%', justify: 'center', align: 'end' },
  ];
  const teamColorMap = useMemo(() => {
    const palette = ['#38bdf8', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#22d3ee', '#f97316'];
    const entries = {};
    teams.forEach((entry, index) => {
      entries[entry.team] = palette[index % palette.length];
    });
    return entries;
  }, [teams]);
  const activeHero = featuredSpeaker || participants[0] || null;
  const sceneSource = featuredTurn?.ai_response || currentTurn?.display || '';
  const sceneSegments = useMemo(() => toSceneSegments(sceneSource, participants), [participants, sceneSource]);
  const activeSegment = sceneSegments[dialogueState.segmentIndex] || null;
  const activeSegmentText = activeSegment?.text || '';
  const typedSegmentText = activeSegmentText.slice(0, dialogueState.visibleChars || 0);
  const activeDialogueSpeaker =
    (activeSegment?.speaker &&
      participants.find(participant =>
        [participant.id, participant.hero_id, participant.name].map(value => String(value || '')).includes(String(activeSegment.speaker))
      )) ||
    featuredSpeaker ||
    currentActor ||
    null;
  const activeSegmentTone = getSegmentTone(activeSegment);
  const activeSceneCue =
    activeSegment?.type === 'sceneCue'
      ? {
          placement: activeSegment.placement === 'right' ? 'right' : 'left',
          title: activeSegment.title || activeSegment.speaker || activeDialogueSpeaker?.name || '장면 전환',
          subtitle: activeSegment.subtitle || activeSegment.text || '',
        }
      : null;

  useEffect(() => {
    if (!id) return;
    const active = readActiveSession();
    if (!active) return;
    if (active.sessionId && String(active.sessionId) !== String(id)) return;
    if (isEnded) {
      clearActiveSessionRecord(active.gameId || undefined);
      return;
    }
    if (active.gameId) {
      updateActiveSessionRecord(active.gameId, {
        href: `/text-battle/session/${encodeURIComponent(String(id))}`,
        status: 'active',
        turn: Number.isFinite(Number(runtimeSession?.turnIndex)) ? Number(runtimeSession.turnIndex) + 1 : active.turn || 1,
        actorNames: Array.isArray(participants) ? participants.map(participant => participant?.name).filter(Boolean) : active.actorNames || [],
      });
    }
  }, [id, isEnded, participants, runtimeSession?.turnIndex]);

  useEffect(() => {
    setDialogueState({
      segmentIndex: 0,
      visibleChars: 0,
    });
  }, [sceneSource]);

  useEffect(() => {
    if (!activeSegmentText) return;
    if (dialogueState.visibleChars >= activeSegmentText.length) return;
    const timer = setTimeout(() => {
      setDialogueState(prev => ({
        ...prev,
        visibleChars: Math.min(activeSegmentText.length, prev.visibleChars + Math.max(1, Math.ceil(activeSegmentText.length / 42))),
      }));
    }, getTypingDelay(activeSegment, dialogueState.visibleChars));
    return () => clearTimeout(timer);
  }, [activeSegment, activeSegmentText, dialogueState.visibleChars]);

  useEffect(() => {
    if (!id || !runtimeSession || !currentTurn || runtimeState.running || isEnded) return;
    const isAutoTurn = (currentTurn?.input?.mode || 'none') === 'none';
    if (!isAutoTurn || turns.length > 0 || autoRunRef.current) return;
    autoRunRef.current = true;
    const timer = setTimeout(() => {
      handleRunTurn();
    }, 700);
    return () => clearTimeout(timer);
  }, [currentTurn, id, isEnded, runtimeSession, runtimeState.running, turns.length]);

  async function refreshPayload() {
    const response = await fetch(`/api/text-battle/session?id=${encodeURIComponent(id)}`);
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      throw new Error(json?.detail || json?.error || 'failed_to_refresh');
    }
    setState({
      loading: false,
      error: null,
      payload: json,
    });
  }

  function handleParticipantTap(participant) {
    const now = Date.now();
    if (tapRef.current.id === participant.id && now - tapRef.current.ts < 320) {
      setDetailParticipant(participant);
    }
    tapRef.current = {
      id: participant.id,
      ts: now,
    };
  }

  function handleAdvanceDialogue() {
    if (!sceneSegments.length) return;
    if (activeSegment?.type === 'sceneCue') {
      if (dialogueState.segmentIndex < sceneSegments.length - 1) {
        setDialogueState({
          segmentIndex: dialogueState.segmentIndex + 1,
          visibleChars: 0,
        });
      }
      return;
    }
    if (dialogueState.visibleChars < activeSegmentText.length) {
      setDialogueState(prev => ({
        ...prev,
        visibleChars: activeSegmentText.length,
      }));
      return;
    }
    if (dialogueState.segmentIndex < sceneSegments.length - 1) {
      setDialogueState(prev => ({
        segmentIndex: prev.segmentIndex + 1,
        visibleChars: 0,
      }));
    }
  }

  async function handleRunTurn() {
    if (!id || !runtimeSession || !currentTurn || runtimeState.running) return;
    setRuntimeState(prev => ({
      ...prev,
      running: true,
      status:
        (currentTurn?.input?.mode || 'none') === 'none'
          ? 'AI가 행동을 생성하는 중입니다…'
          : '행동을 처리하는 중입니다…',
      error: '',
    }));

    try {
      const {
        data: { session: authSession },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !authSession?.access_token) {
        throw new Error('로그인 세션을 확인하지 못했습니다.');
      }

      const inputValue = runtimeState.input.trim();
      let resultText = '';

      if ((currentTurn?.input?.mode || 'none') === 'none') {
        const aiResponse = await fetch('/api/chat/ai-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify({
            prompt: liveRuntime.runtimePrompt,
          }),
        });
        const aiJson = await aiResponse.json().catch(() => null);
        if (!aiResponse.ok || !aiJson?.ok) {
          throw new Error(aiJson?.detail || aiJson?.error || 'ai_proxy_failed');
        }
        resultText = typeof aiJson?.text === 'string' ? aiJson.text : '';
      } else {
        resultText = inputValue;
      }

      const response = await fetch('/api/text-battle/run-turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          textSessionId: id,
          actorId: resolvedActorId,
          session: runtimeSession,
          input: inputValue || null,
          result: resultText,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'run_turn_failed');
      }

      writeStoredTextBattleSession(id, json.session);
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        input: '',
        running: false,
        status:
          json.session?.status === 'completed'
            ? '전투가 종료되었습니다.'
            : '다음 장면으로 진행했습니다.',
        error: '',
      }));
      if (json.session?.status === 'completed') {
        clearActiveSessionRecord();
        router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
        return;
      }
      await refreshPayload();
    } catch (error) {
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: getBattleRunErrorMessage(error),
        status: '',
      }));
    }
  }

  async function handleSurrender() {
    if (!id || runtimeState.running || isEnded) return;
    setRuntimeState(prev => ({
      ...prev,
      running: true,
      status: '항복 처리 중입니다…',
      error: '',
    }));
    try {
      const {
        data: { session: authSession },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !authSession?.access_token) {
        throw new Error('로그인 세션을 확인하지 못했습니다.');
      }
      const response = await fetch('/api/text-battle/finish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          textSessionId: id,
          action: 'surrender',
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'finish_failed');
      }
      writeStoredTextBattleSession(id, json.session);
      clearActiveSessionRecord();
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        running: false,
        status: '항복으로 전투가 종료되었습니다.',
        error: '',
      }));
      router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
    } catch (error) {
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: getBattleRunErrorMessage(error),
        status: '',
      }));
    }
  }

  if (!id) {
    return <div style={{ padding: 20 }}>세션 ID가 지정되지 않았습니다.</div>;
  }

  if (state.loading) {
    return <div style={{ padding: 20 }}>텍스트 배틀을 불러오는 중입니다…</div>;
  }

  if (state.error) {
    return (
      <div style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>텍스트 배틀</h1>
        <p style={{ color: '#ef4444', fontSize: 14 }}>에러가 발생했습니다: {state.error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(30,64,175,0.18), transparent 30%), linear-gradient(180deg, #020617 0%, #0f172a 100%)',
        color: '#e2e8f0',
        padding: '16px 14px 40px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'grid', gap: 16, paddingTop: 120, paddingBottom: 360 }}>
        {teams.map((entry, index) => {
          const slot = anchorSlots[index % anchorSlots.length];
          const teamColor = teamColorMap[entry.team] || '#38bdf8';
          return (
            <div
              key={entry.team}
              style={{
                position: 'fixed',
                zIndex: 22,
                display: 'grid',
                gap: 10,
                width: slot.left === '50%' ? 'min(360px, calc(100vw - 80px))' : 'min(180px, calc(50vw - 28px))',
                ...slot,
                transform: slot.translateX ? `translateX(${slot.translateX})` : undefined,
              }}
            >
              <div
                style={{
                  alignSelf: slot.align,
                  justifySelf: slot.justify,
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'rgba(2,6,23,0.82)',
                  border: `1px solid ${teamColor}55`,
                  color: teamColor,
                  fontSize: 12,
                  fontWeight: 800,
                  backdropFilter: 'blur(10px)',
                }}
              >
                팀 {entry.team}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  justifyContent: slot.justify,
                }}
              >
                {entry.members.map(participant => {
                  const eliminated = String(participant.outcome || '').toLowerCase() === 'eliminated';
                  const isActing = participant.id === resolvedActorId;
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => handleParticipantTap(participant)}
                      onDoubleClick={() => setDetailParticipant(participant)}
                      style={{
                        width: 74,
                        display: 'grid',
                        gap: 6,
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 74,
                          height: 74,
                          borderRadius: 20,
                          overflow: 'hidden',
                          border: `2px solid ${isActing ? '#f8fafc' : teamColor}`,
                          boxShadow: isActing ? `0 0 0 3px ${teamColor}55` : 'none',
                          background: 'rgba(15,23,42,0.9)',
                          filter: eliminated ? 'grayscale(1) brightness(0.7)' : 'none',
                        }}
                      >
                        {participant.image_url ? (
                          <img
                            src={participant.image_url}
                            alt={participant.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'grid',
                              placeItems: 'center',
                              color: teamColor,
                              fontWeight: 800,
                              fontSize: 24,
                            }}
                          >
                            {(participant.name || '?').slice(0, 1)}
                          </div>
                        )}
                      </div>
                      <div style={{ color: '#e2e8f0', fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>
                        {shortText(participant.name, 18)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <header
          style={{
            borderRadius: 24,
            padding: '18px 18px 16px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.9) 100%)',
            border: '1px solid rgba(59,130,246,0.35)',
            boxShadow: '0 24px 60px -40px rgba(15,23,42,0.95)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc' }}>텍스트 배틀</h1>
              <p style={{ margin: 0, fontSize: 12, color: '#93c5fd' }}>세션 ID: {id}</p>
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: statusTone.bg,
                border: `1px solid ${statusTone.border}`,
                color: statusTone.text,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {runtimeSession?.status || dbSession?.status || 'active'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>
              현재 턴: <strong style={{ color: '#f8fafc' }}>{currentTurn?.title || currentTurn?.id || '없음'}</strong>
            </span>
            {currentActor ? (
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                행동 주체: <strong style={{ color: '#fbbf24' }}>{currentActor.name}</strong>
              </span>
            ) : null}
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>
              턴 수: <strong style={{ color: '#f8fafc' }}>{turns.length}</strong>
            </span>
          </div>
        </header>

        <section
          style={{
            borderRadius: 24,
            padding: 22,
            background: 'rgba(2,6,23,0.86)',
            border: '1px solid rgba(59,130,246,0.18)',
            display: 'grid',
            gap: 18,
            minHeight: 360,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7dd3fc', textTransform: 'uppercase' }}>
              Current Situation
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f8fafc' }}>
              {currentTurn?.title || '턴이 없습니다'}
            </h2>
          </div>

          <div
            style={{
              borderRadius: 24,
              minHeight: 240,
              background:
                activeDialogueSpeaker?.background_url
                  ? `linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.78) 100%), url(${activeDialogueSpeaker.background_url}) center/cover`
                  : 'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.72) 100%)',
              border: '1px solid rgba(71,85,105,0.45)',
              position: 'relative',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              boxSizing: 'border-box',
            }}
          >
            {activeDialogueSpeaker?.image_url ? (
              <img
                src={activeDialogueSpeaker.image_url}
                alt={activeDialogueSpeaker.name}
                style={{
                  position: 'absolute',
                  inset: 'auto 50% -26px auto',
                  transform: 'translateX(50%)',
                  height: '100%',
                  maxHeight: 280,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 24px 36px rgba(2,6,23,0.72))',
                  opacity: 0.92,
                }}
              />
            ) : null}
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                gap: 8,
                justifyItems: 'center',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>현재 장면</div>
              <strong style={{ color: '#f8fafc', fontSize: 20 }}>
                {activeDialogueSpeaker?.name || currentActor?.name || '시스템'}
              </strong>
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>
                {activeDialogueSpeaker?.slot_label || activeDialogueSpeaker?.role || '장면 진행 중'}
              </span>
            </div>
          </div>

          {(currentTurn?.input?.mode || 'none') !== 'none' ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                borderRadius: 18,
                padding: 14,
                background: 'rgba(15,23,42,0.7)',
                border: '1px solid rgba(56,189,248,0.22)',
              }}
            >
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                {currentTurn?.input?.label || '행동 입력'}
              </div>
              <textarea
                value={runtimeState.input}
                onChange={event => setRuntimeState(prev => ({ ...prev, input: event.target.value }))}
                rows={3}
                placeholder={currentTurn?.input?.placeholder || '무엇을 할지 입력하세요'}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.9)',
                  background: '#020617',
                  color: '#e2e8f0',
                  padding: '12px 14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                borderRadius: 18,
                padding: '12px 14px',
                background: 'rgba(15,23,42,0.62)',
                border: '1px solid rgba(71,85,105,0.35)',
                fontSize: 13,
                lineHeight: 1.6,
                color: '#cbd5e1',
              }}
            >
              이 턴은 자동 실행됩니다. 현재 턴 프롬프트와 캐릭터 AI 문맥을 합쳐 행동을 생성합니다.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleRunTurn}
              disabled={runtimeState.running || !currentTurn}
              style={{
                padding: '12px 16px',
                borderRadius: 14,
                border: 'none',
                background: runtimeState.running ? '#334155' : '#38bdf8',
                color: runtimeState.running ? '#cbd5e1' : '#020617',
                fontWeight: 800,
                cursor: runtimeState.running ? 'wait' : 'pointer',
                minWidth: 140,
              }}
            >
              {runtimeState.running
                ? '실행 중…'
                : (currentTurn?.input?.mode || 'none') === 'none'
                  ? 'AI 턴 실행'
                  : '행동 제출'}
            </button>
            {!isEnded ? (
              <button
                type="button"
                onClick={handleSurrender}
                disabled={runtimeState.running}
                style={{
                  padding: '12px 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: 'rgba(127,29,29,0.42)',
                  color: '#fecaca',
                  fontWeight: 800,
                  cursor: runtimeState.running ? 'wait' : 'pointer',
                }}
              >
                항복
              </button>
            ) : null}
            {runtimeState.status ? (
              <span style={{ fontSize: 12, color: '#93c5fd' }}>{runtimeState.status}</span>
            ) : null}
            {runtimeState.error ? (
              <span style={{ fontSize: 12, color: '#fca5a5' }}>{runtimeState.error}</span>
            ) : null}
          </div>
        </section>

        <section
          style={{
            borderRadius: 20,
            padding: 16,
            background: 'rgba(2,6,23,0.78)',
            border: '1px solid rgba(71,85,105,0.32)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>전투 요약</h2>
            <button
              type="button"
              onClick={() => setRuntimeState(prev => ({ ...prev, showDebug: !prev.showDebug }))}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid rgba(71,85,105,0.7)',
                background: 'rgba(15,23,42,0.82)',
                color: '#cbd5e1',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {runtimeState.showDebug ? '세부 숨기기' : '세부 보기'}
            </button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
            {lastTurn?.ai_response || lastTurn?.prompt || '마지막 장면 요약이 아직 없습니다.'}
          </div>
          {isEnded ? (
            <div
              style={{
                borderRadius: 16,
                padding: '12px 14px',
                background: 'rgba(20,83,45,0.2)',
                border: '1px solid rgba(74,222,128,0.24)',
                display: 'grid',
                gap: 6,
              }}
            >
              <strong style={{ color: '#dcfce7', fontSize: 14 }}>
                전투 종료
              </strong>
              <div style={{ fontSize: 12, color: '#bbf7d0' }}>
                상태: {sessionStatus || 'completed'}
              </div>
              {dbSession?.winner ? (
                <div style={{ fontSize: 12, color: '#bbf7d0' }}>승자: {String(dbSession.winner)}</div>
              ) : null}
              {dbSession?.final_score ? (
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: '#d1fae5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(dbSession.final_score, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
          {runtimeState.showDebug ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <details
                open
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  현재 턴 실행 프롬프트
                </summary>
                <pre
                  style={{
                    margin: '10px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: '#cbd5e1',
                  }}
                >
                  {liveRuntime.runtimePrompt || '없음'}
                </pre>
              </details>
              <details
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  현재 턴 문맥
                </summary>
                <pre
                  style={{
                    margin: '10px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 11,
                    lineHeight: 1.6,
                    color: '#cbd5e1',
                  }}
                >
                  {JSON.stringify(livePromptContext || {}, null, 2)}
                </pre>
              </details>
              <details
                style={{
                  borderRadius: 14,
                  border: '1px solid rgba(71,85,105,0.52)',
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.7)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13, color: '#bfdbfe', fontWeight: 700 }}>
                  캐릭터 AI 게임 문맥
                </summary>
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {(liveRuntime.agentContexts?.length ? liveRuntime.agentContexts : agentContexts).map(entry => (
                    <details
                      key={entry.heroId || entry.id}
                      style={{
                        borderRadius: 12,
                        border: '1px solid rgba(51,65,85,0.8)',
                        padding: '8px 10px',
                        background: 'rgba(2,6,23,0.78)',
                      }}
                    >
                      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#f8fafc', fontWeight: 700 }}>
                        {entry.name}
                      </summary>
                      <pre
                        style={{
                          margin: '8px 0 0',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: '#cbd5e1',
                        }}
                      >
                        {entry.context}
                      </pre>
                    </details>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </section>
      </div>
      {activeSceneCue ? (
        <div
          style={{
            position: 'fixed',
            [activeSceneCue.placement]: 22,
            bottom: 328,
            zIndex: 32,
            width: 'min(320px, calc(100vw - 40px))',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              borderRadius: 22,
              padding: '16px 18px',
              background: 'linear-gradient(180deg, rgba(2,6,23,0.94) 0%, rgba(15,23,42,0.9) 100%)',
              border: '1px solid rgba(125,211,252,0.3)',
              boxShadow: '0 24px 60px -30px rgba(15,23,42,0.95)',
            }}
          >
            <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 800 }}>{activeSceneCue.title}</div>
            <div
              style={{
                marginTop: 8,
                paddingTop: 10,
                borderTop: '1px solid rgba(148,163,184,0.18)',
                color: '#cbd5e1',
                fontSize: 13,
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
              }}
            >
              {activeSceneCue.subtitle || ' '}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setHistoryOpen(prev => !prev)}
        style={{
          position: 'fixed',
          right: 18,
          bottom: historyOpen ? 392 : 304,
          zIndex: 28,
          padding: '12px 14px',
          borderRadius: 18,
          border: '1px solid rgba(96,165,250,0.28)',
          background: 'rgba(2,6,23,0.86)',
          color: '#e2e8f0',
          fontWeight: 800,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 18px 40px -26px rgba(15,23,42,0.95)',
        }}
      >
        지난 턴 {historyOpen ? '닫기' : `${historyTurns.length}개`}
      </button>
      <div
        style={{
          position: 'fixed',
          right: 18,
          bottom: 354,
          zIndex: 27,
          width: 'min(360px, calc(100vw - 28px))',
          maxHeight: historyOpen ? '44vh' : 0,
          opacity: historyOpen ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 180ms ease, opacity 180ms ease',
          pointerEvents: historyOpen ? 'auto' : 'none',
        }}
      >
        <section
          ref={logRef}
          style={{
            borderRadius: 22,
            padding: 14,
            background: 'rgba(2,6,23,0.92)',
            border: '1px solid rgba(96,165,250,0.24)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 28px 70px -34px rgba(15,23,42,0.95)',
            display: 'grid',
            gap: 10,
            maxHeight: '44vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <strong style={{ color: '#f8fafc', fontSize: 14 }}>지난 턴</strong>
            <span style={{ color: '#93c5fd', fontSize: 12 }}>{historyTurns.length}개</span>
          </div>
          {historyTurns.length ? (
            historyTurns.map(turn => (
              <article
                key={turn.id || `${turn.session_id}:${turn.turn_index}`}
                style={{
                  borderRadius: 16,
                  padding: '10px 12px',
                  background: 'rgba(15,23,42,0.82)',
                  border: '1px solid rgba(51,65,85,0.7)',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 11, color: '#93c5fd' }}>턴 {turn.turn_index}</span>
                  <span style={{ fontSize: 11, color: '#f8fafc' }}>{turn.result || '-'}</span>
                </div>
                <div style={{ fontSize: 12, color: '#dbeafe', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {shortText(turn.ai_response || turn.prompt || '로그가 없습니다.', 180)}
                </div>
              </article>
            ))
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>아직 지난 턴이 없습니다.</div>
          )}
        </section>
      </div>
      <section
        onClick={handleAdvanceDialogue}
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 126,
          transform: 'translateX(-50%)',
          zIndex: 26,
          width: 'min(860px, calc(100vw - 24px))',
          borderRadius: 24,
          padding: '16px 18px 18px',
          background: 'linear-gradient(180deg, rgba(2,6,23,0.95) 0%, rgba(15,23,42,0.94) 100%)',
          border: '1px solid rgba(96,165,250,0.24)',
          boxShadow: '0 28px 80px -38px rgba(15,23,42,0.96)',
          backdropFilter: 'blur(16px)',
          display: 'grid',
          gap: 14,
          cursor: sceneSegments.length ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                overflow: 'hidden',
                flexShrink: 0,
                border: `1px solid ${(activeDialogueSpeaker && teamColorMap[String(activeDialogueSpeaker.team || '미지정')]) || '#38bdf8'}66`,
                background: 'rgba(15,23,42,0.9)',
              }}
            >
              {activeDialogueSpeaker?.image_url ? (
                <img src={activeDialogueSpeaker.image_url} alt={activeDialogueSpeaker.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#93c5fd', fontWeight: 800 }}>
                  {(activeDialogueSpeaker?.name || '?').slice(0, 1)}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <strong style={{ color: '#f8fafc', fontSize: 16 }}>{activeSegment?.speaker || activeDialogueSpeaker?.name || '시스템'}</strong>
              <span style={{ color: '#93c5fd', fontSize: 12 }}>
                {activeSegmentTone.label}
              </span>
            </div>
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>
            {sceneSegments.length ? `${dialogueState.segmentIndex + 1} / ${sceneSegments.length}` : '표시할 문장 없음'}
            <br />
            탭: 스킵 / 다음
          </div>
        </div>

        <div
          style={{
            minHeight: 78,
            color: activeSegmentTone.color,
            fontSize: 16,
            lineHeight: 1.85,
            whiteSpace: 'pre-wrap',
            textAlign: activeSegmentTone.textAlign,
            fontStyle: activeSegmentTone.fontStyle,
          }}
        >
          {activeSegment?.type === 'sceneCue'
            ? `${activeSceneCue?.title || ''}${activeSceneCue?.subtitle ? `\n${activeSceneCue.subtitle}` : ''}`.trim()
            : typedSegmentText || currentTurn?.display || lastTurn?.ai_response || '현재 표시할 장면이 없습니다.'}
        </div>

        {(currentTurn?.input?.mode || 'none') !== 'none' ? (
          <div
            onClick={event => event.stopPropagation()}
            style={{
              display: 'grid',
              gap: 10,
              borderTop: '1px solid rgba(71,85,105,0.32)',
              paddingTop: 12,
            }}
          >
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>{currentTurn?.input?.label || '행동 입력'}</div>
            <textarea
              value={runtimeState.input}
              onChange={event => setRuntimeState(prev => ({ ...prev, input: event.target.value }))}
              rows={2}
              placeholder={currentTurn?.input?.placeholder || '무엇을 할지 입력하세요'}
              style={{
                width: '100%',
                borderRadius: 14,
                border: '1px solid rgba(71,85,105,0.9)',
                background: '#020617',
                color: '#e2e8f0',
                padding: '12px 14px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ) : null}

        <div
          onClick={event => event.stopPropagation()}
          style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <button
            type="button"
            onClick={handleRunTurn}
            disabled={runtimeState.running || !currentTurn}
            style={{
              padding: '12px 16px',
              borderRadius: 14,
              border: 'none',
              background: runtimeState.running ? '#334155' : '#38bdf8',
              color: runtimeState.running ? '#cbd5e1' : '#020617',
              fontWeight: 800,
              cursor: runtimeState.running ? 'wait' : 'pointer',
              minWidth: 140,
            }}
          >
            {runtimeState.running
              ? '실행 중…'
              : (currentTurn?.input?.mode || 'none') === 'none'
                ? 'AI 턴 실행'
                : '행동 제출'}
          </button>
          {!isEnded ? (
            <button
              type="button"
              onClick={handleSurrender}
              disabled={runtimeState.running}
              style={{
                padding: '12px 16px',
                borderRadius: 14,
                border: '1px solid rgba(248,113,113,0.45)',
                background: 'rgba(127,29,29,0.42)',
                color: '#fecaca',
                fontWeight: 800,
                cursor: runtimeState.running ? 'wait' : 'pointer',
              }}
            >
              항복
            </button>
          ) : null}
          {runtimeState.status ? <span style={{ fontSize: 12, color: '#93c5fd' }}>{runtimeState.status}</span> : null}
          {runtimeState.error ? <span style={{ fontSize: 12, color: '#fca5a5' }}>{runtimeState.error}</span> : null}
        </div>
      </section>
      <CharacterRouteHud hero={activeHero} />
      <CharacterDetailOverlay participant={detailParticipant} onClose={() => setDetailParticipant(null)} />
    </div>
  );
}
