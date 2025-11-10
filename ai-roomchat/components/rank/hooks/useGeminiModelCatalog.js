import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import {
  getFallbackGeminiModels,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '../../../lib/rank/geminiConfig';

function buildOptionLabel(entry) {
  const id = normalizeGeminiModelId(entry?.id || entry?.name);
  if (!id) return '';
  const display = typeof entry?.label === 'string' ? entry.label.trim() : '';
  if (display && display.toLowerCase() !== id.toLowerCase()) {
    return `${display} (${id})`;
  }
  if (display) {
    return display;
  }
  return id;
}

function mapResponseModels(models = []) {
  const seen = new Set();
  const items = [];
  models.forEach(model => {
    const id = normalizeGeminiModelId(model?.id || model?.name);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const label = buildOptionLabel({ ...model, id });
    items.push({
      id,
      label,
      displayName: typeof model?.displayName === 'string' ? model.displayName : label,
      inputTokenLimit: Number.isFinite(Number(model?.inputTokenLimit))
        ? Number(model.inputTokenLimit)
        : Number.isFinite(Number(model?.input_token_limit))
          ? Number(model.input_token_limit)
          : null,
      outputTokenLimit: Number.isFinite(Number(model?.outputTokenLimit))
        ? Number(model.outputTokenLimit)
        : Number.isFinite(Number(model?.output_token_limit))
          ? Number(model.output_token_limit)
          : null,
    });
  });
  return items;
}

export default function useGeminiModelCatalog({ apiKey, mode }) {
  const normalizedMode = normalizeGeminiMode(mode);
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const [options, setOptions] = useState(() => getFallbackGeminiModels(normalizedMode));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastSignatureRef = useRef('');
  const [reloadToken, setReloadToken] = useState(0);
  const lastReloadTokenRef = useRef(0);
  const failureCooldownRef = useRef({ signature: '', until: 0 });

  useEffect(() => {
    setOptions(getFallbackGeminiModels(normalizedMode));
    setError('');
    lastSignatureRef.current = '';
    lastReloadTokenRef.current = reloadToken;
  }, [normalizedMode]);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
    lastSignatureRef.current = '';
    failureCooldownRef.current = { signature: '', until: 0 };
  }, []);

  useEffect(() => {
    const signature = `${normalizedMode}::${trimmedKey}`;
    if (!trimmedKey) {
      setOptions(getFallbackGeminiModels(normalizedMode));
      setError('');
      lastSignatureRef.current = '';
      lastReloadTokenRef.current = reloadToken;
      return;
    }

    if (signature === lastSignatureRef.current && reloadToken === lastReloadTokenRef.current) {
      return;
    }

    const now = Date.now();
    const failureWindow = failureCooldownRef.current;
    if (
      signature &&
      signature === failureWindow.signature &&
      reloadToken === lastReloadTokenRef.current &&
      failureWindow.until > now
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }
        const token = sessionData?.session?.access_token;
        if (!token) {
          throw new Error('세션 정보를 확인하지 못했습니다.');
        }

        const response = await fetch('/api/rank/gemini-models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ apiKey: trimmedKey, mode: normalizedMode }),
          signal: controller.signal,
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch (error) {
          payload = {};
        }

        if (!response.ok) {
          const message =
            typeof payload?.detail === 'string'
              ? payload.detail
              : typeof payload?.error === 'string'
                ? payload.error
                : '모델 목록을 불러오지 못했습니다.';
          const err = new Error(message);
          err.status = response.status;
          throw err;
        }

        const mapped = mapResponseModels(payload?.models || []);
        if (!cancelled) {
          setOptions(mapped.length ? mapped : getFallbackGeminiModels(normalizedMode));
          setError(mapped.length ? '' : '사용 가능한 모델 목록이 비어 있어 기본값을 사용합니다.');
          lastSignatureRef.current = signature;
          lastReloadTokenRef.current = reloadToken;
          failureCooldownRef.current = { signature: '', until: 0 };
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) {
          return;
        }
        console.warn('[useGeminiModelCatalog] 모델 목록 로딩 실패:', error);
        setOptions(getFallbackGeminiModels(normalizedMode));
        const friendlyMessage =
          error?.message === 'missing_user_api_key'
            ? 'API 키를 입력하면 최신 Gemini 모델을 불러옵니다.'
            : error?.status === 429
              ? '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.'
              : error?.message || '모델 목록을 불러오지 못했습니다.';
        setError(friendlyMessage);
        const cooldownMs = error?.status === 429 ? 15000 : 4000;
        failureCooldownRef.current = { signature, until: Date.now() + cooldownMs };
        lastSignatureRef.current = signature;
        lastReloadTokenRef.current = reloadToken;
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [normalizedMode, trimmedKey, reloadToken]);

  return {
    options,
    loading,
    error,
    reload,
  };
}
