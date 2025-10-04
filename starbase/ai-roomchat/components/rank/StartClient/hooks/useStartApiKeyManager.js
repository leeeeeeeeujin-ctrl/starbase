'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { supabase } from '../../../../lib/supabase'
import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '../../../../lib/rank/geminiConfig'
import {
  getApiKeyCooldown,
  purgeExpiredCooldowns,
} from '../../../../lib/rank/apiKeyCooldown'
import {
  buildKeySample,
  formatCooldownMessage,
} from '../engine/apiKeyUtils'
import useGeminiModelCatalog from '../../hooks/useGeminiModelCatalog'

function initializeCooldown(initialApiKey) {
  if (typeof window === 'undefined') {
    return { info: null, warning: '' }
  }
  try {
    purgeExpiredCooldowns()
    if (!initialApiKey) {
      return { info: null, warning: '' }
    }
    const info = getApiKeyCooldown(initialApiKey)
    if (info?.active) {
      return { info, warning: formatCooldownMessage(info) }
    }
  } catch (error) {
    console.warn('[StartClient] API 키 쿨다운 초기화 실패:', error)
  }
  return { info: null, warning: '' }
}

/**
 * 스타트 클라이언트에서 API 키·버전·Gemini 구성을 관리하는 훅입니다.
 * @param {Object} params
 * @param {string} [params.initialApiKey]
 * @param {string} [params.initialApiVersion]
 * @param {{ mode?: string, model?: string }} [params.initialGeminiConfig]
 * @param {string|number|null} [params.viewerId]
 * @param {number} [params.turn]
 * @param {(events: Array<Object>, options?: Object) => void} [params.recordTimelineEvents]
 * @returns {{
 *   apiKey: string,
 *   setApiKey: (value: string, options?: Object) => void,
 *   apiVersion: string,
 *   setApiVersion: (value: string) => void,
 *   geminiMode: string,
 *   setGeminiMode: (value: string) => void,
 *   geminiModel: string,
 *   setGeminiModel: (value: string) => void,
 *   apiKeyCooldown: null|{active?: boolean},
 *   apiKeyWarning: string,
 *   evaluateApiKeyCooldown: (value: string) => null|{active?: boolean},
 *   normaliseApiKey: (value: string) => string,
 *   effectiveApiKey: string,
 *   geminiModelOptions: Array<any>,
 *   geminiModelLoading: boolean,
 *   geminiModelError: any,
 *   reloadGeminiModels: () => void,
 *   normalizedGeminiMode: string,
 *   normalizedGeminiModel: string,
 *   persistApiKeyOnServer: (value: string, version: string, options?: Object) => Promise<boolean>,
 *   applyCooldownInfo: (info: null|{active?: boolean}) => null|{active?: boolean},
 * }}
 */
