'use client'

import { useEffect, useMemo, useRef } from 'react'

const CHECK_INTERVAL_MS = 15 * 1000
const DEADLINE_GRACE_MS = 15 * 1000
const MIN_IDLE_MS = 4 * 60 * 1000
const DEFAULT_BASE_SECONDS = 60

/**
 * 세션이 장시간 정체되거나 비정상 상태에 빠졌는지 감시해 자동으로 무효 처리합니다.
 * @param {Object} params
 * @param {boolean} params.enabled 감시 활성화 여부
 * @param {number} params.turn 현재 턴 번호
 * @param {number} params.historyVersion 히스토리 버퍼 버전 (진행 감지용)
 * @param {number} params.logsLength 로그 패널 길이 (진행 감지용)
 * @param {number} params.timelineVersion 타임라인 이벤트 개수 (진행 감지용)
 * @param {number|null} params.turnDeadline 현재 턴 제한시간 UNIX ms
 * @param {number} params.turnTimerSeconds 기본 턴 제한시간(초)
 * @param {boolean} params.isAdvancing 턴 진행 중 여부
 * @param {boolean} params.gameVoided 이미 무효 처리 되었는지 여부
 * @param {string|null} params.currentNodeId 현재 노드 ID
 * @param {(message?: string|null, options?: Object) => void} params.voidSession 무효 처리 함수
 * @param {(events: Array<Object>, options?: Object) => void} params.recordTimelineEvents 타임라인 기록 함수
 * @param {{ id?: string|number }|null} params.sessionInfo 세션 정보
 * @param {string|number|null} params.gameId 게임 ID
 */
export function useStartSessionWatchdog({
  enabled,
  turn,
  historyVersion,
  logsLength,
  timelineVersion,
  turnDeadline,
  turnTimerSeconds,
  isAdvancing,
  gameVoided,
  currentNodeId,
  voidSession,
  recordTimelineEvents,
  sessionInfo,
  gameId,
}) {
  const lastProgressRef = useRef(Date.now())
  const triggeredRef = useRef(false)
  const stateRef = useRef({
    turn,
    turnDeadline,
    isAdvancing,
    gameVoided,
    currentNodeId,
    sessionId: sessionInfo?.id || null,
  })

  const idleThresholdMs = useMemo(() => {
    const baseSeconds = Number.isFinite(Number(turnTimerSeconds))
      ? Math.max(10, Number(turnTimerSeconds))
      : DEFAULT_BASE_SECONDS
    return Math.max(MIN_IDLE_MS, baseSeconds * 4 * 1000)
  }, [turnTimerSeconds])

  useEffect(() => {
    stateRef.current = {
      turn,
      turnDeadline,
      isAdvancing,
      gameVoided,
      currentNodeId,
      sessionId: sessionInfo?.id || null,
    }
  }, [turn, turnDeadline, isAdvancing, gameVoided, currentNodeId, sessionInfo?.id])

  useEffect(() => {
    if (!enabled) return
    lastProgressRef.current = Date.now()
    triggeredRef.current = false
  }, [enabled, turn, historyVersion, logsLength, timelineVersion])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!enabled) return undefined

    const check = () => {
      const state = stateRef.current
      if (state.gameVoided || !state.currentNodeId) {
        return
      }
      if (state.isAdvancing) {
        return
      }

      const now = Date.now()
      const idleFor = now - lastProgressRef.current
      if (idleFor < idleThresholdMs) {
        return
      }

      const deadline = state.turnDeadline
      if (deadline && now <= deadline + DEADLINE_GRACE_MS) {
        return
      }

      if (triggeredRef.current) {
        return
      }
      triggeredRef.current = true

      try {
        if (typeof recordTimelineEvents === 'function') {
          recordTimelineEvents(
            [
              {
                type: 'void',
                reason: 'stalled_session',
                turn: state.turn,
                timestamp: now,
                status: 'voided',
                context: {
                  guard: 'start-session-watchdog',
                  idleMs: idleFor,
                  deadlineMs: deadline || null,
                },
                metadata: {
                  guard: 'start-session-watchdog',
                  idleMs: idleFor,
                  deadlineMs: deadline || null,
                },
              },
            ],
            { turnNumber: state.turn },
          )
        }
      } catch (error) {
        console.warn('[useStartSessionWatchdog] timeline logging failed:', error)
      }

      voidSession('진행이 장시간 멈춰 세션이 무효 처리되었습니다.', {
        reason: 'stalled_session',
        sessionId: state.sessionId,
        gameId,
        note: `idle_ms=${idleFor}`,
      })
    }

    const intervalId = window.setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [enabled, idleThresholdMs, voidSession, recordTimelineEvents, gameId])
}

export default useStartSessionWatchdog
