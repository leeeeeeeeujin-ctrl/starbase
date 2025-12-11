"use client";

import React from 'react';
import { useBattleLogDebug } from './hooks/useBattleLogDebug.js';

/**
 * Play 디버그 패널 컴포넌트
 * 프롬프트 인스펙터, 턴 로그, 디버그 참가자 관리, AI 호출 로그, 베틀로그 디버그
 */
export default function PlayDebugPanel({
  enableDebugUi,
  debugCollapsed,
  setDebugCollapsed,
  debugPromptEnabled,
  debugState,
  debugLogCallsEnabled,
  addSimUser,
  updateSimUser,
  removeSimUser,
}) {
  if (!enableDebugUi) return null;

  const turnEvents = Array.isArray(debugState.turnEvents) ? debugState.turnEvents : [];
  const { log: debugLog, highlightEvents } = useBattleLogDebug({
    events: turnEvents,
    participants: {},
    outcome: null,
    scoreboard: null,
    meta: {},
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 6,
        transform: 'translateX(-50%)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={() => setDebugCollapsed((v) => !v)}
        title="플레이 디버그 패널 열기/닫기"
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          border: '1px solid #334155',
          background: 'rgba(15,23,42,0.9)',
          color: '#e5e7eb',
          fontSize: 11,
        }}
      >
        {debugCollapsed ? '▼ 디버그' : '▲ 디버그'}
      </button>
      {!debugCollapsed && (
        <>
          {/* 프롬프트 인스펙터 */}
          {debugPromptEnabled && debugState.lastPrompt && (
            <div
              style={{
                marginTop: 6,
                maxWidth: 420,
                maxHeight: 160,
                overflow: 'auto',
                padding: 8,
                borderRadius: 10,
                border: '1px solid #1f2937',
                background: 'rgba(15,23,42,0.96)',
                color: '#e5e7eb',
                fontSize: 11,
                boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#93c5fd' }}>
                현재 턴 프롬프트
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
              >
                {debugState.lastPrompt}
              </pre>
            </div>
          )}

          {/* 턴 로그 (raw) */}
          {Array.isArray(debugState.turnEvents) && debugState.turnEvents.length > 0 && (
            <div
              style={{
                marginTop: 6,
                maxWidth: 420,
                maxHeight: 180,
                overflow: 'auto',
                padding: 8,
                borderRadius: 10,
                border: '1px solid #1f2937',
                background: 'rgba(15,23,42,0.96)',
                color: '#e5e7eb',
                fontSize: 11,
                boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#a5b4fc' }}>
                턴 로그 (raw)
              </div>
              <ul style={{ margin: 0, paddingLeft: 12 }}>
                {debugState.turnEvents
                  .slice()
                  .slice(-10)
                  .reverse()
                  .map((evt, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      <details>
                        <summary>
                          턴 {typeof evt.turn === 'number' ? evt.turn : '-'} ·{' '}
                          {evt.nodeLabel || evt.nodeId || '(노드 정보 없음)'}
                          {evt.visibility ? (
                            <span style={{ marginLeft: 6, color: '#facc15' }}>
                              ({evt.visibility})
                            </span>
                          ) : null}
                          {evt.variables?.battleLast?.apiRouting ? (
                            <span style={{ marginLeft: 6, color: '#bbf7d0' }}>
                              apiRouting →
                              {evt.variables.battleLast.apiRouting.participant?.name
                                ? ` ${evt.variables.battleLast.apiRouting.participant.name}`
                                : ''}
                            </span>
                          ) : null}
                        </summary>
                        <pre
                          style={{
                            marginTop: 2,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }}
                        >
                          {JSON.stringify(evt, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* 디버그 참가자 / API 키 */}
          <div
            style={{
              marginTop: 6,
              maxWidth: 420,
              padding: 8,
              borderRadius: 10,
              border: '1px solid #1f2937',
              background: 'rgba(15,23,42,0.96)',
              color: '#e5e7eb',
              fontSize: 11,
              boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 600, color: '#facc15' }}>
                디버그 참가자 / API 키
              </span>
              <button
                type="button"
                onClick={addSimUser}
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid #4b5563',
                  background: '#020617',
                  color: '#e5e7eb',
                  fontSize: 10,
                }}
              >
                + 추가
              </button>
            </div>
            {Array.isArray(debugState.simUsers) && debugState.simUsers.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                {debugState.simUsers.map((u, idx) => (
                  <li
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr)',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="text"
                        placeholder={`참가자 #${idx + 1} 이름`}
                        value={u?.name || ''}
                        onChange={(e) =>
                          updateSimUser(idx, { name: e.target.value })
                        }
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: '1px solid #4b5563',
                          background: '#020617',
                          color: '#e5e7eb',
                          fontSize: 11,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeSimUser(idx)}
                        title="이 참가자 제거"
                        style={{
                          padding: '0 8px',
                          borderRadius: 6,
                          border: '1px solid #7f1d1d',
                          background: 'rgba(127,29,29,0.4)',
                          color: '#fecaca',
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        삭제
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="API 키 (로컬 디버그 전용, 서버로 전송되지 않음)"
                      value={u?.apiKey || ''}
                      onChange={(e) =>
                        updateSimUser(idx, { apiKey: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        borderRadius: 6,
                        border: '1px solid #4b5563',
                        background: '#020617',
                        color: '#e5e7eb',
                        fontSize: 11,
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                참가자를 추가하면 이름과 API 키를 이 브라우저에만 임시 저장합니다.
                (워크스페이스 파일이나 서버로는 전송되지 않습니다.)
              </div>
            )}
          </div>

          {/* AI 호출 로그 */}
          {debugLogCallsEnabled &&
            Array.isArray(debugState.calls) &&
            debugState.calls.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  maxWidth: 420,
                  maxHeight: 160,
                  overflow: 'auto',
                  padding: 8,
                  borderRadius: 10,
                  border: '1px solid #1f2937',
                  background: 'rgba(15,23,42,0.96)',
                  color: '#e5e7eb',
                  fontSize: 11,
                  boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#a5b4fc' }}>
                  AI 호출 로그
                </div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {debugState.calls
                    .slice()
                    .reverse()
                    .map((call, idx) => (
                      <li key={idx} style={{ marginBottom: 2 }}>
                        <span style={{ color: '#e5e7eb' }}>
                          {call.kind || 'call'} · {call.result || '-'}
                        </span>
                        {call.winner ? (
                          <span style={{ marginLeft: 4, color: '#bbf7d0' }}>
                            (winner: {call.winner})
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {/* 베틀로그 디버그 */}
          {Array.isArray(turnEvents) && turnEvents.length > 0 && (
            <div
              style={{
                marginTop: 6,
                maxWidth: 420,
                maxHeight: 160,
                overflow: 'auto',
                padding: 8,
                borderRadius: 10,
                border: '1px solid #1f2937',
                background: 'rgba(15,23,42,0.96)',
                color: '#e5e7eb',
                fontSize: 11,
                boxShadow: '0 16px 40px rgba(0,0,0,0.65)',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#fbbf24' }}>
                베틀로그 디버그(최근 턴)
              </div>
              {highlightEvents && highlightEvents.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {highlightEvents.slice(-5).map((ev, idx) => (
                    <li key={ev.id || idx} style={{ marginBottom: 2 }}>
                      <span style={{ color: '#e5e7eb' }}>
                        턴 {typeof ev.turn === 'number' ? ev.turn : '?'} ·{' '}
                        {ev.summary ||
                          (typeof ev.prompt === 'string'
                            ? ev.prompt.split(/\r?\n/)[0] || ''
                            : ev.nodeLabel || ev.nodeId || '내용 없음')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  하이라이트로 표시할 턴 이벤트가 없습니다.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