export function useStartApiKeyManager({
  initialApiKey,
  initialApiVersion = 'gemini',
  initialGeminiConfig = { mode: DEFAULT_GEMINI_MODE, model: DEFAULT_GEMINI_MODEL },
  viewerId,
  turn,
  recordTimelineEvents,
}) {
  const normalizedInitialApiKey = typeof initialApiKey === 'string' ? initialApiKey.trim() : ''
  const [apiKey, setApiKeyState] = useState(normalizedInitialApiKey)
  const [apiVersion, setApiVersionState] = useState(initialApiVersion || 'gemini')
  const [geminiMode, setGeminiModeState] = useState(
    initialGeminiConfig.mode || DEFAULT_GEMINI_MODE,
  )
  const [geminiModel, setGeminiModelState] = useState(
    initialGeminiConfig.model || DEFAULT_GEMINI_MODEL,
  )

  const { info: initialCooldownInfo, warning: initialWarning } = useMemo(
    () => initializeCooldown(normalizedInitialApiKey),
    [normalizedInitialApiKey],
  )
  const [apiKeyCooldown, setApiKeyCooldownState] = useState(initialCooldownInfo)
  const [apiKeyWarning, setApiKeyWarning] = useState(initialWarning)
  const apiKeyChangeMetaRef = useRef(new Map())
  const lastRecordedApiKeyRef = useRef('')
  const lastStoredApiSignatureRef = useRef('')

  const normaliseApiKey = useCallback((value) => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }, [])

  const applyCooldownInfo = useCallback((info) => {
    if (info?.active) {
      setApiKeyCooldownState(info)
      setApiKeyWarning(formatCooldownMessage(info))
      return info
    }
    setApiKeyCooldownState(info || null)
    setApiKeyWarning('')
    return null
  }, [])

  const evaluateApiKeyCooldown = useCallback(
    (value) => {
      if (typeof window === 'undefined') {
        return applyCooldownInfo(null)
      }
      const trimmed = normaliseApiKey(value)
      if (!trimmed) {
        return applyCooldownInfo(null)
      }
      const info = getApiKeyCooldown(trimmed)
      if (info?.active) {
        return applyCooldownInfo(info)
      }
      return applyCooldownInfo(null)
    },
    [applyCooldownInfo, normaliseApiKey],
  )

  const setApiKey = useCallback(
    (value, options = {}) => {
      setApiKeyState(value)
      const trimmed = normaliseApiKey(value)
      if (trimmed && !options.silent) {
        apiKeyChangeMetaRef.current.set(trimmed, {
          source: options.source || 'unknown',
          reason: options.reason || null,
          provider: options.provider || apiVersion || null,
          poolId: options.poolId || null,
          rotationId: options.rotationId || null,
          note: options.note || null,
          replacedSample: options.replacedSample || null,
          viewerId: options.viewerId || viewerId || null,
        })
      }
      if (typeof window !== 'undefined') {
        if (trimmed) {
          window.sessionStorage.setItem('rank.start.apiKey', trimmed)
        } else {
          window.sessionStorage.removeItem('rank.start.apiKey')
        }
      }
      evaluateApiKeyCooldown(value)
    },
    [apiVersion, evaluateApiKeyCooldown, normaliseApiKey, viewerId],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof apiKey === 'string' && apiKey.trim()) return
    try {
      const stored = window.sessionStorage.getItem('rank.start.apiKey') || ''
      const trimmed = normaliseApiKey(stored)
      if (trimmed) {
        setApiKey(trimmed, { silent: true })
      }
    } catch (error) {
      console.warn('[StartClient] API 키를 불러오지 못했습니다:', error)
    }
  }, [apiKey, normaliseApiKey, setApiKey])

  const setApiVersion = useCallback((value) => {
    setApiVersionState(value)
    if (typeof window !== 'undefined') {
      if (value) {
        window.sessionStorage.setItem('rank.start.apiVersion', value)
      } else {
        window.sessionStorage.removeItem('rank.start.apiVersion')
      }
    }
  }, [])

  const setGeminiMode = useCallback((value) => {
    const normalized = normalizeGeminiMode(value)
    setGeminiModeState(normalized)
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('rank.start.geminiMode', normalized)
      } catch (error) {
        console.warn('[StartClient] Gemini 모드 저장 실패:', error)
      }
    }
  }, [])

  const setGeminiModel = useCallback((value) => {
    const normalized = normalizeGeminiModelId(value) || DEFAULT_GEMINI_MODEL
    setGeminiModelState(normalized)
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('rank.start.geminiModel', normalized)
      } catch (error) {
        console.warn('[StartClient] Gemini 모델 저장 실패:', error)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof apiKey === 'string' && apiKey.trim()) return

    let cancelled = false

    async function loadStoredKey() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }
        const token = sessionData?.session?.access_token
        if (!token) {
          return
        }
        const response = await fetch('/api/rank/user-api-key', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (!response.ok) {
          return
        }
        const payload = await response.json().catch(() => ({}))
        if (!payload?.ok) {
          return
        }
        if (cancelled) {
          return
        }
        const fetchedKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
        if (fetchedKey) {
          setApiKey(fetchedKey, { silent: true, source: 'stored_profile' })
        }
        if (typeof payload.apiVersion === 'string' && payload.apiVersion.trim()) {
          setApiVersion(payload.apiVersion.trim())
        }
        if (typeof payload.geminiMode === 'string' && payload.geminiMode.trim()) {
          setGeminiMode(payload.geminiMode.trim())
        }
        if (typeof payload.geminiModel === 'string' && payload.geminiModel.trim()) {
          setGeminiModel(payload.geminiModel.trim())
        }
      } catch (error) {
        console.warn('[StartClient] 저장된 API 키를 불러오지 못했습니다:', error)
      }
    }

    loadStoredKey()

    return () => {
      cancelled = true
    }
  }, [apiKey, setApiKey, setApiVersion, setGeminiMode, setGeminiModel])

  const effectiveApiKey = useMemo(
    () => normaliseApiKey(apiKey),
    [apiKey, normaliseApiKey],
  )

  const normalizedGeminiMode = useMemo(
    () => normalizeGeminiMode(geminiMode),
    [geminiMode],
  )

  const normalizedGeminiModel = useMemo(
    () => normalizeGeminiModelId(geminiModel) || DEFAULT_GEMINI_MODEL,
    [geminiModel],
  )

  const {
    options: rawGeminiModelOptions,
    loading: geminiModelLoading,
    error: geminiModelError,
    reload: reloadGeminiModels,
  } = useGeminiModelCatalog({
    apiKey: apiVersion === 'gemini' ? effectiveApiKey : '',
    mode: normalizedGeminiMode,
  })

  const geminiModelOptions = useMemo(() => {
    const base = Array.isArray(rawGeminiModelOptions) ? rawGeminiModelOptions : []
    const exists = base.some(
      (option) => normalizeGeminiModelId(option?.id || option?.name) === normalizedGeminiModel,
    )
    if (exists || !normalizedGeminiModel) {
      return base
    }
    return [{ id: normalizedGeminiModel, label: normalizedGeminiModel }, ...base]
  }, [rawGeminiModelOptions, normalizedGeminiModel])

  const persistApiKeyOnServer = useCallback(
    async (value, version, options = {}) => {
      const trimmed = normaliseApiKey(value)
      if (!trimmed) {
        return false
      }

      const normalizedVersion = typeof version === 'string' ? version : ''
      const normalizedMode = options.geminiMode
        ? normalizeGeminiMode(options.geminiMode)
        : null
      const normalizedModel = options.geminiModel
        ? normalizeGeminiModelId(options.geminiModel)
        : null
      const signature = `${trimmed}::${normalizedVersion}::${normalizedMode || ''}::${
        normalizedModel || ''
      }`

      if (lastStoredApiSignatureRef.current === signature) {
        return true
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          throw sessionError
        }

        const token = sessionData?.session?.access_token
        if (!token) {
          throw new Error('세션 토큰을 확인할 수 없습니다.')
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
            geminiMode:
              normalizedVersion === 'gemini' ? normalizedMode || undefined : undefined,
            geminiModel:
              normalizedVersion === 'gemini' ? normalizedModel || undefined : undefined,
          }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          const message = payload?.error || 'API 키를 저장하지 못했습니다.'
          throw new Error(message)
        }

        lastStoredApiSignatureRef.current = signature
        return true
      } catch (error) {
        console.warn('[StartClient] API 키 저장 실패:', error)
        return false
      }
    },
    [normaliseApiKey],
  )

  useEffect(() => {
    if (!effectiveApiKey) {
      lastStoredApiSignatureRef.current = ''
    }
  }, [effectiveApiKey])

  useEffect(() => {
    if (typeof recordTimelineEvents !== 'function') return
    const trimmed = normaliseApiKey(apiKey)
    if (!trimmed) {
      if (lastRecordedApiKeyRef.current) {
        recordTimelineEvents(
          [
            {
              type: 'api_key_pool_replaced',
              ownerId: viewerId || null,
              reason: 'cleared',
              turn: Number.isFinite(Number(turn)) ? Number(turn) : null,
              timestamp: Date.now(),
              context: { actorLabel: '시스템' },
              metadata: {
                apiKeyPool: {
                  source: 'cleared',
                  provider: apiVersion || null,
                  newSample: null,
                  replacedSample: buildKeySample(lastRecordedApiKeyRef.current),
                  viewerId: viewerId || null,
                },
              },
            },
          ],
          { turnNumber: turn },
        )
      }
      lastRecordedApiKeyRef.current = ''
      return
    }
    if (lastRecordedApiKeyRef.current === trimmed) return
    lastRecordedApiKeyRef.current = trimmed
    const meta = apiKeyChangeMetaRef.current.get(trimmed)
    if (!meta) return
    apiKeyChangeMetaRef.current.delete(trimmed)
    const metadata = {
      apiKeyPool: {
        source: meta.source || 'unknown',
        provider: meta.provider || apiVersion || null,
        poolId: meta.poolId || null,
        rotationId: meta.rotationId || null,
        reason: meta.reason || null,
        note: meta.note || null,
        newSample: buildKeySample(trimmed),
        replacedSample: meta.replacedSample || null,
        viewerId: meta.viewerId || viewerId || null,
      },
    }
    recordTimelineEvents(
      [
        {
          type: 'api_key_pool_replaced',
          ownerId: meta.viewerId || viewerId || null,
          reason: meta.reason || meta.source || 'updated',
          turn: Number.isFinite(Number(turn)) ? Number(turn) : null,
          timestamp: Date.now(),
          context: { actorLabel: '시스템' },
          metadata,
        },
      ],
      { turnNumber: turn },
    )
  }, [apiKey, apiVersion, normaliseApiKey, recordTimelineEvents, turn, viewerId])

  return {
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    geminiMode,
    setGeminiMode,
    geminiModel,
    setGeminiModel,
    apiKeyCooldown,
    apiKeyWarning,
    evaluateApiKeyCooldown,
    normaliseApiKey,
    effectiveApiKey,
    geminiModelOptions,
    geminiModelLoading,
    geminiModelError,
    reloadGeminiModels,
    normalizedGeminiMode,
    normalizedGeminiModel,
    persistApiKeyOnServer,
    applyCooldownInfo,
  }
}
