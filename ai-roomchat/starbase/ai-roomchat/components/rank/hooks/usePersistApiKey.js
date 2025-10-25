import { useCallback, useRef } from 'react';

import { supabase } from '../../../lib/supabase';
import { normalizeGeminiMode, normalizeGeminiModelId } from '../../../lib/rank/geminiConfig';

export default function usePersistApiKey() {
  const lastStoredSignatureRef = useRef('');

  return useCallback(async (value, version, options = {}) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      return false;
    }

    const normalizedVersion = typeof version === 'string' ? version : '';
    const normalizedGeminiMode = options.geminiMode
      ? normalizeGeminiMode(options.geminiMode)
      : null;
    const normalizedGeminiModel = options.geminiModel
      ? normalizeGeminiModelId(options.geminiModel)
      : null;
    const signature = `${trimmed}::${normalizedVersion}::${normalizedGeminiMode || ''}::${
      normalizedGeminiModel || ''
    }`;

    if (lastStoredSignatureRef.current === signature) {
      return true;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }

    const token = sessionData?.session?.access_token;
    if (!token) {
      throw new Error('세션 토큰을 확인할 수 없습니다.');
    }

    const response = await fetch('/api/rank/user-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        apiKey: trimmed,
        apiVersion: normalizedVersion || undefined,
        geminiMode: normalizedGeminiMode || undefined,
        geminiModel: normalizedGeminiModel || undefined,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error || 'API 키를 저장하지 못했습니다.';
      throw new Error(message);
    }

    lastStoredSignatureRef.current = signature;
    return true;
  }, []);
}
