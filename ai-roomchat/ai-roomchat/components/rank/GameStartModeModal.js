import { useEffect, useMemo, useState } from 'react';

import { MATCH_MODE_KEYS, getMatchModeConfig } from '../../lib/rank/matchModes';
import {
  TURN_TIMER_OPTIONS,
  pickTurnTimer,
  summarizeTurnTimerVotes,
} from '../../lib/rank/turnTimers';
import {
  DEFAULT_GEMINI_MODE,
  DEFAULT_GEMINI_MODEL,
  GEMINI_MODE_OPTIONS,
  normalizeGeminiMode,
  normalizeGeminiModelId,
} from '../../lib/rank/geminiConfig';
import { START_SESSION_KEYS, writeStartSessionValues } from '../../lib/rank/startSessionChannel';
import useGeminiKeyDetector from './hooks/useGeminiKeyDetector';
import useGeminiModelCatalog from './hooks/useGeminiModelCatalog';
import useOpenAIKeyDetector from './hooks/useOpenAIKeyDetector';
import usePersistApiKey from './hooks/usePersistApiKey';
import styles from './GameStartModeModal.module.css';

const API_PROVIDER_OPTIONS = [
  { value: 'gemini', label: 'Google Gemini (기본)' },
  { value: 'openai', label: 'OpenAI' },
];

const OPENAI_SERVICE_OPTIONS = [
  { value: 'responses', label: 'Responses API v2 (권장)' },
  { value: 'chat_completions', label: 'Chat Completions v1' },
];

function isOpenAIService(version) {
  return version === 'responses' || version === 'chat_completions';
}

const CASUAL_OPTIONS = [
  {
    value: 'matchmaking',
    title: '캐주얼 매칭',
    description: '점수 제한 없이 캐주얼 매칭 대기열에 들어가 빠르게 게임을 시작합니다.',
  },
  {
    value: 'private',
    title: '사설 방 참여',
    description: '사설 방을 검색해 원하는 역할 슬롯에 들어가고 방장이 시작할 때까지 기다립니다.',
  },
];

function getInitialValue(initial, fallback) {
  if (!initial) return fallback;
  return initial;
}

const CASUAL_MODE_SET = new Set([MATCH_MODE_KEYS.CASUAL_MATCH, MATCH_MODE_KEYS.CASUAL_PRIVATE]);

function normaliseMode(mode) {
  const config = getMatchModeConfig(mode);
  return config?.key ?? MATCH_MODE_KEYS.RANK_SHARED;
}

function initialCasualOption(mode, provided) {
  if (provided) return provided;
  return mode === MATCH_MODE_KEYS.CASUAL_PRIVATE ? 'private' : 'matchmaking';
}

function resolveInitialState(initialConfig) {
  const resolvedMode = normaliseMode(initialConfig?.mode);
  const initialVersion = getInitialValue(initialConfig?.apiVersion, 'gemini');
  const initialProvider = isOpenAIService(initialVersion) ? 'openai' : 'gemini';
  const initialOpenAIService = isOpenAIService(initialVersion) ? initialVersion : 'responses';
  return {
    mode: resolvedMode,
    casualOption: initialCasualOption(resolvedMode, initialConfig?.casualOption),
    apiProvider: initialProvider,
    openaiService: initialOpenAIService,
    apiKey: getInitialValue(initialConfig?.apiKey, ''),
    geminiMode: normalizeGeminiMode(initialConfig?.geminiMode || DEFAULT_GEMINI_MODE),
    geminiModel:
      normalizeGeminiModelId(initialConfig?.geminiModel || DEFAULT_GEMINI_MODEL) ||
      DEFAULT_GEMINI_MODEL,
    turnTimer: Number(initialConfig?.turnTimer) || 60,
  };
}

