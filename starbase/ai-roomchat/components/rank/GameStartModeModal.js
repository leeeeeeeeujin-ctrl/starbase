import { useEffect, useMemo, useState } from 'react'

import {
  MATCH_MODE_KEYS,
  getMatchModeConfig,
} from '../../lib/rank/matchModes'
import styles from './GameStartModeModal.module.css'

const API_VERSION_OPTIONS = [
  { value: 'gemini', label: 'Google Gemini (기본)' },
  { value: 'chat_completions', label: 'OpenAI Chat Completions' },
  { value: 'responses', label: 'OpenAI Responses API v2' },
]

const DUO_JOIN_OPTIONS = [
  {
    value: 'search',
    title: '방 검색',
    description: '현재 열린 듀오 방을 찾아 팀 평균 점수와 역할 구성을 확인한 뒤 들어갑니다.',
  },
  {
    value: 'create',
    title: '방 만들기',
    description: '팀 평균 점수와 필요한 역할을 입력해 새 방을 개설합니다. 200점 이내의 팀만 참가할 수 있습니다.',
  },
  {
    value: 'code',
    title: '방 코드로 합류',
    description: '친구가 공유한 6자리 방 코드를 입력해 같은 팀으로 빠르게 합류합니다.',
  },
]

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
]

function getInitialValue(initial, fallback) {
  if (!initial) return fallback
  return initial
}

const CASUAL_MODE_SET = new Set([MATCH_MODE_KEYS.CASUAL_MATCH, MATCH_MODE_KEYS.CASUAL_PRIVATE])

function normaliseMode(mode) {
  const config = getMatchModeConfig(mode)
  return config?.key ?? MATCH_MODE_KEYS.RANK_SOLO
}

function initialCasualOption(mode, provided) {
  if (provided) return provided
  return mode === MATCH_MODE_KEYS.CASUAL_PRIVATE ? 'private' : 'matchmaking'
}

function resolveInitialState(initialConfig) {
  const resolvedMode = normaliseMode(initialConfig?.mode)
  return {
    mode: resolvedMode,
    duoOption: getInitialValue(initialConfig?.duoOption, 'search'),
    casualOption: initialCasualOption(resolvedMode, initialConfig?.casualOption),
    apiVersion: getInitialValue(initialConfig?.apiVersion, 'gemini'),
    apiKey: getInitialValue(initialConfig?.apiKey, ''),
  }
}

export default function GameStartModeModal({ open, initialConfig, onClose, onConfirm }) {
  const initialState = resolveInitialState(initialConfig)
  const [mode, setMode] = useState(initialState.mode)
  const [duoOption, setDuoOption] = useState(initialState.duoOption)
  const [casualOption, setCasualOption] = useState(initialState.casualOption)
  const [apiVersion, setApiVersion] = useState(initialState.apiVersion)
  const [apiKey, setApiKey] = useState(initialState.apiKey)

  useEffect(() => {
    if (!open) return
    const nextState = resolveInitialState(initialConfig)
    setMode(nextState.mode)
    setDuoOption(nextState.duoOption)
    setCasualOption(nextState.casualOption)
    setApiVersion(nextState.apiVersion)
    setApiKey(nextState.apiKey)
  }, [open, initialConfig?.mode, initialConfig?.duoOption, initialConfig?.casualOption, initialConfig?.apiVersion, initialConfig?.apiKey])

  useEffect(() => {
    if (!open) return
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const canConfirm = useMemo(() => {
    if (!apiKey || !apiKey.trim()) {
      return false
    }

    if (!apiVersion) {
      return false
    }

    if (mode === MATCH_MODE_KEYS.RANK_DUO && !duoOption) {
      return false
    }

    if (CASUAL_MODE_SET.has(mode) && !casualOption) {
      return false
    }

    return true
  }, [apiKey, apiVersion, mode, duoOption, casualOption])

  if (!open) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!canConfirm) return
    const resolvedMode = CASUAL_MODE_SET.has(mode)
      ? casualOption === 'private'
        ? MATCH_MODE_KEYS.CASUAL_PRIVATE
        : MATCH_MODE_KEYS.CASUAL_MATCH
      : mode
    onConfirm?.({
      mode: resolvedMode,
      duoOption,
      casualOption,
      apiVersion,
      apiKey: apiKey.trim(),
    })
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <form className={styles.modal} onSubmit={handleSubmit}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>게임 모드 선택</h2>
            <p className={styles.subtitle}>게임을 시작하기 전 모드와 API 연결 정보를 확인해 주세요.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>AI API 연결</h3>
          <label className={styles.label} htmlFor="start-config-api-version">
            API 종류
          </label>
          <select
            id="start-config-api-version"
            className={styles.select}
            value={apiVersion}
            onChange={(event) => setApiVersion(event.target.value)}
          >
            {API_VERSION_OPTIONS.map((option) => (
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
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className={styles.helperText}>
            Google Gemini 또는 OpenAI API 키가 필요합니다.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>모드 선택</h3>
          <div className={styles.modeGroup}>
            <label
              className={`${styles.modeOption} ${
                mode === MATCH_MODE_KEYS.RANK_DUO ? styles.modeOptionActive : ''
              }`}
            >
              <input
                type="radio"
                name="start-mode"
                value="duo"
                checked={mode === MATCH_MODE_KEYS.RANK_DUO}
                onChange={() => setMode(MATCH_MODE_KEYS.RANK_DUO)}
              />
              <div className={styles.modeBody}>
                <div className={styles.modeHeader}>
                  <span className={styles.modeName}>듀오 랭크</span>
                  <span className={styles.modeBadge}>평균 점수 ±200</span>
                </div>
                <p className={styles.modeDescription}>
                  팀 평균 점수와 역할을 맞춰 친구와 함께 경쟁합니다. 200점 이내의 팀만 매칭됩니다.
                </p>
                {mode === MATCH_MODE_KEYS.RANK_DUO && (
                  <div className={styles.subOptions}>
                    {DUO_JOIN_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.subOption} ${
                          duoOption === option.value ? styles.subOptionActive : ''
                        }`}
                        onClick={() => setDuoOption(option.value)}
                      >
                        <span className={styles.subOptionTitle}>{option.title}</span>
                        <span className={styles.subOptionDescription}>{option.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            <label
              className={`${styles.modeOption} ${
                mode === MATCH_MODE_KEYS.RANK_SOLO ? styles.modeOptionActive : ''
              }`}
            >
              <input
                type="radio"
                name="start-mode"
                value="solo"
                checked={mode === MATCH_MODE_KEYS.RANK_SOLO}
                onChange={() => setMode(MATCH_MODE_KEYS.RANK_SOLO)}
              />
              <div className={styles.modeBody}>
                <div className={styles.modeHeader}>
                  <span className={styles.modeName}>솔로 랭크</span>
                  <span className={styles.modeBadge}>실시간 매칭</span>
                </div>
                <p className={styles.modeDescription}>
                  혼자 큐를 돌려 비슷한 점수대의 플레이어가 모일 때까지 대기합니다.
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
                  setMode(MATCH_MODE_KEYS.CASUAL_MATCH)
                  setCasualOption('matchmaking')
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
                    {CASUAL_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.subOption} ${
                          casualOption === option.value ? styles.subOptionActive : ''
                        }`}
                        onClick={() => {
                          setCasualOption(option.value)
                          setMode(
                            option.value === 'private'
                              ? MATCH_MODE_KEYS.CASUAL_PRIVATE
                              : MATCH_MODE_KEYS.CASUAL_MATCH,
                          )
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
  )
}
