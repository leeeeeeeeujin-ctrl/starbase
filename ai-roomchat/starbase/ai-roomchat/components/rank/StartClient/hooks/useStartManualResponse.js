'use client'

import { useCallback, useState } from 'react'

/**
 * 수동 응답 입력을 관리하고 트림된 값을 노출하는 훅입니다.
 * @param {Object} [options]
 * @param {(message: string) => void} [options.onAlert] 사용자에게 입력 요청을 전달할 함수
 * @returns {{
 *   manualResponse: string,
 *   setManualResponse: (value: string) => void,
 *   clearManualResponse: () => void,
 *   requireManualResponse: () => string | null,
 * }}
 */
export function useStartManualResponse({ onAlert } = {}) {
  const [manualResponse, setManualResponse] = useState('')

  const alertImpl = useCallback(() => {
    if (typeof onAlert === 'function') {
      return onAlert
    }
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      return window.alert.bind(window)
    }
    return () => {}
  }, [onAlert])

  const clearManualResponse = useCallback(() => {
    setManualResponse('')
  }, [])

  const requireManualResponse = useCallback(() => {
    const trimmed = manualResponse.trim()
    if (!trimmed) {
      alertImpl()('수동 응답을 입력하세요.')
      return null
    }
    return trimmed
  }, [manualResponse, alertImpl])

  return {
    manualResponse,
    setManualResponse,
    clearManualResponse,
    requireManualResponse,
  }
}
