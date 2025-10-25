import { useCallback } from 'react';

export default function useBootLocalSession(deps) {
  const {
    graph,
    history,
    historySeedRef,
    systemPrompt,
    participants,
    updateHeroAssets,
    rememberActiveSession,
    turnTimerSeconds,
    realtimeEnabled,
    viewerId,
    applyRealtimeSnapshot,
    bumpHistoryVersion,
    clearConsensusVotes,
    patchEngineState,
    setActiveGlobal,
    setActiveLocal,
    setBattleLogDraft,
    setCurrentNodeId,
    setLastDropInTurn,
    setLogs,
    setPreflight,
    setStatusMessage,
    setTimeRemaining,
    setTurn,
    setTurnDeadline,
    setWinCount,
    // refs / services
    realtimeManagerRef,
    visitedSlotIds,
    apiVersionLock,
    turnTimerServiceRef,
    dropInQueueRef,
    processedDropInReleasesRef,
    asyncSessionManagerRef,
    participantIdSetRef,
    lastScheduledTurnRef,
    logsRef,
    // helpers
    buildSlotsFromParticipants,
    deriveEligibleOwnerIds,
    collectUniqueOwnerIds,
    buildOwnerRosterSnapshot,
    resolveActorContext,
  } = deps;

  return useCallback(
    (overrides = null) => {
      if (!graph || (Array.isArray(graph.nodes) && graph.nodes.length === 0)) {
        patchEngineState({
          statusMessage: '시작할 프롬프트 세트를 찾을 수 없습니다.',
        });
        return;
      }

      const sessionParticipants = Array.isArray(overrides) ? overrides.filter(Boolean) : participants;

      if (!sessionParticipants || sessionParticipants.length === 0) {
        patchEngineState({
          statusMessage: '참가자를 찾을 수 없어 게임을 시작할 수 없습니다.',
        });
        return;
      }

      if (overrides) {
        patchEngineState({ participants: sessionParticipants });
      }

      const sessionSlots = buildSlotsFromParticipants(sessionParticipants);

      const startNode = (graph.nodes && graph.nodes.find(node => node.is_start)) || (graph.nodes && graph.nodes[0]);
      history.beginSession();
      bumpHistoryVersion();
      const seeds = Array.isArray(historySeedRef.current) ? historySeedRef.current : [];
      if (seeds.length) {
        const hasSystemSeed = seeds.some(entry => entry.role === 'system');
        if (!hasSystemSeed && systemPrompt) {
          history.push({
            role: 'system',
            content: systemPrompt,
            public: false,
            includeInAi: true,
            meta: { seeded: true },
          });
        }
        seeds.forEach(seed => history.push(seed));
      } else if (systemPrompt) {
        history.push({ role: 'system', content: systemPrompt, public: false });
      }

      const sessionOwnerIds = collectUniqueOwnerIds(sessionParticipants);
      const viewerKey = viewerId ? String(viewerId).trim() : '';
      const managedOwnersForSession = viewerKey
        ? [viewerKey, ...sessionOwnerIds.filter(ownerId => ownerId !== viewerKey)]
        : sessionOwnerIds;
      const sessionRosterSnapshot = buildOwnerRosterSnapshot(sessionParticipants);

      if (realtimeManagerRef?.current) {
        const manager = realtimeManagerRef.current;
        manager.reset();
        if (realtimeEnabled) {
          manager.syncParticipants(sessionParticipants);
          manager.setManagedOwners(managedOwnersForSession);
          manager.beginTurn({
            turnNumber: 1,
            eligibleOwnerIds: deriveEligibleOwnerIds(sessionParticipants),
          });
        } else {
          manager.setManagedOwners([]);
        }
        applyRealtimeSnapshot?.(manager.getSnapshot());
      }

      visitedSlotIds.current = new Set();
      apiVersionLock.current = null;
      turnTimerServiceRef.current?.configureBase(turnTimerSeconds);
      turnTimerServiceRef.current?.reset();
      dropInQueueRef.current?.reset();
      processedDropInReleasesRef.current.clear();
      asyncSessionManagerRef.current?.reset();
      participantIdSetRef.current = new Set(
        sessionParticipants.map((participant, index) => String(participant?.id ?? participant?.hero_id ?? index))
      );
      lastScheduledTurnRef.current = 0;
      setPreflight(false);
      // preserve previous semantics: clear game-voided state and reset turn/logs
      setGameVoided?.(false);
      setTurn(1);
      setLogs(() => {
        logsRef.current = [];
        return [];
      });
      setBattleLogDraft?.(null);
      setWinCount(0);
      setLastDropInTurn(null);
      setActiveGlobal([]);
      setActiveLocal([]);
      setStatusMessage('게임이 시작되었습니다.');
      const startContext = resolveActorContext({ node: startNode, slots: sessionSlots, participants: sessionParticipants });
      const startNames = startContext?.participant?.hero?.name
        ? [startContext.participant.hero.name]
        : startContext?.heroSlot?.name
        ? [startContext.heroSlot.name]
        : [];
      updateHeroAssets(startNames, startContext);
      rememberActiveSession({
        turn: 1,
        actorNames: startNames,
        status: 'active',
        defeated: false,
        sharedOwners: managedOwnersForSession,
        ownerRoster: sessionRosterSnapshot,
      });
      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      clearConsensusVotes?.();
      setCurrentNodeId(startNode.id);
    },
    [
      graph,
      history,
      historySeedRef,
      systemPrompt,
      participants,
      updateHeroAssets,
      rememberActiveSession,
      turnTimerSeconds,
      realtimeEnabled,
      viewerId,
      applyRealtimeSnapshot,
      bumpHistoryVersion,
      clearConsensusVotes,
      patchEngineState,
      setActiveGlobal,
      setActiveLocal,
      setBattleLogDraft,
      setCurrentNodeId,
      setLastDropInTurn,
      setLogs,
      setPreflight,
      setStatusMessage,
      setTimeRemaining,
      setTurn,
      setTurnDeadline,
      setWinCount,
      realtimeManagerRef,
      visitedSlotIds,
      apiVersionLock,
      turnTimerServiceRef,
      dropInQueueRef,
      processedDropInReleasesRef,
      asyncSessionManagerRef,
      participantIdSetRef,
      lastScheduledTurnRef,
      logsRef,
      buildSlotsFromParticipants,
      deriveEligibleOwnerIds,
      collectUniqueOwnerIds,
      buildOwnerRosterSnapshot,
      resolveActorContext,
    ]
  );
}
import { useCallback } from 'react';

