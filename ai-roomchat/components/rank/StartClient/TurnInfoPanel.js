import { useEffect, useMemo, useRef } from 'react';

import { GEMINI_MODE_OPTIONS } from '@/lib/rank/geminiConfig';

export default function TurnInfoPanel({
  turn,
  currentNode,
  activeGlobal,
  activeLocal,
  apiKey,
  onApiKeyChange,
  apiVersion,
  onApiVersionChange,
  geminiMode,
  onGeminiModeChange,
  geminiModel,
  onGeminiModelChange,
  geminiModelOptions = [],
  geminiModelLoading = false,
  geminiModelError = '',
  onReloadGeminiModels,
  realtimeLockNotice,
  apiKeyNotice,
  currentActor,
  timeRemaining,
  turnTimerSeconds,
}) {
  const actorName = currentActor?.name || '미지정';
  const actorRole = currentActor?.role || '역할 미지정';
  const actorLabel = `${actorName} · ${actorRole}`;
  const isCriticalTimer =
    typeof timeRemaining === 'number' && Number.isFinite(timeRemaining) && timeRemaining <= 10;
  const remainingText =
    typeof timeRemaining === 'number'
      ? `${timeRemaining.toString().padStart(2, '0')}초`
      : '대기 중';

  const timerAccent = useMemo(() => {
    if (!isCriticalTimer) {
      return {
        color: 'rgba(226, 232, 240, 0.9)',
        background: 'rgba(148, 163, 184, 0.16)',
        fontWeight: 600,
      };
    }
    return {
      color: '#fecaca',
      background: 'rgba(248, 113, 113, 0.28)',
      fontWeight: 700,
      boxShadow: '0 0 0 1px rgba(248, 113, 113, 0.35)',
    };
  }, [isCriticalTimer]);

  const lastVibrationRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isCriticalTimer) return;
    if (typeof timeRemaining !== 'number' || timeRemaining < 0) return;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav || typeof nav.vibrate !== 'function') return;

    const lastValue = lastVibrationRef.current;
    if (lastValue === timeRemaining) return;

    try {
      nav.vibrate.call(nav, 200);
      lastVibrationRef.current = timeRemaining;
    } catch (error) {
      console.warn('[TurnInfoPanel] 진동 알림 실패:', error);
    }
  }, [isCriticalTimer, timeRemaining]);

  return (
    <section
      style={{
        borderRadius: 18,
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(15, 23, 42, 0.65)',
        padding: 16,
        display: 'grid',
        gap: 12,
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>진행 정보</div>
        <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
          턴 {turn} · 제한 {turnTimerSeconds || 0}초 ·{' '}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              transition: 'all 0.2s ease-in-out',
              ...timerAccent,
            }}
            aria-live={isCriticalTimer ? 'assertive' : 'off'}
          >
            남은 시간 {remainingText}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 13, display: 'grid', gap: 6, color: 'rgba(226, 232, 240, 0.85)' }}>
        <span>
          현재 노드: {currentNode ? `#${currentNode.slot_no ?? '?'} (${currentNode.id})` : '없음'}
        </span>
        <span>현재 주역: {actorLabel}</span>
        <span>활성 전역 변수: {activeGlobal.length ? activeGlobal.join(', ') : '없음'}</span>
        <span>최근 로컬 변수: {activeLocal.length ? activeLocal.join(', ') : '없음'}</span>
      </div>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>AI API 키</span>
        <input
          value={apiKey}
          onChange={event => onApiKeyChange(event.target.value, { source: 'user_input' })}
          placeholder="API 키를 입력하세요"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#f8fafc',
          }}
        />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>API 버전</span>
        <select
          value={apiVersion}
          onChange={event => onApiVersionChange(event.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#f8fafc',
            fontWeight: 600,
          }}
        >
          <option value="gemini">Google Gemini</option>
          <option value="chat_completions">Chat Completions v1</option>
          <option value="responses">Responses API v2</option>
        </select>
      </label>
      {apiVersion === 'gemini' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
              Gemini 엔드포인트
            </span>
            <select
              value={geminiMode}
              onChange={event => onGeminiModeChange(event.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(148, 163, 184, 0.4)',
                background: 'rgba(15, 23, 42, 0.45)',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              {GEMINI_MODE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>Gemini 모델</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={geminiModel}
                onChange={event => onGeminiModelChange(event.target.value)}
                disabled={!geminiModelOptions.length}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148, 163, 184, 0.4)',
                  background: 'rgba(15, 23, 42, 0.45)',
                  color: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                {geminiModelOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label || option.id}
                  </option>
                ))}
              </select>
              {onReloadGeminiModels && (
                <button
                  type="button"
                  onClick={onReloadGeminiModels}
                  disabled={geminiModelLoading}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: geminiModelLoading
                      ? 'rgba(71, 85, 105, 0.6)'
                      : 'rgba(30, 41, 59, 0.8)',
                    color: '#f8fafc',
                    cursor: geminiModelLoading ? 'not-allowed' : 'pointer',
                    minWidth: 96,
                    fontSize: 12,
                  }}
                >
                  {geminiModelLoading ? '새로고침 중…' : '모델 새로고침'}
                </button>
              )}
            </div>
          </label>
          {geminiModelError && (
            <p style={{ margin: 0, fontSize: 12, color: '#f97316' }}>{geminiModelError}</p>
          )}
          {geminiModelLoading && !geminiModelError && (
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>
              모델 목록을 불러오는 중입니다…
            </p>
          )}
        </div>
      )}
      {realtimeLockNotice && (
        <p style={{ margin: 0, fontSize: 12, color: '#f97316' }}>{realtimeLockNotice}</p>
      )}
      {apiKeyNotice && (
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>{apiKeyNotice}</p>
      )}
    </section>
  );
}

//
