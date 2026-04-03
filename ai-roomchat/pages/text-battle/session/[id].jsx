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
import { parseStructuredBattleResult } from '@/lib/battle/resultSchema';
import {
  buildRuntimePromptFromTurn,
} from '@/lib/battle/agentRuntime';
import {
  clearActiveSessionRecord,
} from '@/lib/rank/activeSessionStorage';
import CharacterDetailOverlay from '@/components/character/CharacterDetailOverlay';

function shortText(value, limit = 90) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

function getBattleRunErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('quota_exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('retry in')
  ) {
    return '요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 AI 키를 바꿔주세요.';
  }
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

function getBattleRunErrorKind(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('quota_exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('retry in')
  ) {
    return 'quota';
  }
  if (
    message.includes('invalid api key') ||
    message.includes('api key') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return 'api_key';
  }
  return 'generic';
}

function isFormatLikeErrorMessage(value) {
  const message = String(value || '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('json') ||
    message.includes('format') ||
    message.includes('schema') ||
    message.includes('parse') ||
    message.includes('segment') ||
    message.includes('structured')
  );
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

function looksLikeParticipantRuntimeId(value) {
  return /^participant-[a-f0-9-]+$/i.test(String(value || '').trim());
}

function extractRenderableSceneText(value) {
  const parsed = parseJsonLikeText(value);
  if (Array.isArray(parsed?.segments) && parsed.segments.length) {
    const firstText = parsed.segments
      .map(segment => String(segment?.text || '').trim())
      .find(Boolean);
    if (firstText) return firstText;
  }
  if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim()) {
    return parsed.reply.trim();
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('```')) return '';
  return text;
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

function upsertTurnList(turns, incomingTurn) {
  const current = Array.isArray(turns) ? turns : [];
  if (!incomingTurn || typeof incomingTurn !== 'object') {
    return current;
  }
  if (Number(incomingTurn.turn_index) < 0) {
    return current;
  }

  const next = current.slice();
  const existingIndex = next.findIndex(turn =>
    (turn?.id && incomingTurn?.id && String(turn.id) === String(incomingTurn.id)) ||
    Number(turn?.turn_index) === Number(incomingTurn.turn_index)
  );

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      ...incomingTurn,
    };
  } else {
    next.push(incomingTurn);
  }

  next.sort((left, right) => Number(left?.turn_index || 0) - Number(right?.turn_index || 0));
  return next;
}