// useBootLocalSession: extracts the bootLocalSession logic from the large engine hook.
// Accepts an object with all dependencies and returns a stable bootLocalSession callback.
export default function useBootLocalSession(deps) {
  const {
    graph,
    patchEngineState,
    participants,
    updateHeroAssets,
    rememberActiveSession,
    turnTimerSeconds,
    realtimeEnabled,
    viewerId,
    applyRealtimeSnapshot,
    bumpHistoryVersion,
    clearConsensusVotes,
    buildSlotsFromParticipants,
    history,
    historySeedRef,
    systemPrompt,
    resolveActorContext,
    collectUniqueOwnerIds,
    buildOwnerRosterSnapshot,
    realtimeManagerRef,
    deriveEligibleOwnerIds,
    turnTimerServiceRef,
    dropInQueueRef,
    processedDropInReleasesRef,
    asyncSessionManagerRef,
    participantIdSetRef,
    setPreflight,
    setGameVoided,
    setTurn,
    setLogs,
    logsRef,
    setBattleLogDraft,
    setWinCount,
    setLastDropInTurn,
    setActiveGlobal,
    setActiveLocal,
    setStatusMessage,
    setTurnDeadline,
    setTimeRemaining,
  } = deps;

  const bootLocalSession = useCallback(
    overrides => {
      if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
        patchEngineState?.({ statusMessage: '시작할 프롬프트 세트를 찾을 수 없습니다.' });
        return;
      }

      const sessionParticipants = Array.isArray(overrides) ? overrides.filter(Boolean) : participants;

      if (!sessionParticipants || sessionParticipants.length === 0) {
        patchEngineState?.({ statusMessage: '참가자를 찾을 수 없어 게임을 시작할 수 없습니다.' });
        return;
      }

      if (overrides) {
        patchEngineState?.({ participants: sessionParticipants });
      }

      const sessionSlots = buildSlotsFromParticipants(sessionParticipants);

      const startNode = graph.nodes.find(node => node.is_start) || graph.nodes[0];
      history?.beginSession?.();
      bumpHistoryVersion?.();
      const seeds = Array.isArray(historySeedRef?.current) ? historySeedRef.current : [];
      if (seeds.length) {
        const hasSystemSeed = seeds.some(entry => entry.role === 'system');
        if (!hasSystemSeed && systemPrompt) {
          history?.push?.({ role: 'system', content: systemPrompt, public: false, includeInAi: true, meta: { seeded: true } });
        }
        seeds.forEach(seed => history?.push?.(seed));
      } else if (systemPrompt) {
        history?.push?.({ role: 'system', content: systemPrompt, public: false });
      }

      const sessionOwnerIds = collectUniqueOwnerIds(sessionParticipants);
      const viewerKey = viewerId ? String(viewerId).trim() : '';
      const managedOwnersForSession = viewerKey
        ? [viewerKey, ...sessionOwnerIds.filter(ownerId => ownerId !== viewerKey)]
        : sessionOwnerIds;
      const sessionRosterSnapshot = buildOwnerRosterSnapshot(sessionParticipants);

      if (realtimeManagerRef?.current) {
        const manager = realtimeManagerRef.current;
        manager.reset?.();
        if (realtimeEnabled) {
          manager.syncParticipants?.(sessionParticipants);
          manager.setManagedOwners?.(managedOwnersForSession);
          manager.beginTurn?.({
            turnNumber: 1,
            eligibleOwnerIds: deriveEligibleOwnerIds(sessionParticipants),
          });
        } else {
          manager.setManagedOwners?.([]);
        }
        applyRealtimeSnapshot?.(manager.getSnapshot?.());
      }

      // reset various services/refs
      if (typeof visitedSlotIds !== 'undefined') visitedSlotIds.current = new Set();
      // apiVersionLock is internal to the engine; ignore if not provided.
      turnTimerServiceRef?.current?.configureBase?.(turnTimerSeconds);
      turnTimerServiceRef?.current?.reset?.();
      dropInQueueRef?.current?.reset?.();
      processedDropInReleasesRef?.current?.clear?.();
      asyncSessionManagerRef?.current?.reset?.();
      participantIdSetRef.current = new Set(
        sessionParticipants.map((participant, index) => String(participant?.id ?? participant?.hero_id ?? index))
      );
      lastScheduledTurnRef && (lastScheduledTurnRef.current = 0);

      setPreflight?.(false);
      setGameVoided?.(false);
      setTurn?.(1);
      setLogs?.(() => {
        if (logsRef) logsRef.current = [];
        return [];
      });
      setBattleLogDraft?.(null);
      setWinCount?.(0);
      setLastDropInTurn?.(null);
      setActiveGlobal?.([]);
      setActiveLocal?.([]);
      setStatusMessage?.('게임이 시작되었습니다.');

      const startContext = resolveActorContext({ node: startNode, slots: sessionSlots, participants: sessionParticipants });
      const startNames = startContext?.participant?.hero?.name
        ? [startContext.participant.hero.name]
        : startContext?.heroSlot?.name
        ? [startContext.heroSlot.name]
        : [];
      updateHeroAssets?.(startNames, startContext);
      rememberActiveSession?.({
        turn: 1,
        actorNames: startNames,
        status: 'active',
        defeated: false,
        sharedOwners: managedOwnersForSession,
        ownerRoster: sessionRosterSnapshot,
      });

      setTurnDeadline?.(null);
      setTimeRemaining?.(null);
      clearConsensusVotes?.();
      setCurrentNodeId?.(startNode.id);
    },
    // Note: dependencies are the values passed in 'deps'.
    [
      graph,
      patchEngineState,
      participants,
      updateHeroAssets,
      rememberActiveSession,
      turnTimerSeconds,
      realtimeEnabled,
      viewerId,
      applyRealtimeSnapshot,
      bumpHistoryVersion,
      clearConsensusVotes,
      buildSlotsFromParticipants,
      history,
      historySeedRef,
      systemPrompt,
      resolveActorContext,
      collectUniqueOwnerIds,
      buildOwnerRosterSnapshot,
      realtimeManagerRef,
      deriveEligibleOwnerIds,
      turnTimerServiceRef,
      dropInQueueRef,
      processedDropInReleasesRef,
      asyncSessionManagerRef,
      participantIdSetRef,
      setPreflight,
      setGameVoided,
      setTurn,
      setLogs,
      logsRef,
      setBattleLogDraft,
      setWinCount,
      setLastDropInTurn,
      setActiveGlobal,
      setActiveLocal,
      setStatusMessage,
      setTurnDeadline,
      setTimeRemaining,
    ]
  );

  return bootLocalSession;
}
