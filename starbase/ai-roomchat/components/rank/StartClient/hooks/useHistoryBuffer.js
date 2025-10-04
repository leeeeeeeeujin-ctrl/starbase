'use client'

import { useCallback, useMemo, useState } from 'react'

import { createAiHistory } from '../../../../lib/history'

export function useHistoryBuffer() {
  const history = useMemo(() => createAiHistory(), [])
  const [historyVersion, setHistoryVersion] = useState(0)

  const bumpHistoryVersion = useCallback(() => {
    setHistoryVersion((prev) => prev + 1)
  }, [])

  return {
    history,
    historyVersion,
    bumpHistoryVersion,
    setHistoryVersion,
  }
}