function getTypingDelay(segment, visibleChars) {
  const text = segment?.text || '';
  const delivery = String(segment?.delivery || '').toLowerCase();
  const nextChar = text.charAt(visibleChars) || '';
  const previousSlice = text.slice(Math.max(0, visibleChars - 3), visibleChars + 1);

  let delay = 28;
  if (delivery === 'calm') delay = 36;
  if (delivery === 'urgent') delay = 18;
  if (delivery === 'hesitant') delay = 46;
  if (delivery === 'angry') delay = 22;

  if (previousSlice.includes('...') || previousSlice.includes('…')) {
    delay += delivery === 'hesitant' ? 180 : 110;
  }
  if (/[,.!?]/.test(nextChar)) {
    delay += 48;
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

function resolveParticipantByScope(participants, scope, fallbackParticipant = null) {
  const value = String(scope || '').trim();
  if (!value || value === 'inherit') return fallbackParticipant;
  if (value === 'self') return fallbackParticipant;
  if (value.startsWith('role:')) {
    const roleName = value.slice(5).trim();
    return participants.find(participant => String(participant.role || '').trim() === roleName) || fallbackParticipant;
  }
  if (value.startsWith('slot:')) {
    const slotLabel = value.slice(5).trim();
    return participants.find(participant => String(participant.slot_label || '').trim() === slotLabel) || fallbackParticipant;
  }
  return participants.find(participant =>
    [participant.id, participant.hero_id, participant.name].map(entry => String(entry || '').trim()).includes(value)
  ) || fallbackParticipant;
}

function resolvePresentationAsset(source, value, fallbackParticipant, key) {
  const mode = String(source || 'inherit').trim();
  if (mode === 'none' || mode === 'stop') return null;
  if (mode === 'self') return fallbackParticipant?.[key] || null;
  if (mode === 'custom') return String(value || '').trim() || null;
  return null;
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
    errorKind: '',
    showDebug: false,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailParticipant, setDetailParticipant] = useState(null);
  const [latestTurnOverride, setLatestTurnOverride] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSubmitting, setApiSubmitting] = useState(false);
  const [apiSaveStatus, setApiSaveStatus] = useState('');
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
        const remoteSession = hydrateRuntimeSession(json?.runtimeSession);
        setState({
          loading: false,
          error: null,
          payload: json,
        });
        setRuntimeState(prev => ({
          ...prev,
          session: remoteSession || null,
        }));
      })
      .catch(err => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err?.message || String(err),
          payload: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setLatestTurnOverride(null);
  }, [id]);


  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.payload?.turns?.length, runtimeState.status]);

  const payload = state.payload || {};
  const dbSession = payload.session || null;
  const runtimeSession = runtimeState.session || null;
  const currentTurn = runtimeSession ? getCurrentTurn(runtimeSession) : null;
  const currentPresentation = currentTurn?.presentation || {};
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
  const viewerHeroId = useMemo(() => {
    const ownerId = String(dbSession?.owner_id || '').trim();
    if (!ownerId) return participants[0]?.hero_id || '';
    return (
      participants.find(participant => String(participant?.owner_id || '').trim() === ownerId)?.hero_id ||
      participants[0]?.hero_id ||
      ''
    );
  }, [dbSession?.owner_id, participants]);
  const currentActor = useMemo(
    () => participants.find(participant => participant.id === resolvedActorId) || null,
    [participants, resolvedActorId]
  );
  const lastTurn = turns.length ? turns[turns.length - 1] : null;
  const sessionStatus = runtimeSession?.status || dbSession?.status || '';
  const isEnded = ['completed', 'abandoned', 'defeated', 'closed', 'ended', 'cancelled', 'canceled'].includes(
    String(sessionStatus || '').toLowerCase()
  );
  const historyTurns = turns.slice(0, -1);
  const showApiKeyRecovery = runtimeState.errorKind === 'api_key';
  const featuredTurn = latestTurnOverride || (turns.length ? turns[turns.length - 1] : null);
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
  const featuredStructuredResult = useMemo(
    () => parseStructuredBattleResult(featuredTurn?.ai_response || ''),
    [featuredTurn?.ai_response]
  );
  const liveParticipantOutcomes =
    featuredStructuredResult.participantOutcomes &&
    typeof featuredStructuredResult.participantOutcomes === 'object'
      ? featuredStructuredResult.participantOutcomes
      : {};
  const sceneSource =
    featuredTurn?.ai_response || featuredStructuredResult.reply || featuredTurn?.display || currentTurn?.display || '';
  const sceneSegments = useMemo(() => toSceneSegments(sceneSource, participants), [participants, sceneSource]);
  const hasRenderableScene = Boolean(
    turns.length &&
      (sceneSegments.length ||
        extractRenderableSceneText(featuredTurn?.ai_response) ||
        extractRenderableSceneText(featuredTurn?.display))
  );
  const showPrelude =
    !showApiKeyRecovery &&
    !isEnded &&
    ((runtimeState.running && !hasRenderableScene) || (!turns.length && !hasRenderableScene));
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
  const activeSpeakerLabel =
    activeDialogueSpeaker?.name ||
    (looksLikeParticipantRuntimeId(activeSegment?.speaker) ? '' : String(activeSegment?.speaker || '').trim()) ||
    '시스템';
  const focusedParticipant = resolveParticipantByScope(participants, currentPresentation.focusCharacter, activeDialogueSpeaker);
  const stageBackgroundUrl =
    resolvePresentationAsset(
      currentPresentation.backgroundSource,
      currentPresentation.backgroundValue,
      focusedParticipant,
      'background_url'
    ) || activeDialogueSpeaker?.background_url || null;
  const activeSegmentTone = getSegmentTone(activeSegment);
  const activeSceneCue =
    activeSegment?.type === 'sceneCue'
      ? {
          placement: activeSegment.placement === 'right' ? 'right' : 'left',
          title: activeSegment.title || activeDialogueSpeaker?.name || (looksLikeParticipantRuntimeId(activeSegment?.speaker) ? '' : activeSegment.speaker) || '장면 전환',
          subtitle: activeSegment.subtitle || activeSegment.text || '',
        }
      : null;
  const safeFallbackText =
    extractRenderableSceneText(featuredTurn?.ai_response) ||
    extractRenderableSceneText(lastTurn?.ai_response) ||
    '현재 표시할 장면이 없습니다.';
  const preludeProgressLabel = showApiKeyRecovery
    ? 'AI 키 확인 필요'
    : runtimeState.running
      ? runtimeState.status || '첫 장면을 준비하는 중입니다…'
      : runtimeState.error
        ? runtimeState.error
        : '첫 장면을 준비하는 중입니다…';
  const preludeProgressValue = showApiKeyRecovery
    ? 100
    : runtimeState.error
      ? 100
      : runtimeState.running
        ? 72
        : 28;
  const preludeBackgroundUrl =
    stageBackgroundUrl ||
    participants.find(participant => participant?.background_url)?.background_url ||
    participants.find(participant => participant?.image_url)?.image_url ||
    null;

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

  async function refreshPayload(options = {}) {
    const waitForFirstScene = Boolean(options.waitForFirstScene);

    for (let attempt = 0; attempt < (waitForFirstScene ? 5 : 1); attempt += 1) {
      const response = await fetch(`/api/text-battle/session?id=${encodeURIComponent(id)}`);
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.detail || json?.error || 'failed_to_refresh');
      }

      const nextTurns = Array.isArray(json?.turns) ? json.turns : [];
      const nextFeaturedTurn = nextTurns.length ? nextTurns[nextTurns.length - 1] : null;
      const nextSceneText = extractRenderableSceneText(nextFeaturedTurn?.ai_response) || extractRenderableSceneText(nextFeaturedTurn?.display);
      const hasScene = Boolean(nextTurns.length && nextSceneText);

      setState({
        loading: false,
        error: null,
        payload: json,
      });
      setLatestTurnOverride(nextFeaturedTurn || null);

      if (!waitForFirstScene || hasScene) {
        return json;
      }

      await new Promise(resolve => {
        window.setTimeout(resolve, 450);
      });
    }
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
    const wasPreludeTurn = !turns.length;
    setRuntimeState(prev => ({
      ...prev,
      running: true,
      status:
        (currentTurn?.input?.mode || 'none') === 'none'
          ? 'AI가 행동을 생성하는 중입니다…'
          : '행동을 처리하는 중입니다…',
      error: '',
      errorKind: '',
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
      let resultText = null;

      if ((currentTurn?.input?.mode || 'none') === 'none') {
        setRuntimeState(prev => ({
          ...prev,
          status: 'AI가 행동을 생성하는 중입니다…',
        }));
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

      const nextTurns = upsertTurnList(state.payload?.turns, json.turn);
      setLatestTurnOverride(json.turn || null);
      if (nextTurns !== state.payload?.turns) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: null,
          payload: {
            ...(prev.payload || {}),
            turns: nextTurns,
          },
        }));
      }
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        input: '',
        running: json.session?.status === 'completed' ? false : prev.running,
        status:
          json.session?.status === 'completed'
            ? '전투가 종료되었습니다.'
            : wasPreludeTurn
              ? '첫 장면을 준비하는 중입니다…'
              : '다음 장면으로 진행했습니다.',
        error: '',
        errorKind: '',
      }));
      if (json.session?.status === 'completed') {
        clearActiveSessionRecord();
        router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
        return;
      }
      await refreshPayload({ waitForFirstScene: wasPreludeTurn && !nextTurns.length });
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        status: '다음 장면으로 진행했습니다.',
      }));
    } catch (error) {
      const friendly = getBattleRunErrorMessage(error);
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: friendly,
        errorKind: getBattleRunErrorKind(error),
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
      errorKind: '',
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
      clearActiveSessionRecord();
      setRuntimeState(prev => ({
        ...prev,
        session: hydrateRuntimeSession(json.session),
        running: false,
        status: '항복으로 전투가 종료되었습니다.',
        error: '',
        errorKind: '',
      }));
      router.replace(`/battle-log/${encodeURIComponent(String(id))}?source=text-battle`);
    } catch (error) {
      const friendly = getBattleRunErrorMessage(error);
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        error: friendly,
        errorKind: getBattleRunErrorKind(error),
        status: '',
      }));
    }
  }

  async function handleRegisterApiKey() {
    const apiKey = apiKeyInput.trim();
    if (!apiKey || apiSubmitting) return;
    let shouldRetryAfterSave = false;
    setApiSubmitting(true);
    setApiSaveStatus('');
    try {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const token = authSession?.access_token || '';
      if (!token) {
        throw new Error('로그인이 필요합니다.');
      }
      const response = await fetch('/api/rank/user-api-keyring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          apiKey,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'API 키를 저장하지 못했습니다.');
      }
      setApiKeyInput('');
      setApiSaveStatus('API 키를 저장했습니다. 자동으로 다시 시도합니다.');
      setRuntimeState(prev => ({
        ...prev,
        running: false,
        status: '저장한 키로 다시 시도하는 중입니다…',
        error: '',
        errorKind: '',
      }));
      autoRunRef.current = false;
      shouldRetryAfterSave = Boolean(currentTurn) && !isEnded;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('rank-keyring:refresh'));
      }
    } catch (error) {
      setApiSaveStatus(error.message || 'API 키를 저장하지 못했습니다.');
    } finally {
      setApiSubmitting(false);
      if (shouldRetryAfterSave) {
        setTimeout(() => {
          handleRunTurn();
        }, 180);
      }
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
        background: '#020617',
        color: '#e2e8f0',
        padding: 0,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', margin: '0 auto', display: 'grid', gap: 0, paddingTop: 0, paddingBottom: 0 }}>
        {(showPrelude || showApiKeyRecovery) ? (
          <section
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 120,
              padding: '24px 18px 140px',
              background:
                preludeBackgroundUrl
                  ? `linear-gradient(180deg, rgba(2,6,23,0.24) 0%, rgba(2,6,23,0.94) 100%), url(${preludeBackgroundUrl}) center/cover`
                  : 'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(2,6,23,0.98) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                width: 'min(920px, 100%)',
                borderRadius: 28,
                padding: 24,
                border: '1px solid rgba(96,165,250,0.24)',
                boxShadow: '0 28px 80px -40px rgba(15,23,42,0.94)',
                background: 'linear-gradient(180deg, rgba(2,6,23,0.42) 0%, rgba(2,6,23,0.78) 100%)',
                backdropFilter: 'blur(6px)',
                display: 'grid',
                gap: 18,
                minHeight: 320,
              }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <strong style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>
                  {showApiKeyRecovery ? 'AI 키 확인이 필요합니다' : '전투 준비 중'}
                </strong>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 }}>
                  {showApiKeyRecovery
                    ? '캐릭터 페이지에서 ai키를 새로 갱신해주세요.'
                    : '첫 장면을 준비하고 있습니다. 잠시 후 자동으로 첫 턴이 진행됩니다.'}
                </p>
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: '12px 14px',
                  borderRadius: 18,
                  background: 'rgba(2,6,23,0.52)',
                  border: showApiKeyRecovery
                    ? '1px solid rgba(248,113,113,0.3)'
                    : '1px solid rgba(96,165,250,0.22)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#cbd5e1' }}>
                  <span>{preludeProgressLabel}</span>
                  <span>{preludeProgressValue}%</span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'rgba(30,41,59,0.88)',
                  }}
                >
                  <div
                    style={{
                      width: `${preludeProgressValue}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: showApiKeyRecovery
                        ? 'linear-gradient(90deg, #f87171 0%, #fb7185 100%)'
                        : 'linear-gradient(90deg, #38bdf8 0%, #7dd3fc 100%)',
                      transition: 'width 220ms ease',
                    }}
                  />
                </div>
                {runtimeState.error && !showApiKeyRecovery ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#fecaca',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                    }}
                  >
                    오류: {runtimeState.error}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                {teams.map(entry => (
                  <div key={`prelude-team-${entry.team}`} style={{ display: 'grid', gap: 10 }}>
                    <div
                      style={{
                        color: teamColorMap[entry.team] || '#38bdf8',
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      팀 {entry.team}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {entry.members.map(participant => (
                        <div
                          key={`prelude-member-${participant.id}`}
                          style={{
                            width: 86,
                            display: 'grid',
                            gap: 8,
                            justifyItems: 'center',
                          }}
                        >
                          <div
                            style={{
                              width: 86,
                              height: 106,
                              borderRadius: 20,
                              overflow: 'hidden',
                              border: `2px solid ${teamColorMap[entry.team] || '#38bdf8'}`,
                              background: 'rgba(15,23,42,0.88)',
                              boxShadow: '0 18px 44px -28px rgba(15,23,42,0.96)',
                            }}
                          >
                            {participant.image_url || participant.background_url ? (
                              <img
                                src={participant.image_url || participant.background_url}
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
                                  color: '#cbd5e1',
                                  fontSize: 28,
                                  fontWeight: 800,
                                }}
                              >
                                {(participant.name || '?').slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                            {shortText(participant.name, 18)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {showApiKeyRecovery ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={event => setApiKeyInput(event.target.value)}
                      placeholder="새 API 키를 붙여넣습니다."
                      style={{
                        width: '100%',
                        borderRadius: 14,
                        border: '1px solid rgba(248,113,113,0.28)',
                        background: 'rgba(15,23,42,0.88)',
                        color: '#f8fafc',
                        padding: '12px 14px',
                        boxSizing: 'border-box',
                      }}
                    />
                    {apiSaveStatus ? (
                      <div style={{ fontSize: 12, color: apiSaveStatus.includes('저장했습니다') ? '#93c5fd' : '#fecaca' }}>
                        {apiSaveStatus}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleRegisterApiKey}
                      disabled={apiSubmitting || !apiKeyInput.trim()}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 14,
                        border: '1px solid rgba(96,165,250,0.28)',
                        background: apiSubmitting ? 'rgba(51,65,85,0.88)' : 'rgba(15,23,42,0.88)',
                        color: '#f8fafc',
                        fontWeight: 800,
                        cursor: apiSubmitting ? 'wait' : 'pointer',
                      }}
                    >
                      {apiSubmitting ? '저장 중…' : 'API 키 저장'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          viewerHeroId
                            ? `/character/${encodeURIComponent(String(viewerHeroId))}/agent`
                            : '/lobby'
                        )
                      }
                      style={{
                        padding: '12px 16px',
                        borderRadius: 14,
                        border: '1px solid rgba(96,165,250,0.2)',
                        background: 'rgba(15,23,42,0.66)',
                        color: '#dbeafe',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      캐릭터 페이지로 이동
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section
          style={{
            borderRadius: 24,
            padding: '12px 12px 0',
            background: 'transparent',
            border: 'none',
            display: 'grid',
            gap: 12,
            minHeight: '100vh',
          }}
        >
          <div
            style={{
              borderRadius: 24,
              minHeight: '100vh',
              background:
                stageBackgroundUrl
                  ? `linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.78) 100%), url(${stageBackgroundUrl}) center/cover`
                  : 'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.72) 100%)',
              border: 'none',
              position: 'relative',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              padding: '54px 16px 220px',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.42) 14%, rgba(2,6,23,0.1) 28%, rgba(2,6,23,0.1) 72%, rgba(2,6,23,0.42) 86%, rgba(2,6,23,0.96) 100%), linear-gradient(180deg, rgba(2,6,23,0.56) 0%, rgba(2,6,23,0.05) 24%, rgba(2,6,23,0.05) 70%, rgba(2,6,23,0.9) 100%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                pointerEvents: 'none',
              }}
            >
              <div />
            </div>
            {activeDialogueSpeaker?.image_url || activeDialogueSpeaker?.background_url ? (
              <img
                src={activeDialogueSpeaker.image_url || activeDialogueSpeaker.background_url}
                alt={activeDialogueSpeaker.name}
                style={{
                  position: 'absolute',
                  inset: 'auto auto 120px 50%',
                  transform: `translateX(${activeSegment?.placement === 'right' ? '8%' : '-58%'})`,
                  height: '82%',
                  maxHeight: 520,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 34px 48px rgba(2,6,23,0.88))',
                  opacity: 0.96,
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

        {runtimeState.showDebug ? (
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
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>세부 정보</h2>
              <button
                type="button"
                onClick={() => setRuntimeState(prev => ({ ...prev, showDebug: false }))}
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
                세부 숨기기
              </button>
            </div>
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
          </section>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setHistoryOpen(prev => !prev)}
        aria-label="지난 대화 열기"
        style={{
          position: 'fixed',
          left: 18,
          top: 18,
          zIndex: 30,
          width: 44,
          height: 44,
          borderRadius: 14,
          border: '1px solid rgba(148,163,184,0.26)',
          background: 'rgba(2,6,23,0.78)',
          color: '#e2e8f0',
          fontSize: 18,
          fontWeight: 800,
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 18px 40px -26px rgba(15,23,42,0.95)',
        }}
      >
        ≡
      </button>
      {!runtimeState.showDebug ? (
        <button
          type="button"
          onClick={() => setRuntimeState(prev => ({ ...prev, showDebug: true }))}
          aria-label="세부 정보 열기"
          style={{
            position: 'fixed',
            right: 18,
            top: 18,
            zIndex: 30,
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(148,163,184,0.22)',
            background: 'rgba(2,6,23,0.72)',
            color: '#cbd5e1',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 18px 40px -26px rgba(15,23,42,0.95)',
          }}
        >
          세부
        </button>
      ) : null}
      {activeSceneCue ? (
        <div
          style={{
            position: 'fixed',
            [activeSceneCue.placement]: 0,
            top: '18vh',
            zIndex: 32,
            width: 'min(440px, calc(100vw - 18px))',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding:
                activeSceneCue.placement === 'right' ? '18px 22px 18px 64px' : '18px 64px 18px 22px',
              background:
                activeSceneCue.placement === 'right'
                  ? 'linear-gradient(90deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.26) 10%, rgba(2,6,23,0.58) 24%, rgba(2,6,23,0.8) 100%)'
                  : 'linear-gradient(270deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.26) 10%, rgba(2,6,23,0.58) 24%, rgba(2,6,23,0.8) 100%)',
              textAlign: activeSceneCue.placement === 'right' ? 'right' : 'left',
              animation: 'sceneCueSlide 420ms ease-out',
            }}
          >
            <div
              style={{
                color: '#f8fafc',
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.01em',
                textShadow: '0 2px 18px rgba(2,6,23,0.75)',
              }}
            >
              {activeSceneCue.title}
            </div>
            <div
              style={{
                marginTop: 7,
                color: 'rgba(226,232,240,0.94)',
                fontSize: 13,
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                textShadow: '0 2px 14px rgba(2,6,23,0.72)',
              }}
            >
              {activeSceneCue.subtitle || ' '}
            </div>
          </div>
        </div>
      ) : null}
      <style jsx global>{`
        @keyframes sceneCueSlide {
          0% {
            opacity: 0;
            transform: translateX(${activeSceneCue?.placement === 'right' ? '28px' : '-28px'});
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          left: 18,
          top: 72,
          zIndex: 27,
          width: 'min(320px, calc(100vw - 32px))',
          maxHeight: historyOpen ? '56vh' : 0,
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
            maxHeight: '56vh',
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
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 8,
          transform: 'translateX(-50%)',
          zIndex: 28,
          width: 'min(860px, calc(100vw - 18px))',
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
            maxWidth: '100%',
            padding: '6px 10px',
            borderRadius: 18,
            background: 'rgba(2,6,23,0.34)',
            backdropFilter: 'blur(10px)',
            overflowX: 'auto',
            pointerEvents: 'auto',
          }}
        >
          {teams.map(entry => (
            <div key={`mini-team-${entry.team}`} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
              <div style={{ color: teamColorMap[entry.team] || '#38bdf8', fontSize: 10, fontWeight: 800 }}>팀 {entry.team}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {entry.members.map(participant => {
                  const liveOutcome = [participant.id, participant.hero_id, participant.name]
                    .map(value => String(value || '').trim())
                    .find(key => key && liveParticipantOutcomes[key]);
                  const eliminated =
                    String(participant.outcome || (liveOutcome ? liveParticipantOutcomes[liveOutcome] : '') || '').toLowerCase() ===
                    'eliminated';
                  const isActing = participant.id === resolvedActorId;
                  const teamColor = teamColorMap[entry.team] || '#38bdf8';
                  return (
                    <button
                      key={`mini-participant-${participant.id}`}
                      type="button"
                      onClick={() => handleParticipantTap(participant)}
                      onDoubleClick={() => setDetailParticipant(participant)}
                      style={{
                        width: 38,
                        display: 'grid',
                        gap: 4,
                        justifyItems: 'center',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: `2px solid ${isActing ? '#f8fafc' : teamColor}`,
                          boxShadow: isActing ? `0 0 0 2px ${teamColor}55` : 'none',
                          background: 'rgba(15,23,42,0.88)',
                          filter: eliminated ? 'grayscale(1) brightness(0.62)' : 'none',
                        }}
                      >
                        {participant.image_url || participant.background_url ? (
                          <img
                            src={participant.image_url || participant.background_url}
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
                              fontSize: 14,
                            }}
                          >
                            {(participant.name || '?').slice(0, 1)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <section
        onClick={handleAdvanceDialogue}
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 58,
          transform: 'translateX(-50%)',
          zIndex: 26,
          width: 'min(860px, calc(100vw - 18px))',
          borderRadius: 0,
          padding: '10px 14px 12px',
          background: 'linear-gradient(180deg, rgba(2,6,23,0) 0%, rgba(2,6,23,0.42) 16%, rgba(2,6,23,0.78) 54%, rgba(2,6,23,0.9) 100%)',
          border: 'none',
          boxShadow: 'none',
          backdropFilter: 'none',
          display: 'grid',
          gap: 8,
          cursor: sceneSegments.length ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                overflow: 'hidden',
                flexShrink: 0,
                border: `1px solid ${(activeDialogueSpeaker && teamColorMap[String(activeDialogueSpeaker.team || '미지정')]) || '#38bdf8'}66`,
                background: 'rgba(15,23,42,0.9)',
              }}
            >
              {activeDialogueSpeaker?.image_url || activeDialogueSpeaker?.background_url ? (
                <img
                  src={activeDialogueSpeaker.image_url || activeDialogueSpeaker.background_url}
                  alt={activeDialogueSpeaker.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#93c5fd', fontWeight: 800 }}>
                  {(activeDialogueSpeaker?.name || '?').slice(0, 1)}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <strong style={{ color: '#f8fafc', fontSize: 15 }}>{activeSpeakerLabel}</strong>
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
            minHeight: 54,
            color: activeSegmentTone.color,
            fontSize: 14,
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
            textAlign: activeSegmentTone.textAlign,
            fontStyle: activeSegmentTone.fontStyle,
          }}
        >
          {activeSegment?.type === 'sceneCue'
            ? `${activeSceneCue?.title || ''}${activeSceneCue?.subtitle ? `\n${activeSceneCue.subtitle}` : ''}`.trim()
            : typedSegmentText || safeFallbackText}
        </div>

        {(currentTurn?.input?.mode || 'none') !== 'none' ? (
          <div
            onClick={event => event.stopPropagation()}
            style={{
              display: 'grid',
              gap: 10,
              borderTop: '1px solid rgba(71,85,105,0.32)',
              paddingTop: 10,
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
      <CharacterDetailOverlay participant={detailParticipant} onClose={() => setDetailParticipant(null)} />
    </div>
  );
}
