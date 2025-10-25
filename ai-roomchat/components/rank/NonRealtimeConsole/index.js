'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import styles from './NonRealtimeConsole.module.css';

import { supabase } from '@/lib/supabase';
import { loadGameBundle } from '@/components/rank/StartClient/engine/loadGameBundle';
import { createBridgeContext } from '@/components/rank/StartClient/engine/bridgeContext';
import { buildParticipantSlotMap, interpretPromptNode } from '@/lib/rank/promptInterpreter';
import { createAiHistory } from '@/lib/history';
import { parseOutcome } from '@/lib/promptEngine';
import { chooseNext } from '@/lib/bridgeEval';
import { makeCallModel } from '@/lib/modelClient';
import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODE_OPTIONS,
  ensureModelInCatalog,
  formatGeminiOptionLabel,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '@/lib/rank/geminiConfig';
import {
  START_SESSION_KEYS,
  readStartSessionValues,
  subscribeStartSession,
  writeStartSessionValue,
} from '@/lib/rank/startSessionChannel';

const WIN_TOKENS = new Set(['승', '승리', 'win', 'victory']);
const LOSE_TOKENS = new Set(['패', '패배', 'lose', 'defeat']);
const OUT_TOKENS = new Set([
  '탈락',
  '실격',
  'out',
  'eliminate',
  'eliminated',
  '관전',
  '관전자',
  '관전화',
  '퇴장',
  '은퇴',
]);
const DRAW_TOKENS = new Set(['무', '무승부', 'draw', 'none']);

function cleanTokenEdges(token) {
  if (!token) return '';
  return token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
}

