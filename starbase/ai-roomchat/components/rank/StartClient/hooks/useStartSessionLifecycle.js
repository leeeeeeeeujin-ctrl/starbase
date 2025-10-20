'use client'

import { useCallback } from 'react'

import {
  clearActiveSessionRecord,
  markActiveSessionDefeated,
  storeActiveSessionRecord,
  updateActiveSessionRecord,
} from '../../../../lib/rank/activeSessionStorage'

/**
 * 스타트 세션의 로컬 저장소 상태와 런타임 리셋을 관리하는 훅입니다.
 * @param {Object} params
 * @param {string|number} params.gameId
 * @param {{ name?: string, description?: string }|null} params.game
 * @param {string[]} params.activeActorNames
 * @param {{ id?: string|number }|null} params.sessionInfo
 * @param {(value: any) => void} params.setSessionInfo
 * @param {{ current?: { reset: () => any } }} params.realtimeManagerRef
 * @param {{ current?: { reset?: () => void } }} params.dropInQueueRef
 * @param {{ current?: { reset?: () => void } }} params.asyncSessionManagerRef
 * @param {(snapshot: any) => void} params.applyRealtimeSnapshot
 * @param {(value: any) => void} params.setTurnDeadline
 * @param {(value: any) => void} params.setTimeRemaining
 * @returns {{
 *   rememberActiveSession: (payload?: Object) => void,
 *   updateSessionRecord: (payload?: Object) => void,
 *   clearSessionRecord: () => void,
 *   markSessionDefeated: () => void,
 * }}
 */
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
