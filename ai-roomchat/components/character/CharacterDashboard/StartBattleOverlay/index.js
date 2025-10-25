import React, { useMemo } from 'react';

import { createOpponentCards } from '../../../../utils/characterStats';
import { baseStyles } from './styles';
import MatchingStep from './MatchingStep';
import PreviewStep from './PreviewStep';
import ReadyStep from './ReadyStep';
import { useOverlaySteps } from './useOverlaySteps';

export default function StartBattleOverlay({
  open,
  hero,
  selectedEntry,
  selectedGame,
  selectedGameId,
  scoreboardRows,
  heroLookup,
  onClose,
  onBeginSession,
}) {
  const { step, setStep, progress, reset } = useOverlaySteps(open);

  const opponentCards = useMemo(
    () => createOpponentCards(scoreboardRows, heroLookup, hero?.id),
    [scoreboardRows, heroLookup, hero?.id]
  );

  if (!open) return null;

  const gameName = selectedGame?.name || selectedEntry?.game?.name || '참여 게임';

  const handleCancel = () => {
    onClose?.();
    reset();
  };

  const handleStart = () => {
    if (!selectedGameId) {
      alert('먼저 게임을 선택하세요.');
      return;
    }
    setStep('matching');
  };

  const handleReadyBack = () => {
    onClose?.();
    reset();
  };

  const handleBegin = () => {
    onBeginSession?.();
    reset();
  };

  return (
    <div style={baseStyles.overlay}>
      <div style={baseStyles.modal}>
        <header style={baseStyles.header}>
          <div>
            <h2 style={baseStyles.title}>
              {step === 'preview'
                ? '매칭 준비'
                : step === 'matching'
                  ? '참가자 매칭 중'
                  : '모두 준비 완료'}
            </h2>
            <p style={baseStyles.subtitle}>{gameName}</p>
          </div>
          <button type="button" onClick={handleCancel} style={baseStyles.closeButton}>
            닫기
          </button>
        </header>

        {step === 'preview' ? (
          <PreviewStep
            hero={hero}
            selectedEntry={selectedEntry}
            opponentCards={opponentCards}
            onCancel={handleCancel}
            onRequestStart={handleStart}
          />
        ) : null}

        {step === 'matching' ? (
          <MatchingStep hero={hero} opponentCards={opponentCards} progress={progress} />
        ) : null}

        {step === 'ready' ? <ReadyStep onBack={handleReadyBack} onConfirm={handleBegin} /> : null}
      </div>
    </div>
  );
}

// Overlay shell that walks the player through preview, matching, and ready steps before battle.