export default function GameStartModeModal({
  open,
  initialConfig,
  onClose,
  onConfirm,
  turnTimerVotes = {},
  onVoteTurnTimer,
}) {
  const initialState = resolveInitialState(initialConfig);
  const [mode, setMode] = useState(initialState.mode);
  const [casualOption, setCasualOption] = useState(initialState.casualOption);
  const [apiProvider, setApiProvider] = useState(initialState.apiProvider);
  const [openaiService, setOpenaiService] = useState(initialState.openaiService);
  const [apiKey, setApiKey] = useState(initialState.apiKey);
  const [geminiMode, setGeminiMode] = useState(initialState.geminiMode);
  const [geminiModel, setGeminiModel] = useState(initialState.geminiModel);
  const [turnTimer, setTurnTimer] = useState(initialState.turnTimer);
  const [geminiDetectStatus, setGeminiDetectStatus] = useState('');
  const [geminiDetectError, setGeminiDetectError] = useState('');
  const [openaiDetectStatus, setOpenAIDetectStatus] = useState('');
  const [openaiDetectError, setOpenAIDetectError] = useState('');
  const voteSummary = useMemo(
    () => summarizeTurnTimerVotes(turnTimerVotes || {}),
    [turnTimerVotes]
  );
  const {
    normalized: timerVoteTotals = {},
    topValues: leadingTimers = [],
    maxCount: leadingCount = 0,
  } = voteSummary;
  const trimmedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  const usingOpenAI = apiProvider === 'openai';
  const resolvedApiVersion = usingOpenAI ? openaiService : 'gemini';

  const normalizedGeminiMode = useMemo(() => normalizeGeminiMode(geminiMode), [geminiMode]);
  const normalizedGeminiModel = useMemo(
    () => normalizeGeminiModelId(geminiModel) || DEFAULT_GEMINI_MODEL,
    [geminiModel]
  );

  const {
    options: rawGeminiOptions,
    loading: geminiModelLoading,
    error: geminiModelError,
    reload: reloadGeminiModels,
  } = useGeminiModelCatalog({
    apiKey: resolvedApiVersion === 'gemini' ? trimmedApiKey : '',
    mode: normalizedGeminiMode,
  });

  const { detect: detectGeminiPreset, loading: detectingGemini } = useGeminiKeyDetector();
  const { detect: detectOpenAIPreset, loading: detectingOpenAI } = useOpenAIKeyDetector();
  const persistApiKeyOnServer = usePersistApiKey();

  const geminiModelOptions = useMemo(() => {
    const base = Array.isArray(rawGeminiOptions) ? rawGeminiOptions : [];
    const exists = base.some(
      option => normalizeGeminiModelId(option?.id || option?.name) === normalizedGeminiModel
    );
    if (exists || !normalizedGeminiModel) {
      return base;
    }
    return [{ id: normalizedGeminiModel, label: normalizedGeminiModel }, ...base];
  }, [rawGeminiOptions, normalizedGeminiModel]);

  useEffect(() => {
    if (!open) return;
    const nextState = resolveInitialState(initialConfig);
    setMode(nextState.mode);
    setCasualOption(nextState.casualOption);
    setApiProvider(nextState.apiProvider);
    setOpenaiService(nextState.openaiService);
    setApiKey(nextState.apiKey);
    setGeminiMode(nextState.geminiMode);
    setGeminiModel(nextState.geminiModel);
    setTurnTimer(nextState.turnTimer);
    setGeminiDetectStatus('');
    setGeminiDetectError('');
    setOpenAIDetectStatus('');
    setOpenAIDetectError('');
  }, [
    open,
    initialConfig?.mode,
    initialConfig?.casualOption,
    initialConfig?.apiVersion,
    initialConfig?.apiKey,
    initialConfig?.geminiMode,
    initialConfig?.geminiModel,
    initialConfig?.turnTimer,
  ]);

  useEffect(() => {
    if (!open) return;
    const handler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    setGeminiDetectStatus('');
    setGeminiDetectError('');
    setOpenAIDetectStatus('');
    setOpenAIDetectError('');
  }, [trimmedApiKey]);

  useEffect(() => {
    if (resolvedApiVersion === 'gemini') {
      setOpenAIDetectStatus('');
      setOpenAIDetectError('');
    } else {
      setGeminiDetectStatus('');
      setGeminiDetectError('');
    }
  }, [resolvedApiVersion]);

  const handleDetectGemini = async () => {
    if (detectingGemini) {
      return;
    }

    if (!trimmedApiKey) {
      setGeminiDetectStatus('');
      setGeminiDetectError('API 키를 입력해 주세요.');
      return;
    }

    setGeminiDetectStatus('');
    setGeminiDetectError('');
    setOpenAIDetectStatus('');
    setOpenAIDetectError('');

    try {
      const result = await detectGeminiPreset(trimmedApiKey);
      const nextMode = normalizeGeminiMode(result?.mode || DEFAULT_GEMINI_MODE);
      const nextModel =
        normalizeGeminiModelId(result?.model || DEFAULT_GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;

      setApiProvider('gemini');
      setOpenaiService('responses');
      setGeminiMode(nextMode);
      setGeminiModel(nextModel);

      if (typeof window !== 'undefined') {
        try {
          writeStartSessionValues(
            {
              [START_SESSION_KEYS.API_VERSION]: 'gemini',
              [START_SESSION_KEYS.GEMINI_MODE]: nextMode,
              [START_SESSION_KEYS.GEMINI_MODEL]: nextModel,
              [START_SESSION_KEYS.API_KEY]: trimmedApiKey,
            },
            { source: 'start-modal' }
          );
        } catch (error) {
          console.warn('Gemini 프리셋을 저장하지 못했습니다:', error);
        }
      }

      try {
        await persistApiKeyOnServer(trimmedApiKey, 'gemini', {
          geminiMode: nextMode,
          geminiModel: nextModel,
        });
      } catch (error) {
        console.warn('Gemini 프리셋을 서버에 저장하지 못했습니다:', error);
        setGeminiDetectError('감지 결과를 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }

      reloadGeminiModels();

      const modeLabel = nextMode === 'v1' ? '안정판 (v1)' : '베타 (v1beta)';
      let message = `Gemini ${modeLabel} 키로 확인했습니다. 기본 모델은 ${nextModel}로 설정했습니다.`;
      if (result?.fallback) {
        message += ' (모델 목록이 비어 있어 기본값을 사용합니다.)';
      }
      setGeminiDetectStatus(message);
    } catch (error) {
      setGeminiDetectStatus('');
      setGeminiDetectError(error?.message || 'Gemini 버전을 확인하지 못했습니다.');
    }
  };

  const handleDetectOpenAI = async () => {
    if (detectingOpenAI) {
      return;
    }

    if (!trimmedApiKey) {
      setOpenAIDetectStatus('');
      setOpenAIDetectError('API 키를 입력해 주세요.');
      return;
    }

    setOpenAIDetectStatus('');
    setOpenAIDetectError('');
    setGeminiDetectStatus('');
    setGeminiDetectError('');

    try {
      const result = await detectOpenAIPreset(trimmedApiKey);
      const recommendedVersion =
        result?.apiVersion === 'responses' || result?.apiVersion === 'chat_completions'
          ? result.apiVersion
          : 'chat_completions';

      setApiProvider('openai');
      setOpenaiService(recommendedVersion);

      if (typeof window !== 'undefined') {
        try {
          writeStartSessionValues(
            {
              [START_SESSION_KEYS.API_VERSION]: recommendedVersion,
              [START_SESSION_KEYS.API_KEY]: trimmedApiKey,
              [START_SESSION_KEYS.GEMINI_MODE]: null,
              [START_SESSION_KEYS.GEMINI_MODEL]: null,
            },
            { source: 'start-modal' }
          );
        } catch (error) {
          console.warn('OpenAI 프리셋을 저장하지 못했습니다:', error);
        }
      }

      try {
        await persistApiKeyOnServer(trimmedApiKey, recommendedVersion);
      } catch (error) {
        console.warn('OpenAI 프리셋을 서버에 저장하지 못했습니다:', error);
        setOpenAIDetectError('감지 결과를 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }

      const versionLabel =
        recommendedVersion === 'responses' ? 'Responses API v2' : 'Chat Completions v1';
      const baseModel = (result?.model && result.model.trim()) || 'gpt-4o-mini';
      let message =
        typeof result?.detail === 'string' && result.detail.trim()
          ? result.detail.trim()
          : `OpenAI ${versionLabel} 키로 확인했습니다. 기본 모델은 ${baseModel}로 설정했습니다.`;
      if (result?.fallback && recommendedVersion === 'chat_completions') {
        message += ' (Responses API v2를 사용할 수 없어 대체했습니다.)';
      }
      setOpenAIDetectStatus(message);
    } catch (error) {
      setOpenAIDetectStatus('');
      setOpenAIDetectError(error?.message || 'OpenAI 버전을 확인하지 못했습니다.');
    }
  };

  const canConfirm = useMemo(() => {
    const requiresImmediateApiKey = mode === MATCH_MODE_KEYS.RANK_SHARED;
    if (!resolvedApiVersion) {
      return false;
    }

    if (resolvedApiVersion === 'gemini') {
      if (!normalizedGeminiMode) {
        return false;
      }
      if (!normalizedGeminiModel) {
        return false;
      }
    }

    if (requiresImmediateApiKey && !trimmedApiKey) {
      return false;
    }

    if (CASUAL_MODE_SET.has(mode) && !casualOption) {
      return false;
    }

    const hasManualTimer = TURN_TIMER_OPTIONS.some(option => option.value === Number(turnTimer));
    if (!hasManualTimer && leadingCount <= 0) {
      return false;
    }

    return true;
  }, [
    resolvedApiVersion,
    mode,
    casualOption,
    turnTimer,
    leadingCount,
    trimmedApiKey,
    normalizedGeminiMode,
    normalizedGeminiModel,
  ]);

  if (!open) {
    return null;
  }

  const handleSubmit = event => {
    event.preventDefault();
    if (!canConfirm) return;
    const resolvedMode = CASUAL_MODE_SET.has(mode)
      ? casualOption === 'private'
        ? MATCH_MODE_KEYS.CASUAL_PRIVATE
        : MATCH_MODE_KEYS.CASUAL_MATCH
      : MATCH_MODE_KEYS.RANK_SHARED;
    const finalTurnTimer = pickTurnTimer(turnTimerVotes, turnTimer);
    onConfirm?.({
      mode: resolvedMode,
      casualOption,
      apiVersion: resolvedApiVersion,
      apiKey: trimmedApiKey,
      geminiMode: normalizedGeminiMode,
      geminiModel: normalizedGeminiModel,
      turnTimer: finalTurnTimer,
    });
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <form className={styles.modal} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>게임 모드 선택</h2>
            <p className={styles.subtitle}>
              게임을 시작하기 전 모드와 API 연결 정보를 확인해 주세요.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>AI API 연결</h3>
          <label className={styles.label} htmlFor="start-config-api-provider">
            API 종류
          </label>
          <select
            id="start-config-api-provider"
            className={styles.select}
            value={apiProvider}
            onChange={event => {
              const nextProvider = event.target.value;
              setApiProvider(nextProvider);
              if (nextProvider === 'gemini') {
                setOpenaiService('responses');
              }
            }}
          >
            {API_PROVIDER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className={styles.label} htmlFor="start-config-api-key">
            API 키
          </label>
          <input
            id="start-config-api-key"
            className={styles.input}
            type="password"
            placeholder="AI API 키를 입력하세요"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
          />
          {usingOpenAI && (
            <>
              <label className={styles.label} htmlFor="start-config-openai-service">
                OpenAI 서비스 선택
              </label>
              <select
                id="start-config-openai-service"
                className={styles.select}
                value={openaiService}
                onChange={event => setOpenaiService(event.target.value)}
              >
                {OPENAI_SERVICE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {resolvedApiVersion === 'gemini' && (
            <div className={styles.geminiSection}>
              <label className={styles.label} htmlFor="start-config-gemini-mode">
                Gemini 엔드포인트
              </label>
              <select
                id="start-config-gemini-mode"
                className={styles.select}
                value={geminiMode}
                onChange={event => setGeminiMode(normalizeGeminiMode(event.target.value))}
              >
                {GEMINI_MODE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className={styles.label} htmlFor="start-config-gemini-model">
                Gemini 모델
              </label>
              <div className={styles.geminiModelRow}>
                <select
                  id="start-config-gemini-model"
                  className={styles.select}
                  value={geminiModel}
                  onChange={event =>
                    setGeminiModel(
                      normalizeGeminiModelId(event.target.value) || DEFAULT_GEMINI_MODEL
                    )
                  }
                  disabled={!geminiModelOptions.length}
                >
                  {geminiModelOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label || option.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => reloadGeminiModels()}
                  disabled={geminiModelLoading}
                  className={styles.geminiRefreshButton}
                >
                  {geminiModelLoading ? '새로고침 중…' : '모델 새로고침'}
                </button>
              </div>
              <div className={styles.geminiActions}>
                <button
                  type="button"
                  onClick={handleDetectGemini}
                  disabled={detectingGemini || !trimmedApiKey}
                  className={styles.detectButton}
                >
                  {detectingGemini ? '버전 감지 중…' : 'Gemini 버전 자동 감지'}
                </button>
              </div>
              {geminiDetectStatus && (
                <p className={`${styles.helperText} ${styles.detectStatus}`}>
                  {geminiDetectStatus}
                </p>
              )}
              {geminiDetectError && (
                <p className={`${styles.helperText} ${styles.detectError}`}>{geminiDetectError}</p>
              )}
              {geminiModelError && (
                <p className={styles.helperText} style={{ color: '#f97316' }}>
                  {geminiModelError}
                </p>
              )}
              {geminiModelLoading && !geminiModelError && (
                <p className={styles.helperText}>모델 목록을 불러오는 중입니다…</p>
              )}
            </div>
          )}
          {usingOpenAI && (
            <>
              <div className={styles.geminiActions}>
                <button
                  type="button"
                  onClick={handleDetectOpenAI}
                  disabled={detectingOpenAI || !trimmedApiKey}
                  className={styles.detectButton}
                >
                  {detectingOpenAI ? '버전 감지 중…' : 'OpenAI 버전 자동 감지'}
                </button>
              </div>
              {openaiDetectStatus && (
                <p className={`${styles.helperText} ${styles.detectStatus}`}>
                  {openaiDetectStatus}
                </p>
              )}
              {openaiDetectError && (
                <p className={`${styles.helperText} ${styles.detectError}`}>{openaiDetectError}</p>
              )}
            </>
          )}
          <p className={styles.helperText}>
            Google Gemini 또는 OpenAI API 키가 필요합니다.
            {mode === MATCH_MODE_KEYS.RANK_SHARED ? (
              <>
                <br />
                랭크 매치를 시작하려면 여기에서 API 키를 입력해 주세요.
              </>
            ) : !trimmedApiKey ? (
              <>
                <br />
                키가 없다면 전투 화면에서 입력하거나 교체할 수 있습니다.
              </>
            ) : null}
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>턴 제한</h3>
          <p className={styles.timerHint}>
            참가자 전원의 선택을 수집해 가장 많은 시간을 사용하며, 동률일 경우 무작위로 결정합니다.
          </p>
          <div className={styles.timerOptions}>
            {TURN_TIMER_OPTIONS.map(option => {
              const active = Number(turnTimer) === option.value;
              const count = timerVoteTotals[option.value] || 0;
              const leading = leadingCount > 0 && leadingTimers.includes(option.value);
              return (
                <button
                  type="button"
                  key={option.value}
                  className={`${styles.timerOption} ${
                    active ? styles.timerOptionActive : ''
                  } ${leading ? styles.timerOptionLeading : ''}`.trim()}
                  onClick={() => {
                    setTurnTimer(option.value);
                    onVoteTurnTimer?.(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  <span className={styles.timerOptionCount}>{count}표</span>
                </button>
              );
            })}
          </div>
          <p className={styles.timerSummary}>
            {leadingCount > 0
              ? `현재 최다 득표: ${leadingTimers
                  .map(value => `${value}초`)
                  .join(', ')} (${leadingCount}표)`
              : '아직 투표 결과가 없습니다. 동률일 경우 무작위로 선택됩니다.'}
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>모드 선택</h3>
          <div className={styles.modeGroup}>
            <label
              className={`${styles.modeOption} ${
                mode === MATCH_MODE_KEYS.RANK_SHARED ? styles.modeOptionActive : ''
              }`}
            >
              <input
                type="radio"
                name="start-mode"
                value="rank"
                checked={mode === MATCH_MODE_KEYS.RANK_SHARED}
                onChange={() => setMode(MATCH_MODE_KEYS.RANK_SHARED)}
              />
              <div className={styles.modeBody}>
                <div className={styles.modeHeader}>
                  <span className={styles.modeName}>랭크</span>
                  <span className={styles.modeBadge}>역할별 방 · 점수 ±200</span>
                </div>
                <p className={styles.modeDescription}>
                  활성화된 역할 슬롯만큼 방이 생성되고, 같은 역할군 참가자끼리 방을 채웁니다. 모든
                  인원이 준비되면 자동으로 매칭이 실행됩니다.
                </p>
              </div>
            </label>

            <label
              className={`${styles.modeOption} ${
                CASUAL_MODE_SET.has(mode) ? styles.modeOptionActive : ''
              }`}
            >
              <input
                type="radio"
                name="start-mode"
                value="casual"
                checked={CASUAL_MODE_SET.has(mode)}
                onChange={() => {
                  setMode(MATCH_MODE_KEYS.CASUAL_MATCH);
                  setCasualOption('matchmaking');
                }}
              />
              <div className={styles.modeBody}>
                <div className={styles.modeHeader}>
                  <span className={styles.modeName}>캐주얼</span>
                  <span className={styles.modeBadge}>점수 제한 없음</span>
                </div>
                <p className={styles.modeDescription}>
                  누구나 자유롭게 즐길 수 있는 모드입니다. 원하는 방식으로 게임을 시작하세요.
                </p>
                {CASUAL_MODE_SET.has(mode) && (
                  <div className={styles.subOptions}>
                    {CASUAL_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.subOption} ${
                          casualOption === option.value ? styles.subOptionActive : ''
                        }`}
                        onClick={() => {
                          setCasualOption(option.value);
                          setMode(
                            option.value === 'private'
                              ? MATCH_MODE_KEYS.CASUAL_PRIVATE
                              : MATCH_MODE_KEYS.CASUAL_MATCH
                          );
                        }}
                      >
                        <span className={styles.subOptionTitle}>{option.title}</span>
                        <span className={styles.subOptionDescription}>{option.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>
        </section>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!canConfirm}>
            설정하고 시작하기
          </button>
        </footer>
      </form>
    </div>
  );
}
