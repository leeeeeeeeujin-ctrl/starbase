import { useCallback, useState } from 'react';

import { supabase } from '../../../lib/supabase';

export default function useGeminiKeyDetector() {
  const [loading, setLoading] = useState(false);

  const detect = useCallback(async value => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) {
      const error = new Error('API 키를 입력해 주세요.');
      error.code = 'missing_user_api_key';
      throw error;
    }

    setLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('세션 정보를 확인하지 못했습니다.');
      }

      const response = await fetch('/api/rank/gemini-detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch (error) {
        payload = {};
      }

      if (!response.ok || (payload && payload.ok === false)) {
        const message =
          typeof payload?.detail === 'string' && payload.detail.trim()
            ? payload.detail.trim()
            : typeof payload?.error === 'string'
              ? payload.error
              : 'Gemini 버전을 확인하지 못했습니다.';
        const error = new Error(message);
        error.code = payload?.error || '';
        error.detail = payload?.detail || '';
        error.tries = payload?.tries || [];
        throw error;
      }

      return payload;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { detect, loading };
}