function preprocessResultTokens(line) {
  if (!line) return [];
  return String(line)
    .replace(/[|·,:;\\/\u2010-\u2015\-]+/g, ' ')
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function normalizeNameKey(name) {
  return String(name || '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function detectDecisionTypeFromToken(token) {
  const cleaned = cleanTokenEdges(token).toLowerCase();
  if (!cleaned) return null;
  if (DRAW_TOKENS.has(cleaned)) return 'none';
  if (OUT_TOKENS.has(cleaned)) return 'out';
  if (LOSE_TOKENS.has(cleaned)) return 'lose';
  if (WIN_TOKENS.has(cleaned)) return 'win';
  return null;
}

function matchParticipantByName(participants = [], candidateName = '', line = '') {
  const normalizedCandidate = normalizeNameKey(candidateName);
  const normalizedLine = normalizeNameKey(line);
  let matched = null;
  participants.forEach((participant, index) => {
    if (matched) return;
    const heroName = participant?.hero?.name || participant?.hero_name || participant?.name || '';
    if (!heroName) return;
    const normalizedHero = normalizeNameKey(heroName);
    if (!normalizedHero) return;
    if (normalizedCandidate && normalizedHero === normalizedCandidate) {
      matched = { participant, index, heroName };
      return;
    }
    if (normalizedCandidate && normalizedCandidate.includes(normalizedHero)) {
      matched = { participant, index, heroName };
      return;
    }
    if (normalizedLine && normalizedLine.includes(normalizedHero)) {
      matched = { participant, index, heroName };
    }
  });
  return matched;
}

function parseDecisionFromOutcome({ line, participants = [] } = {}) {
  const rawLine = String(line || '').trim();
  if (!rawLine) {
    return { type: 'empty', rawLine };
  }

  const tokens = preprocessResultTokens(rawLine);
  if (tokens.length === 0) {
    return { type: 'empty', rawLine };
  }

  for (let offset = 0; offset < Math.min(tokens.length, 2); offset += 1) {
    const tokenIndex = tokens.length - 1 - offset;
    const token = tokens[tokenIndex];
    const decisionType = detectDecisionTypeFromToken(token);
    if (!decisionType || decisionType === 'none') {
      if (decisionType === 'none') {
        return { type: 'none', rawLine, keyword: token };
      }
      continue;
    }

    const heroTokens = tokens
      .slice(0, tokenIndex)
      .map(part => cleanTokenEdges(part))
      .filter(Boolean);
    const candidateName = heroTokens.join(' ');
    const matched = matchParticipantByName(participants, candidateName, rawLine);
    const heroName = matched?.heroName || candidateName || matched?.participant?.hero?.name || '';

    return {
      type: decisionType,
      keyword: cleanTokenEdges(token) || token,
      participantIndex: matched?.index ?? null,
      heroName,
      rawLine,
    };
  }

  const fallbackType = detectDecisionTypeFromToken(tokens[tokens.length - 1]);
  if (fallbackType === 'none') {
    return { type: 'none', rawLine, keyword: tokens[tokens.length - 1] };
  }

  return { type: 'unknown', rawLine };
}

function normalizeParticipantStatus(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text || 'alive';
}

function applyDecisionToParticipants({ participants = [], decision = null, turnNumber = null }) {
  if (!decision) {
    return { participants, decision: null };
  }

  const enrichedDecision = { ...decision, turn: turnNumber ?? null };
  if (enrichedDecision.participantIndex == null) {
    return { participants, decision: enrichedDecision };
  }

  const statusByType = {
    win: 'spectator',
    lose: 'defeated',
    out: 'spectator',
  };

  const nextStatus = statusByType[enrichedDecision.type];
  if (!nextStatus) {
    return { participants, decision: enrichedDecision };
  }

  let changed = false;
  const updated = participants.map((participant, index) => {
    if (index !== enrichedDecision.participantIndex) {
      return participant;
    }

    changed = true;
    const heroName =
      enrichedDecision.heroName || participant?.hero?.name || participant?.name || '';

    const hero = participant?.hero
      ? { ...participant.hero, status: nextStatus }
      : { status: nextStatus, name: heroName };

    return {
      ...participant,
      status: nextStatus,
      hero,
      lastOutcome: {
        type: enrichedDecision.type,
        keyword: enrichedDecision.keyword || '',
        line: enrichedDecision.rawLine || '',
        heroName,
        turn: turnNumber ?? null,
      },
    };
  });

  if (!changed) {
    return { participants, decision: enrichedDecision };
  }

  const participantIndex = enrichedDecision.participantIndex;
  const resolvedHeroName =
    updated[participantIndex]?.hero?.name ||
    updated[participantIndex]?.heroName ||
    enrichedDecision.heroName ||
    '';

  return {
    participants: updated,
    decision: { ...enrichedDecision, heroName: resolvedHeroName },
  };
}

function describeDecision(decision) {
  if (!decision || !decision.type) return '';
  const labelMap = {
    win: '승리로 관전화',
    lose: '패배 확정',
    out: '탈락 처리',
  };
  const label = labelMap[decision.type];
  if (!label) return '';
  if (decision.heroName) {
    return `${decision.heroName} ${label}`;
  }
  return label;
}

function describeParticipantStatus(participant) {
  const status = normalizeParticipantStatus(participant?.status || participant?.hero?.status);
  if (status === 'defeated' || status === 'lost' || status === 'eliminated') {
    return { label: '패배', variant: 'defeated' };
  }
  if (
    status === 'spectator' ||
    status === 'observer' ||
    status === 'retired' ||
    status === 'inactive'
  ) {
    return { label: '관전자', variant: 'spectator' };
  }
  return { label: '참전 중', variant: 'active' };
}

function describeParticipantOutcome(participant) {
  const outcome = participant?.lastOutcome;
  if (!outcome || !outcome.type) return '';
  const labelMap = { win: '승리', lose: '패배', out: '탈락' };
  const label = labelMap[outcome.type];
  if (!label) return '';
  const pieces = [label];
  if (Number.isFinite(Number(outcome.turn)) && Number(outcome.turn) > 0) {
    pieces.push(`${Number(outcome.turn)}턴`);
  }
  return pieces.join(' · ');
}

function normalizeParticipant(participant) {
  if (!participant) return null;
  const hero = participant.hero || {};
  const normalizedStatus = normalizeParticipantStatus(participant.status ?? hero.status);
  return {
    ...participant,
    status: normalizedStatus,
    lastOutcome: participant.lastOutcome || null,
    hero: {
      ...hero,
      id: hero.id ?? null,
      name: hero.name || '',
      description: hero.description || '',
      image_url: hero.image_url || '',
      background_url: hero.background_url || '',
      ability1: hero.ability1 || '',
      ability2: hero.ability2 || '',
      ability3: hero.ability3 || '',
      ability4: hero.ability4 || '',
      status: normalizedStatus,
    },
  };
}

function ensureArray(value) {
  if (!Array.isArray(value)) return [];
  return value;
}

function formatSlotLabel(node) {
  if (!node) return '';
  const no = node.slot_no;
  if (no == null) return '슬롯 미지정';
  return `슬롯 ${Number(no) + 1}`;
}

function formatOutcome(outcome) {
  if (!outcome) return '결과 정보를 파싱하지 못했습니다.';
  const parts = [];
  const decisionSummary = describeDecision(outcome.decision);
  if (decisionSummary) {
    parts.push(`처리: ${decisionSummary}`);
  }
  if (outcome.lastLine) {
    parts.push(`마지막 줄: ${outcome.lastLine}`);
  }
  if (outcome.variables?.length) {
    parts.push(`변수: ${outcome.variables.join(', ')}`);
  }
  if (outcome.actors?.length) {
    parts.push(`주역: ${outcome.actors.join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : '결과가 비어 있습니다.';
}

function mapEdgeForEvaluation(edge) {
  if (!edge) return null;
  const fromSlotId = edge.from_slot_id ?? edge.from ?? edge.source ?? edge.data?.from_slot_id;
  const toSlotId = edge.to_slot_id ?? edge.to ?? edge.target ?? edge.data?.to_slot_id;
  return {
    ...edge,
    from_slot_id: fromSlotId != null ? String(fromSlotId) : null,
    to_slot_id: toSlotId != null ? String(toSlotId) : null,
    data: {
      ...(edge.data || {}),
      conditions: edge.data?.conditions ?? edge.conditions ?? [],
      probability: edge.data?.probability ?? edge.probability ?? edge.data?.probability ?? 1,
      fallback: edge.data?.fallback ?? edge.fallback ?? false,
      action: edge.data?.action ?? edge.action ?? 'continue',
    },
  };
}

function describeProvider(meta) {
  if (!meta) return 'AI 응답을 불러왔습니다.';
  if (meta.provider === 'gemini') {
    const mode = meta.mode ? ` · ${meta.mode}` : '';
    const model = meta.model ? ` (${meta.model})` : '';
    return `Google Gemini${mode}${model} 응답을 불러왔습니다.`;
  }
  if (meta.provider === 'openai') {
    const version = meta.version === 'responses' ? 'Responses' : 'Chat';
    const model = meta.model ? ` (${meta.model})` : '';
    return `OpenAI ${version}${model} 응답을 불러왔습니다.`;
  }
  return 'AI 응답을 불러왔습니다.';
}

export default function NonRealtimeConsole({
  initialGameId = '',
  initialBundle = null,
  autoHydrate = false,
  embedded = false,
} = {}) {
  const router = useRouter();
  const [gameIdInput, setGameIdInput] = useState(initialGameId || '');
  const [bundle, setBundle] = useState(initialBundle || null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiVersion, setApiVersion] = useState('gemini');
  const [geminiMode, setGeminiMode] = useState(DEFAULT_GEMINI_MODE);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);
  const [participants, setParticipants] = useState([]);
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [turns, setTurns] = useState([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [pendingTurn, setPendingTurn] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [turnError, setTurnError] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeGlobalNames, setActiveGlobalNames] = useState([]);
  const [activeLocalNames, setActiveLocalNames] = useState([]);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  const aiHistory = useMemo(() => createAiHistory(), []);
  const visitedSlotsRef = useRef(new Set());

  useEffect(() => {
    aiHistory.beginSession();
    setHistoryVersion(v => v + 1);
  }, [aiHistory]);

  useEffect(() => {
    if (!autoHydrate) {
      if (!router.isReady) return;
      const routeId = router.query?.id;
      if (typeof routeId === 'string' && routeId) {
        setGameIdInput(routeId);
      }
    }
  }, [autoHydrate, router.isReady, router.query?.id]);

  useEffect(() => {
    if (!autoHydrate) return;
    if (!initialGameId) return;
    setGameIdInput(String(initialGameId));
  }, [autoHydrate, initialGameId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = readStartSessionValues([
        START_SESSION_KEYS.API_KEY,
        START_SESSION_KEYS.API_VERSION,
        START_SESSION_KEYS.GEMINI_MODE,
        START_SESSION_KEYS.GEMINI_MODEL,
      ]);

      if (stored[START_SESSION_KEYS.API_KEY]) {
        setApiKey(stored[START_SESSION_KEYS.API_KEY] || '');
      }

      if (stored[START_SESSION_KEYS.API_VERSION]) {
        setApiVersion(stored[START_SESSION_KEYS.API_VERSION] || '');
      }

      if (stored[START_SESSION_KEYS.GEMINI_MODE]) {
        setGeminiMode(normalizeGeminiMode(stored[START_SESSION_KEYS.GEMINI_MODE]));
      }

      if (stored[START_SESSION_KEYS.GEMINI_MODEL]) {
        setGeminiModel(
          normalizeGeminiModelId(stored[START_SESSION_KEYS.GEMINI_MODEL]) || DEFAULT_GEMINI_MODEL
        );
      }
    } catch (error) {
      console.warn('[NonRealtimeConsole] 설정을 불러오지 못했습니다:', error);
    }

    setSettingsHydrated(true);

    const unsubscribe = subscribeStartSession(({ source, keys, values }) => {
      if (!keys || keys.length === 0) return;
      if (source === 'manual-console') return;

      if (keys.includes(START_SESSION_KEYS.API_KEY)) {
        const next = values?.[START_SESSION_KEYS.API_KEY];
        setApiKey(next || '');
      }

      if (keys.includes(START_SESSION_KEYS.API_VERSION)) {
        const next = values?.[START_SESSION_KEYS.API_VERSION];
        setApiVersion(next || '');
      }

      if (keys.includes(START_SESSION_KEYS.GEMINI_MODE)) {
        const next = values?.[START_SESSION_KEYS.GEMINI_MODE];
        if (typeof next === 'string') {
          setGeminiMode(normalizeGeminiMode(next));
        }
      }

      if (keys.includes(START_SESSION_KEYS.GEMINI_MODEL)) {
        const next = values?.[START_SESSION_KEYS.GEMINI_MODEL];
        if (typeof next === 'string') {
          setGeminiModel(normalizeGeminiModelId(next) || DEFAULT_GEMINI_MODEL);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setApiVersion, setGeminiMode, setGeminiModel]);

  useEffect(() => {
    if (!settingsHydrated || typeof window === 'undefined') return;
    const trimmed = apiKey.trim();
    writeStartSessionValue(START_SESSION_KEYS.API_KEY, trimmed || null, {
      source: 'manual-console',
    });
  }, [apiKey, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated || typeof window === 'undefined') return;
    const normalized = apiVersion ? apiVersion : null;
    writeStartSessionValue(START_SESSION_KEYS.API_VERSION, normalized, {
      source: 'manual-console',
    });
  }, [apiVersion, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated || typeof window === 'undefined') return;
    const normalized = normalizeGeminiMode(geminiMode);
    writeStartSessionValue(START_SESSION_KEYS.GEMINI_MODE, normalized, {
      source: 'manual-console',
    });
  }, [geminiMode, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated || typeof window === 'undefined') return;
    const normalized = normalizeGeminiModelId(geminiModel);
    writeStartSessionValue(START_SESSION_KEYS.GEMINI_MODEL, normalized, {
      source: 'manual-console',
    });
  }, [geminiModel, settingsHydrated]);

  const applyBundle = useCallback(
    (loaded, { gameId } = {}) => {
      if (!loaded) return;
      setBundle(loaded);
      setParticipants(ensureArray(loaded.participants).map(normalizeParticipant));
      const startNode = loaded.graph?.nodes?.find(node => node?.is_start);
      const fallbackNode = loaded.graph?.nodes?.[0] ?? null;
      setCurrentNodeId(startNode?.id ?? fallbackNode?.id ?? null);
      setTurns([]);
      visitedSlotsRef.current = new Set();
      aiHistory.beginSession();
      setHistoryVersion(v => v + 1);
      setSessionEnded(false);
      setActiveGlobalNames([]);
      setActiveLocalNames([]);
      if (gameId != null) {
        setGameIdInput(String(gameId));
      }
    },
    [aiHistory]
  );

  const loadGame = useCallback(async () => {
    if (!gameIdInput) {
      setLoadError('게임 ID를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setLoadError('');
    setStatusMessage('');
    setTurnError('');
    try {
      const loaded = await loadGameBundle(supabase, gameIdInput);
      applyBundle(loaded, { gameId: gameIdInput });
    } catch (error) {
      console.error('[NonRealtimeConsole] 게임 불러오기 실패', error);
      setLoadError(error?.message || '게임 정보를 불러오지 못했습니다.');
      setBundle(null);
      setParticipants([]);
      setCurrentNodeId(null);
      setTurns([]);
      visitedSlotsRef.current = new Set();
      aiHistory.beginSession();
      setHistoryVersion(v => v + 1);
    } finally {
      setLoading(false);
    }
  }, [aiHistory, applyBundle, gameIdInput]);

  useEffect(() => {
    if (autoHydrate) return;
    if (router.isReady && router.query?.id && !bundle && !loading) {
      loadGame();
    }
  }, [autoHydrate, bundle, loading, loadGame, router.isReady, router.query?.id]);

  useEffect(() => {
    if (!autoHydrate) return;
    if (!initialBundle) return;
    const routeId = typeof router.query?.id === 'string' ? router.query.id : undefined;
    applyBundle(initialBundle, { gameId: initialGameId || routeId });
  }, [applyBundle, autoHydrate, initialBundle, initialGameId, router.query?.id]);

  const slotsMap = useMemo(
    () => buildParticipantSlotMap(participants.map(participant => ({ ...participant }))),
    [participants]
  );

  const historyText = useMemo(
    () => aiHistory.joinedText({ onlyPublic: false }),
    [aiHistory, historyVersion]
  );

  const currentNode = useMemo(() => {
    if (!bundle || !currentNodeId) return null;
    return bundle.graph?.nodes?.find(node => String(node.id) === String(currentNodeId)) ?? null;
  }, [bundle, currentNodeId]);

  const promptPreview = useMemo(() => {
    if (!bundle || !currentNode) return null;
    try {
      return interpretPromptNode({
        game: bundle.game,
        node: currentNode,
        participants,
        slotsMap,
        historyText,
        activeGlobalNames,
        activeLocalNames,
      });
    } catch (error) {
      console.error('[NonRealtimeConsole] 프롬프트 해석 실패', error);
      return null;
    }
  }, [
    activeGlobalNames,
    activeLocalNames,
    bundle,
    currentNode,
    participants,
    slotsMap,
    historyText,
  ]);

  const handleParticipantChange = useCallback((index, field, value) => {
    setParticipants(prev =>
      prev.map((participant, idx) => {
        if (idx !== index) return participant;
        if (field === 'name') {
          return { ...participant, hero: { ...participant.hero, name: value } };
        }
        if (field.startsWith('ability')) {
          return { ...participant, hero: { ...participant.hero, [field]: value } };
        }
        return participant;
      })
    );
  }, []);

  const callModel = useMemo(
    () =>
      makeCallModel({
        getKey: () => apiKey.trim(),
        getApiVersion: () => apiVersion,
        getGeminiMode: () => geminiMode,
        getGeminiModel: () => geminiModel,
      }),
    [apiKey, apiVersion, geminiMode, geminiModel]
  );

  const handleRunTurn = useCallback(async () => {
    if (!bundle || !currentNode || !promptPreview) return;
    if (!apiKey.trim()) {
      setTurnError('운영 키를 입력해 주세요.');
      return;
    }
    const nextTurnIndex = turns.length + 1;
    setPendingTurn(true);
    setStatusMessage('모델 응답을 기다리는 중입니다…');
    setTurnError('');
    try {
      const result = await callModel({
        system: promptPreview.rulesBlock,
        userText: promptPreview.text,
      });
      if (!result?.ok) {
        throw new Error(result?.error || 'AI 호출이 실패했습니다.');
      }
      const aiText = result.text || result.aiText || '';
      visitedSlotsRef.current.add(String(currentNode.id));
      aiHistory.push({ role: 'user', content: promptPreview.text, public: true });
      aiHistory.push({ role: 'assistant', content: aiText, public: true });
      setHistoryVersion(v => v + 1);

      const outcome = parseOutcome(aiText);
      const parsedDecision = parseDecisionFromOutcome({
        line: outcome.lastLine,
        participants,
      });
      const { participants: updatedParticipants, decision: appliedDecision } =
        applyDecisionToParticipants({
          participants,
          decision: parsedDecision,
          turnNumber: nextTurnIndex,
        });
      const effectiveParticipants =
        updatedParticipants === participants ? participants : updatedParticipants;

      const outcomeVariables = Array.isArray(outcome.variables)
        ? outcome.variables
            .map(name => (typeof name === 'string' ? name.trim() : ''))
            .filter(Boolean)
        : [];
      const nextActiveLocalNames = Array.from(new Set(outcomeVariables));
      const nextActiveGlobalNames = Array.from(
        new Set([...(activeGlobalNames || []), ...nextActiveLocalNames])
      );
      const evaluatedEdges = ensureArray(bundle.graph?.edges)
        .map(mapEdgeForEvaluation)
        .filter(Boolean);

      const participantsStatus = effectiveParticipants.map(participant => ({
        role: participant?.role || participant?.hero?.role || '',
        status: normalizeParticipantStatus(participant?.status || participant?.hero?.status),
      }));

      const bridgeContext = createBridgeContext({
        turn: nextTurnIndex,
        historyAiText: aiText,
        historyUserText: promptPreview.text,
        visitedSlotIds: visitedSlotsRef.current,
        activeGlobalNames: nextActiveGlobalNames,
        activeLocalNames: nextActiveLocalNames,
        participantsStatus,
      });

      const bridgeResult = chooseNext({
        currentSlotId: currentNode.id,
        edges: evaluatedEdges,
        context: bridgeContext,
      });
      if (updatedParticipants !== participants) {
        setParticipants(updatedParticipants);
      }
      setActiveGlobalNames(nextActiveGlobalNames);
      setActiveLocalNames(nextActiveLocalNames);

      const outcomeWithDecision = { ...outcome, decision: appliedDecision };

      setTurns(prev => [
        ...prev,
        {
          node: currentNode,
          prompt: promptPreview,
          responseText: aiText,
          outcome: outcomeWithDecision,
          bridge: bridgeResult,
          activeGlobalNames: nextActiveGlobalNames,
          activeLocalNames: nextActiveLocalNames,
        },
      ]);

      const providerSummary = describeProvider(result.meta);
      const decisionSummary = describeDecision(appliedDecision);
      const summaryBase = decisionSummary
        ? `${providerSummary} · ${decisionSummary}`
        : providerSummary;
      if (bridgeResult?.nextSlotId) {
        setCurrentNodeId(String(bridgeResult.nextSlotId));
        setStatusMessage(summaryBase);
      } else if (bridgeResult?.action === 'stop') {
        setSessionEnded(true);
        setStatusMessage(`${summaryBase} · 브릿지 액션이 stop으로 설정되어 세션을 종료했습니다.`);
      } else if (!bridgeResult) {
        setStatusMessage(`${summaryBase} · 다음으로 진행할 브릿지를 찾지 못했습니다.`);
      } else {
        setStatusMessage(summaryBase);
      }
    } catch (error) {
      console.error('[NonRealtimeConsole] 턴 실행 실패', error);
      setTurnError(error?.message || '턴 실행 중 오류가 발생했습니다.');
      setStatusMessage('');
    } finally {
      setPendingTurn(false);
    }
  }, [
    activeGlobalNames,
    aiHistory,
    apiKey,
    bundle,
    callModel,
    currentNode,
    participants,
    promptPreview,
    turns.length,
  ]);

  const geminiModelOptions = useMemo(
    () => ensureModelInCatalog(geminiMode, geminiModel),
    [geminiMode, geminiModel]
  );

  useEffect(() => {
    setActiveLocalNames([]);
  }, [currentNodeId]);

  const wrapperClassName = embedded ? styles.wrapperEmbedded : styles.wrapper;

  return (
    <div className={wrapperClassName}>
      <header className={styles.header}>
        <div>
          <h1>비실시간 랭크 전투 콘솔</h1>
          <p className={styles.subtitle}>
            프롬프트를 확인하고 AI 응답에 따라 브릿지를 판정하는 수동 운영 도구입니다.
          </p>
        </div>
        <div className={styles.headerControls}>
          <label className={styles.controlField}>
            <span>게임 ID</span>
            {embedded ? (
              <div className={styles.inlineControls}>
                <input value={gameIdInput} readOnly />
                <button type="button" onClick={loadGame} disabled={loading || !gameIdInput}>
                  {loading ? '불러오는 중...' : '다시 불러오기'}
                </button>
              </div>
            ) : (
              <div className={styles.inlineControls}>
                <input
                  value={gameIdInput}
                  onChange={event => setGameIdInput(event.target.value)}
                  placeholder="예: 12345"
                />
                <button type="button" onClick={loadGame} disabled={loading}>
                  {loading ? '불러오는 중...' : '불러오기'}
                </button>
              </div>
            )}
          </label>
          <label className={styles.controlField}>
            <span>운영 키</span>
            <input
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              placeholder="매칭 직전 입력한 유저 API 키"
            />
          </label>
          <label className={styles.controlField}>
            <span>API 버전</span>
            <select value={apiVersion} onChange={event => setApiVersion(event.target.value)}>
              <option value="gemini">Google Gemini</option>
              <option value="chat_completions">OpenAI Chat Completions</option>
              <option value="responses">OpenAI Responses</option>
            </select>
          </label>
          {apiVersion === 'gemini' ? (
            <div className={styles.controlGroup}>
              <label className={styles.controlField}>
                <span>Gemini 엔드포인트</span>
                <select value={geminiMode} onChange={event => setGeminiMode(event.target.value)}>
                  {GEMINI_MODE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.controlField}>
                <span>Gemini 모델</span>
                <select value={geminiModel} onChange={event => setGeminiModel(event.target.value)}>
                  {geminiModelOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {formatGeminiOptionLabel(option)}
                    </option>
                  ))}
                  {!geminiModelOptions.length ? (
                    <option value={geminiModel}>{geminiModel}</option>
                  ) : null}
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </header>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {turnError && <p className={styles.error}>{turnError}</p>}
      {statusMessage && <p className={styles.status}>{statusMessage}</p>}

      {bundle ? (
        <div className={styles.layout}>
          <section className={styles.section}>
            <h2>현재 슬롯</h2>
            {currentNode ? (
              <div className={styles.slotCard}>
                <div className={styles.slotMeta}>
                  <span>{formatSlotLabel(currentNode)}</span>
                  <span className={styles.slotType}>{currentNode.slot_type || 'AI'}</span>
                </div>
                <div className={styles.promptBlock}>
                  <h3>규칙 블록</h3>
                  <pre>{promptPreview?.rulesBlock || '(규칙 없음)'}</pre>
                </div>
                <div className={styles.promptBlock}>
                  <h3>프롬프트 본문</h3>
                  <pre>{promptPreview?.promptBody || '(본문 없음)'}</pre>
                </div>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleRunTurn}
                  disabled={pendingTurn || sessionEnded}
                >
                  {sessionEnded ? '종료됨' : pendingTurn ? '턴 실행 중...' : '다음 턴 실행'}
                </button>
              </div>
            ) : (
              <p className={styles.placeholder}>활성화된 슬롯이 없습니다.</p>
            )}
          </section>

          <section className={styles.section}>
            <h2>참가자 &amp; 능력 설정</h2>
            <div className={styles.participantList}>
              {participants.length === 0 ? (
                <p className={styles.placeholder}>참가자 정보가 없습니다.</p>
              ) : (
                participants.map((participant, index) => {
                  const statusInfo = describeParticipantStatus(participant);
                  const outcomeSummary = describeParticipantOutcome(participant);
                  const statusClasses = [styles.participantStatus];
                  if (statusInfo.variant === 'spectator') {
                    statusClasses.push(styles.participantStatusSpectator);
                  } else if (statusInfo.variant === 'defeated') {
                    statusClasses.push(styles.participantStatusDefeated);
                  } else {
                    statusClasses.push(styles.participantStatusActive);
                  }

                  return (
                    <div key={participant.id ?? index} className={styles.participantCard}>
                      <header>
                        <strong>{participant.hero?.name || `참가자 ${index + 1}`}</strong>
                        {participant.role && (
                          <span className={styles.participantRole}>{participant.role}</span>
                        )}
                        <span className={statusClasses.join(' ')}>{statusInfo.label}</span>
                      </header>
                      {outcomeSummary ? (
                        <p
                          className={styles.participantOutcome}
                        >{`최근 결과: ${outcomeSummary}`}</p>
                      ) : null}
                      <label>
                        <span>이름</span>
                        <input
                          value={participant.hero?.name || ''}
                          onChange={event =>
                            handleParticipantChange(index, 'name', event.target.value)
                          }
                        />
                      </label>
                      <div className={styles.abilityGrid}>
                        {[1, 2, 3, 4].map(no => (
                          <label key={no}>
                            <span>{`능력 ${no}`}</span>
                            <input
                              value={participant.hero?.[`ability${no}`] || ''}
                              onChange={event =>
                                handleParticipantChange(index, `ability${no}`, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h2>히스토리</h2>
            <div className={styles.historyColumns}>
              <div>
                <h3>AI에게 전달되는 히스토리</h3>
                <pre className={styles.historyBlock}>{historyText || '(히스토리 없음)'}</pre>
              </div>
              <div>
                <h3>운영자 뷰</h3>
                {turns.length === 0 ? (
                  <p className={styles.placeholder}>아직 기록된 턴이 없습니다.</p>
                ) : (
                  <ol className={styles.turnList}>
                    {turns.map((turn, index) => (
                      <li key={index}>
                        <header>
                          <span>{`${index + 1}턴 · ${formatSlotLabel(turn.node)}`}</span>
                          {turn.bridge?.action && (
                            <span className={styles.bridgeBadge}>{turn.bridge.action}</span>
                          )}
                        </header>
                        <div className={styles.turnPrompt}>
                          <strong>프롬프트</strong>
                          <pre>{turn.prompt?.promptBody || '(본문 없음)'}</pre>
                        </div>
                        <div className={styles.turnResponse}>
                          <strong>AI 응답</strong>
                          <pre>{turn.responseText || '(응답 없음)'}</pre>
                        </div>
                        <p className={styles.turnOutcome}>{formatOutcome(turn.outcome)}</p>
                        {turn.bridge?.nextSlotId && (
                          <p className={styles.turnBridgeInfo}>
                            다음 브릿지 → 슬롯 {String(turn.bridge.nextSlotId)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <p className={styles.placeholder}>
          게임을 불러오면 프롬프트와 히스토리를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}
