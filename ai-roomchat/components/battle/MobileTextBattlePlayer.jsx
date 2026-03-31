'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildTurnPromptContext,
  createBattleSession,
  getCurrentTurn,
  getTurnScopeParticipants,
  submitBattleTurn,
} from '../../lib/battle/session.js';

function buildParticipant(index, role, team, isActor = false) {
  return {
    id: `player-${index + 1}`,
    ownerId: `player-${index + 1}`,
    heroId: `hero-${index + 1}`,
    team: team || (index % 2 === 0 ? 'alpha' : 'beta'),
    role: role || (isActor ? 'player' : 'opponent'),
    name: isActor ? '내 캐릭터' : `참가자 ${index + 1}`,
    meta: {
      description: isActor ? '플레이어가 조작하는 대표 캐릭터' : `${index + 1}번 프리뷰 참가자`,
      abilities: isActor ? ['능력 1', '능력 2'] : [`능력 ${index + 1}A`, `능력 ${index + 1}B`],
    },
  };
}

function getDemoParticipants(definition) {
  const maxPlayers = Math.max(1, Math.min(12, Number(definition?.maxPlayers) || 2));
  const roles = Array.isArray(definition?.roles) ? definition.roles : [];
  const participants = [];

  if (roles.length) {
    roles.forEach(role => {
      const limit = Math.max(1, Number(role?.limit) || 1);
      for (let count = 0; count < limit && participants.length < maxPlayers; count += 1) {
        participants.push(
          buildParticipant(
            participants.length,
            role?.name || role?.id || '',
            role?.team || '',
            participants.length === 0
          )
        );
      }
    });
  }

  while (participants.length < maxPlayers) {
    participants.push(buildParticipant(participants.length, '', '', participants.length === 0));
  }

  return participants;
}

function getInputPlaceholder(turn) {
  const configured = turn?.input?.placeholder?.trim();
  if (configured) return configured;

  switch (turn?.input?.mode) {
    case 'ability':
      return '사용할 능력을 입력';
    case 'target':
      return '대상을 입력';
    case 'choice':
      return '선택 값을 입력';
    case 'text':
      return '입력을 작성';
    default:
      return '';
  }
}

function getActionLabel(turn) {
  switch (turn?.kind) {
    case 'user':
      return '입력 제출';
    case 'system':
      return '시스템 진행';
    default:
      return 'AI 턴 실행';
  }
}

function renderParticipantMeta(meta) {
  const entries = Object.entries(meta || {}).filter(([, value]) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });

  return entries.slice(0, 3).map(([key, value]) => {
    const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
    return (
      <div key={key} style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {key}
        </span>
        <span style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5 }}>{displayValue}</span>
      </div>
    );
  });
}

