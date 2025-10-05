'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { loadGameBundle } from '../engine/loadGameBundle'
import {
  createEmptyMatchContext,
  createMatchContext,
  sanitizeMatchMetadata,
} from '../engine/matchContext'

function buildInitialState() {
  return {
    loading: false,
    error: '',
    context: createEmptyMatchContext(),
    warnings: [],
  }
}

export function useMatchContextLoader({
  gameId,
  supabaseClient,
  startMatchMeta,
}) {
  const [state, setState] = useState(buildInitialState)
  const latestRequestRef = useRef(0)

  const sanitizedMeta = useMemo(
    () => sanitizeMatchMetadata(startMatchMeta),
    [startMatchMeta],
  )

  const load = useCallback(async () => {
    const requestId = Date.now()
    latestRequestRef.current = requestId

    if (!gameId) {
      setState({
        loading: false,
        error: '',
        context: createEmptyMatchContext(),
        warnings: [],
      })
      return
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: '',
    }))

    try {
      const bundle = await loadGameBundle(supabaseClient, gameId)
      if (latestRequestRef.current !== requestId) {
        return
      }

      const context = createMatchContext({
        game: bundle.game,
        participants: bundle.participants,
        graph: bundle.graph,
        slotLayout: bundle.slotLayout,
        matchingMetadata: sanitizedMeta,
        bundleWarnings: bundle.warnings || [],
      })

      setState({
        loading: false,
        error: '',
        context,
        warnings: context.warnings,
      })
    } catch (error) {
      if (latestRequestRef.current !== requestId) {
        return
      }

      const message =
        error?.message || '게임 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setState({
        loading: false,
        error: message,
        context: createEmptyMatchContext(),
        warnings: [],
      })
    }
  }, [gameId, supabaseClient, sanitizedMeta])

  useEffect(() => {
    load()

    return () => {
      latestRequestRef.current = 0
    }
  }, [load])

  const refresh = useCallback(() => load(), [load])

  return {
    loading: state.loading,
    error: state.error,
    context: state.context,
    warnings: state.warnings,
    refresh,
  }
}

