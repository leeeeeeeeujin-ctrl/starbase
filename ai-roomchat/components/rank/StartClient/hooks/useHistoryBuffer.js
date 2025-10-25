'use client';

import { useCallback, useMemo, useState } from 'react';

import { createAiHistory } from '../../../../lib/history';

/**
 * AI 히스토리 버퍼 인스턴스를 유지하고 버전 플래그를 노출합니다.
 * @returns {{
 *   history: ReturnType<typeof createAiHistory>,
 *   historyVersion: number,
 *   bumpHistoryVersion: () => void,
 *   setHistoryVersion: (updater: (prev: number) => number) => void,
 * }}
 */
export function useHistoryBuffer() {
  const history = useMemo(() => createAiHistory(), []);
  const [historyVersion, setHistoryVersion] = useState(0);

  const bumpHistoryVersion = useCallback(() => {
    setHistoryVersion(prev => prev + 1);
  }, []);

  return {
    history,
    historyVersion,
    bumpHistoryVersion,
    setHistoryVersion,
  };
}
