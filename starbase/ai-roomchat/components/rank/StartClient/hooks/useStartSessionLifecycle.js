'use client'

import { useCallback } from 'react'

import {
  clearActiveSessionRecord,
  markActiveSessionDefeated,
  storeActiveSessionRecord,
  updateActiveSessionRecord,
} from '../../../../lib/rank/activeSessionStorage'

export function useStartSessionLifecycle({
  gameId,
  game,
  activeActorNames,
  sessionInfo,
  setSessionInfo,
  realtimeManagerRef,
  dropInQueueRef,
  asyncSessionManagerRef,
  applyRealtimeSnapshot,
  setTurnDeadline,
  setTimeRemaining,
}) {
  const rememberActiveSession = useCallback(
    (payload = {}) => {
      if (!gameId || !game) return
      const actorNames = Array.isArray(payload.actorNames)
        ? payload.actorNames
        : activeActorNames
      storeActiveSessionRecord(gameId, {
        gameName: game.name || '',
        description: game.description || '',
        actorNames,
        sessionId: payload.sessionId ?? sessionInfo?.id ?? null,
        ...payload,
      })
    },
    [gameId, game, activeActorNames, sessionInfo?.id],
  )

  const updateSessionRecord = useCallback(
    (payload = {}) => {
      if (!gameId) return
      const actorNames = Array.isArray(payload.actorNames)
        ? payload.actorNames
        : activeActorNames
      updateActiveSessionRecord(gameId, {
        actorNames,
        gameName: game?.name || '',
        description: game?.description || '',
        sessionId: payload.sessionId ?? sessionInfo?.id ?? null,
        ...payload,
      })
    },
    [gameId, game, activeActorNames, sessionInfo?.id],
  )

  const resetRuntimeState = useCallback(() => {
    if (realtimeManagerRef?.current) {
      const snapshot = realtimeManagerRef.current.reset()
      applyRealtimeSnapshot(snapshot)
    } else {
      applyRealtimeSnapshot(null)
    }
    dropInQueueRef?.current?.reset?.()
    asyncSessionManagerRef?.current?.reset?.()
    setSessionInfo(null)
    setTurnDeadline(null)
    setTimeRemaining(null)
  }, [
    realtimeManagerRef,
    applyRealtimeSnapshot,
    dropInQueueRef,
    asyncSessionManagerRef,
    setSessionInfo,
    setTurnDeadline,
    setTimeRemaining,
  ])

  const clearSessionRecord = useCallback(() => {
    if (gameId) {
      clearActiveSessionRecord(gameId)
    }
    resetRuntimeState()
  }, [gameId, resetRuntimeState])

  const markSessionDefeated = useCallback(() => {
    if (gameId) {
      markActiveSessionDefeated(gameId)
    }
    resetRuntimeState()
  }, [gameId, resetRuntimeState])

  return {
    rememberActiveSession,
    updateSessionRecord,
    clearSessionRecord,
    markSessionDefeated,
  }
}