export default function MobileTextBattlePlayer({ definition }) {
  const normalizedDefinition = useMemo(() => {
    if (!definition || !Array.isArray(definition.turns)) return null;
    return definition;
  }, [definition]);
  const participants = useMemo(
    () => getDemoParticipants(normalizedDefinition),
    [normalizedDefinition]
  );

  const [session, setSession] = useState(() =>
    createBattleSession({
      definition: normalizedDefinition,
      participants,
      actorId: participants[0]?.id || '',
    })
  );
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    setSession(
      createBattleSession({
        definition: normalizedDefinition,
        participants,
        actorId: participants[0]?.id || '',
      })
    );
    setInputValue('');
  }, [normalizedDefinition, participants]);

  const currentTurn = getCurrentTurn(session);
  const scopedParticipants = useMemo(
    () => getTurnScopeParticipants(session, currentTurn, session?.actorId),
    [session, currentTurn]
  );
  const promptContext = useMemo(
    () => buildTurnPromptContext(session, currentTurn, session?.actorId),
    [session, currentTurn]
  );

  if (!normalizedDefinition || !normalizedDefinition.turns?.length) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
          Battle Preview
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>실행할 턴이 아직 없습니다.</div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>
          메이커에서 시작 턴과 연결을 만든 뒤 다시 프리뷰를 열면, 이 화면에서 순서대로 실행됩니다.
        </div>
      </div>
    );
  }

  const isCompleted = session?.status === 'completed' || !currentTurn;
  const needsInput = currentTurn?.input?.mode && currentTurn.input.mode !== 'none';

  const handleAdvance = () => {
    if (!currentTurn) return;
    if (needsInput && !String(inputValue || '').trim()) return;

    const nextSession = submitBattleTurn(session, {
      actorId: session.actorId,
      input: needsInput ? inputValue.trim() : null,
      result: currentTurn.kind === 'ai' ? 'preview:pending-ai-call' : null,
    });

    setSession(nextSession);
    setInputValue('');
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
        display: 'grid',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: 8,
          padding: '16px 18px',
          borderRadius: 22,
          background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
          color: '#f8fafc',
          boxShadow: '0 24px 60px -36px rgba(15, 23, 42, 0.85)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93c5fd' }}>
              Mobile Battle Preview
            </span>
            <strong style={{ fontSize: 22, lineHeight: 1.2 }}>{normalizedDefinition.name || '새 배틀'}</strong>
          </div>
          <div
            style={{
              minWidth: 76,
              borderRadius: 999,
              padding: '6px 12px',
              background: 'rgba(59, 130, 246, 0.18)',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#dbeafe',
            }}
          >
            {isCompleted ? '완료' : `${session.turnIndex + 1} / ${normalizedDefinition.turns.length}`}
          </div>
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>
          {normalizedDefinition.description || '메이커에서 정의한 턴 순서를 모바일 우선 화면으로 미리 실행합니다.'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span
            style={{
              borderRadius: 999,
              padding: '5px 10px',
              background: 'rgba(148, 163, 184, 0.2)',
              fontSize: 12,
              color: '#e2e8f0',
            }}
          >
            {normalizedDefinition.mode === 'multi' ? '멀티' : '싱글'}
          </span>
          <span
            style={{
              borderRadius: 999,
              padding: '5px 10px',
              background: 'rgba(148, 163, 184, 0.2)',
              fontSize: 12,
              color: '#e2e8f0',
            }}
          >
            인원 {normalizedDefinition.minPlayers || 1} - {normalizedDefinition.maxPlayers || participants.length}
          </span>
          {(normalizedDefinition.roles || []).slice(0, 4).map(role => (
            <span
              key={role.id || role.name}
              style={{
                borderRadius: 999,
                padding: '5px 10px',
                background: 'rgba(59, 130, 246, 0.18)',
                fontSize: 12,
                color: '#dbeafe',
              }}
            >
              {role.name}
              {role.team ? ` · ${role.team}` : ''}
              {role.limit ? ` x${role.limit}` : ''}
            </span>
          ))}
        </div>
      </div>

      {currentTurn && (
        <div
          style={{
            display: 'grid',
            gap: 10,
            padding: 18,
            borderRadius: 20,
            background: '#ffffff',
            border: '1px solid #dbe4f0',
            boxShadow: '0 16px 40px -28px rgba(15, 23, 42, 0.32)',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
              Current Turn
            </span>
            <strong style={{ fontSize: 21, color: '#0f172a', lineHeight: 1.25 }}>
              {currentTurn.title || currentTurn.id}
            </strong>
            <span style={{ fontSize: 13, color: '#475569' }}>
              {currentTurn.kind === 'user'
                ? '유저 입력 턴'
                : currentTurn.kind === 'system'
                  ? '시스템 턴'
                  : 'AI 턴'}
            </span>
          </div>

          <div
            style={{
              borderRadius: 16,
              background: '#eff6ff',
              padding: '14px 16px',
              display: 'grid',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8' }}>
              Display
            </span>
            <div style={{ fontSize: 15, lineHeight: 1.7, color: '#0f172a' }}>
              {currentTurn.display || '이 턴에는 별도 유저 안내문이 없습니다.'}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
              Participants In Scope
            </span>
            <div style={{ display: 'grid', gap: 8 }}>
              {(scopedParticipants.length ? scopedParticipants : participants).map(participant => (
                <div
                  key={participant.id}
                  style={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <strong style={{ fontSize: 15, color: '#0f172a' }}>{participant.name}</strong>
                    <span style={{ fontSize: 12, color: '#475569' }}>
                      {participant.team || 'team'} / {participant.role || 'role'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>{renderParticipantMeta(participant.meta)}</div>
                </div>
              ))}
            </div>
          </div>

          {needsInput && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
                {currentTurn.input.label || 'Input'}
              </label>
              <textarea
                value={inputValue}
                onChange={event => setInputValue(event.target.value)}
                placeholder={getInputPlaceholder(currentTurn)}
                rows={4}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  borderRadius: 16,
                  border: '1px solid #cbd5e1',
                  padding: '14px 16px',
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: '#0f172a',
                  background: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <details
            style={{
              borderRadius: 16,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '12px 14px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#334155' }}>
              AI 프롬프트 / 실행 컨텍스트 보기
            </summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: '#0f172a',
                }}
              >
                {currentTurn.promptTemplate || '프롬프트 본문이 아직 없습니다.'}
              </pre>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  lineHeight: 1.6,
                  color: '#475569',
                }}
              >
                {JSON.stringify(promptContext, null, 2)}
              </pre>
            </div>
          </details>

          <button
            type="button"
            onClick={handleAdvance}
            disabled={needsInput && !String(inputValue || '').trim()}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 18,
              padding: '16px 18px',
              fontSize: 15,
              fontWeight: 800,
              background: needsInput && !String(inputValue || '').trim() ? '#cbd5e1' : '#0f172a',
              color: '#f8fafc',
            }}
          >
            {getActionLabel(currentTurn)}
          </button>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 8,
          padding: 18,
          borderRadius: 20,
          background: '#ffffff',
          border: '1px solid #dbe4f0',
          boxShadow: '0 16px 40px -28px rgba(15, 23, 42, 0.32)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <strong style={{ fontSize: 15, color: '#0f172a' }}>Turn Log</strong>
          <span style={{ fontSize: 12, color: '#64748b' }}>{session.logs.length} entries</span>
        </div>

        {session.logs.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {session.logs.map((entry, index) => (
              <div
                key={`${entry.turnId}-${index}`}
                style={{
                  borderRadius: 16,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>{entry.title}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{entry.kind}</span>
                </div>
                {entry.display ? <div style={{ fontSize: 13, color: '#334155' }}>{entry.display}</div> : null}
                {entry.input ? <div style={{ fontSize: 13, color: '#0f172a' }}>입력: {entry.input}</div> : null}
                {entry.result ? <div style={{ fontSize: 12, color: '#475569' }}>결과: {entry.result}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
            아직 실행된 턴이 없습니다. 위에서 현재 턴을 진행하면 로그가 아래에 쌓입니다.
          </div>
        )}
      </div>
    </div>
  );
}
