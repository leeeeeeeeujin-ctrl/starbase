'use client';

import { useEffect, useMemo, useState } from 'react';

import { getHeroAudioManager } from '@/lib/audio/heroAudioManager';

export default function CharacterRouteHud({ hero }) {
  const audioManager = useMemo(() => getHeroAudioManager(), []);
  const [audioState, setAudioState] = useState(() => audioManager.getState());
  const [playerCollapsed, setPlayerCollapsed] = useState(false);

  useEffect(() => audioManager.subscribe(setAudioState), [audioManager]);

  const heroId = hero?.id || null;
  const heroName = hero?.name || '캐릭터';
  const activeBgmUrl = hero?.bgm_url || null;
  const durationHint = hero?.bgm_duration_seconds || 0;

  useEffect(() => {
    if (!heroId) return;
    audioManager.loadHeroTrack({
      heroId,
      heroName,
      trackUrl: activeBgmUrl,
      duration: durationHint,
      autoPlay: Boolean(activeBgmUrl),
      loop: true,
    });
  }, [activeBgmUrl, audioManager, durationHint, heroId, heroName]);

  const progressRatio = audioState.duration ? audioState.progress / audioState.duration : 0;
  const formatTime = value => {
    if (!value || Number.isNaN(value)) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div
      data-swipe-lock="true"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 54,
        transform: 'translateX(calc(-50% - 12px))',
        width: 'min(560px, calc(100% - 24px))',
        zIndex: 25,
        display: 'grid',
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      <div style={shellStyle(playerCollapsed)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPlayerCollapsed(prev => !prev)}
            style={miniButtonStyle}
            aria-label={playerCollapsed ? '재생바 펼치기' : '재생바 접기'}
          >
            {playerCollapsed ? '▲' : '▼'}
          </button>
          <strong style={{ color: '#dbeafe', fontSize: 13 }}>캐릭터 브금</strong>
          <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>{heroName}</span>
        </div>

        {!playerCollapsed ? (
          activeBgmUrl ? (
            <>
              <div style={progressBarStyle}>
                <div style={progressFillStyle(progressRatio)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => audioManager.toggle()} style={actionButtonStyle}>
                  {audioState.isPlaying ? '일시정지' : '재생'}
                </button>
                <button type="button" onClick={() => audioManager.stop()} style={actionButtonStyle}>
                  처음으로
                </button>
                <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 12 }}>
                  {formatTime(audioState.progress)} / {formatTime(audioState.duration || durationHint)}
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 12 }}>등록된 브금이 없습니다.</div>
          )
        ) : null}
      </div>
    </div>
  );
}

const shellStyle = collapsed => ({
  borderRadius: 18,
  padding: collapsed ? '10px 12px' : '12px 14px',
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(96,165,250,0.24)',
  boxShadow: '0 24px 60px -34px rgba(15,23,42,0.92)',
  backdropFilter: 'blur(14px)',
  display: 'grid',
  gap: collapsed ? 0 : 10,
});

const miniButtonStyle = {
  appearance: 'none',
  border: '1px solid rgba(148,163,184,0.22)',
  borderRadius: 14,
  padding: '6px 12px',
  background: 'rgba(15,23,42,0.68)',
  color: '#bae6fd',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const actionButtonStyle = {
  appearance: 'none',
  border: '1px solid rgba(148,163,184,0.22)',
  borderRadius: 12,
  padding: '8px 12px',
  background: 'rgba(30,41,59,0.74)',
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const progressBarStyle = {
  height: 8,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'rgba(51,65,85,0.82)',
};

const progressFillStyle = ratio => ({
  width: `${Math.max(0, Math.min(1, ratio || 0)) * 100}%`,
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #38bdf8 0%, #7dd3fc 100%)',
});
