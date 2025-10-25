'use client';

import { useMemo } from 'react';

import styles from './StartClient.module.css';
import { formatSecondsLabel, sanitizeTurnTimerVote } from '../../../lib/rank/turnTimerMeta';

function formatDuration(seconds) {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return '미정';
  }
  const floored = Math.floor(numeric);
  if (floored === 0) {
    return '0초';
  }
  if (floored < 60) {
    return `${floored}초`;
  }
  const minutes = Math.floor(floored / 60);
  const remainder = floored % 60;
  if (remainder === 0) {
    return `${minutes}분`;
  }
  return `${minutes}분 ${remainder}초`;
}

function formatTimeOfDay(timestamp) {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  try {
    return new Date(numeric).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    return '';
  }
}

export default function TurnSummaryPanel({
  sessionMeta,
  turn,
  turnTimerSeconds,
  timeRemaining,
  turnDeadline,
  turnTimerSnapshot,
  lastDropInTurn,
}) {
  const voteSnapshot = useMemo(
    () => sanitizeTurnTimerVote(sessionMeta?.vote?.turnTimer),
    [sessionMeta?.vote?.turnTimer]
  );

  const baseSeconds = useMemo(() => {
    const fromSnapshot = Number.isFinite(Number(turnTimerSnapshot?.baseSeconds))
      ? Math.floor(Number(turnTimerSnapshot.baseSeconds))
      : null;
    if (fromSnapshot && fromSnapshot > 0) {
      return fromSnapshot;
    }
    const fromMeta = Number.isFinite(Number(sessionMeta?.turnTimer?.baseSeconds))
      ? Math.floor(Number(sessionMeta.turnTimer.baseSeconds))
      : null;
    if (fromMeta && fromMeta > 0) {
      return fromMeta;
    }
    const fromEngine = Number.isFinite(Number(turnTimerSeconds))
      ? Math.floor(Number(turnTimerSeconds))
      : null;
    return fromEngine && fromEngine > 0 ? fromEngine : null;
  }, [sessionMeta?.turnTimer?.baseSeconds, turnTimerSnapshot?.baseSeconds, turnTimerSeconds]);

  const baseNotes = [];
  if (baseSeconds) {
    const source = sessionMeta?.turnTimer?.source;
    if (source === 'match-ready-vote') {
      baseNotes.push('준비 화면 투표 적용');
    } else if (source) {
      baseNotes.push(`${source} 설정`);
    } else {
      baseNotes.push('투표 결과 적용');
    }
  } else {
    baseNotes.push('기본값 사용 중');
  }

  if (turnTimerSnapshot?.firstTurnBonusAvailable) {
    const bonusSeconds = Number.isFinite(Number(turnTimerSnapshot.firstTurnBonusSeconds))
      ? Math.floor(Number(turnTimerSnapshot.firstTurnBonusSeconds))
      : 30;
    baseNotes.push(`첫 턴 보너스 +${formatDuration(bonusSeconds)} 대기 중`);
  }

  const baseUpdatedAt = Number(sessionMeta?.turnTimer?.updatedAt);
  if (Number.isFinite(baseUpdatedAt) && baseUpdatedAt > 0) {
    const label = formatTimeOfDay(baseUpdatedAt);
    if (label) {
      baseNotes.push(`${label} 갱신`);
    }
  }

  const normalizedTurn = Number.isFinite(Number(turn)) ? Math.floor(Number(turn)) : null;
  const storedTurn = Number.isFinite(Number(sessionMeta?.turnState?.turnNumber))
    ? Math.floor(Number(sessionMeta.turnState.turnNumber))
    : null;
  const displayTurn = normalizedTurn && normalizedTurn > 0 ? normalizedTurn : storedTurn || 1;

  const remainingFromEngine = Number.isFinite(Number(timeRemaining))
    ? Math.max(0, Math.floor(Number(timeRemaining)))
    : null;
  const remainingFromMeta = Number.isFinite(Number(sessionMeta?.turnState?.remainingSeconds))
    ? Math.max(0, Math.floor(Number(sessionMeta.turnState.remainingSeconds)))
    : null;
  const displayRemaining = remainingFromEngine ?? remainingFromMeta;

  const deadlineCandidate = Number.isFinite(Number(turnDeadline))
    ? Number(turnDeadline)
    : Number(sessionMeta?.turnState?.deadline);
  const deadlineLabel = formatTimeOfDay(deadlineCandidate);

  const dropInSeconds = Number.isFinite(Number(turnTimerSnapshot?.dropInBonusSeconds))
    ? Math.max(0, Math.floor(Number(turnTimerSnapshot.dropInBonusSeconds)))
    : Number.isFinite(Number(sessionMeta?.turnState?.dropInBonusSeconds))
      ? Math.max(0, Math.floor(Number(sessionMeta.turnState.dropInBonusSeconds)))
      : 0;
  const dropInAppliedTurn = Number.isFinite(Number(turnTimerSnapshot?.lastDropInAppliedTurn))
    ? Math.floor(Number(turnTimerSnapshot.lastDropInAppliedTurn))
    : Number.isFinite(Number(sessionMeta?.turnState?.dropInBonusTurn))
      ? Math.floor(Number(sessionMeta.turnState.dropInBonusTurn))
      : Number.isFinite(Number(lastDropInTurn))
        ? Math.floor(Number(lastDropInTurn))
        : 0;
  const dropInPending = Boolean(turnTimerSnapshot?.pendingDropInBonus);
  const dropInActive = dropInAppliedTurn && displayTurn && dropInAppliedTurn === displayTurn;

  const dropInValue = dropInSeconds > 0 ? `+${formatDuration(dropInSeconds)}` : '없음';
  let dropInHint = '';
  if (dropInPending && dropInSeconds > 0) {
    dropInHint = '다음 턴에 보너스가 적용될 예정입니다.';
  } else if (dropInActive) {
    dropInHint = `턴 ${dropInAppliedTurn}에서 보너스가 적용되었습니다.`;
  } else if (dropInAppliedTurn && dropInSeconds > 0) {
    dropInHint = `최근 보너스 적용 턴: ${dropInAppliedTurn}`;
  } else {
    dropInHint = '추가 보너스가 없습니다.';
  }

  const voteSummary = useMemo(() => {
    const entries = Object.entries(voteSnapshot.selections || {})
      .map(([key, value]) => {
        const option = Number.isFinite(Number(key)) ? Math.floor(Number(key)) : null;
        const count = Number(value);
        if (!option || !Number.isFinite(count) || count <= 0) return null;
        return { option, count: Math.floor(count) };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || a.option - b.option);

    const primary = entries[0] || null;
    const secondary = entries[1] || null;
    const value = primary
      ? `${formatDuration(primary.option)} (${primary.count}표)`
      : '투표 대기 중';

    let hint = '';
    if (secondary) {
      hint = `다음: ${formatDuration(secondary.option)} (${secondary.count}표)`;
    } else if (!primary && voteSnapshot.lastSelection) {
      hint = `최근 선택: ${formatDuration(voteSnapshot.lastSelection)}`;
    }

    const detail = entries
      .slice(0, 4)
      .map(entry => `${formatDuration(entry.option)} · ${entry.count}표`);

    return { value, hint, detail };
  }, [voteSnapshot]);

  const turnSegments = [];
  if (displayRemaining != null) {
    turnSegments.push(`남은 ${formatDuration(displayRemaining)}`);
  }
  if (deadlineLabel) {
    turnSegments.push(`마감 ${deadlineLabel}`);
  }
  const turnHint = turnSegments.length ? turnSegments.join(' · ') : '마감 정보 대기 중';

  const items = [
    {
      label: '기본 제한시간',
      value: baseSeconds ? formatDuration(baseSeconds) : '미정',
      hint: baseNotes.join(' · '),
    },
    {
      label: '현재 턴',
      value: displayTurn ? `턴 ${displayTurn}` : '준비 중',
      hint: turnHint,
    },
    {
      label: '드롭인 보너스',
      value: dropInValue,
      hint: dropInHint,
    },
    {
      label: '투표 상위 옵션',
      value: voteSummary.value,
      hint: voteSummary.hint,
    },
  ];

  return (
    <section className={styles.turnSummary}>
      <div className={styles.turnSummaryHeader}>
        <div>
          <h2 className={styles.sectionTitle}>턴 제한시간 요약</h2>
          <p className={styles.turnSummaryCaption}>
            제한시간 투표 결과와 드롭인 보너스를 한눈에 확인하세요.
          </p>
        </div>
        <span className={styles.turnSummaryBadge}>{formatSecondsLabel(baseSeconds)}</span>
      </div>
      <dl className={styles.turnSummaryList}>
        {items.map(item => (
          <div key={item.label} className={styles.turnSummaryItem}>
            <dt className={styles.turnSummaryLabel}>{item.label}</dt>
            <dd className={styles.turnSummaryValueGroup}>
              <span className={styles.turnSummaryValue}>{item.value}</span>
              {item.hint ? <span className={styles.turnSummaryHint}>{item.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {voteSummary.detail.length ? (
        <div className={styles.turnSummaryVotes}>
          {voteSummary.detail.map(entry => (
            <span key={entry} className={styles.turnSummaryVotePill}>
              {entry}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
