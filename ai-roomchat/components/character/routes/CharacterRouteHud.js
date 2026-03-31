'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { getHeroAudioManager } from '@/lib/audio/heroAudioManager';

export default function CharacterRouteHud({ hero, activeKey = 'character' }) {
  const audioManager = useMemo(() => getHeroAudioManager(), []);
  const [audioState, setAudioState] = useState(() => audioManager.getState());
  const [playerCollapsed, setPlayerCollapsed] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(true);

  useEffect(() => audioManager.subscribe(setAudioState), [audioManager]);

  const heroId = hero?.id || null;
  const heroName = hero?.name || '캐릭터';
  const activeBgmUrl = hero?.bgm_url || null;
  const durationHint = hero?.bgm_duration_seconds || 0;

  useEffect(() => {
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
  const navHeroId = heroId ? String(heroId) : '';
  const items = [
    { key: 'lobby', label: '로비', href: navHeroId ? `/lobby?heroId=${navHeroId}` : '/lobby' },
    { key: 'character', label: '캐릭터', href: navHeroId ? `/character/${navHeroId}` : '/roster' },
    { key: 'agent', label: '캐릭터 AI', href: navHeroId ? `/character/${navHeroId}/agent` : '/roster' },
    { key: 'play', label: '게임 시작', href: navHeroId ? `/character/${navHeroId}/play` : '/roster' },
  ];

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
        bottom: 12,
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100% - 24px))',
        zIndex: 25,
        display: 'grid',
        gap: 10,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          borderRadius: 18,
          padding: playerCollapsed ? '10px 12px' : '12px 14px',
          background: 'rgba(15,23,42,0.82)',
          border: '1px solid rgba(96,165,250,0.24)',
          boxShadow: '0 24px 60px -34px rgba(15,23,42,0.92)',
          backdropFilter: 'blur(14px)',
          display: 'grid',
          gap: playerCollapsed ? 0 : 10,
        }}
      >
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

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setDockCollapsed(prev => !prev)} style={miniButtonStyle}>
            {dockCollapsed ? '▲ 패널 펼치기' : '▼ 패널 접기'}
          </button>
        </div>
        {!dockCollapsed ? (
          <div
            style={{
              borderRadius: 24,
              padding: '16px 16px 18px',
              background: 'rgba(15,23,42,0.86)',
              border: '1px solid rgba(96,165,250,0.24)',
              boxShadow: '0 30px 80px -48px rgba(15,23,42,0.94)',
              backdropFilter: 'blur(16px)',
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <strong style={{ color: '#e2e8f0', fontSize: 15 }}>이동 패널</strong>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                캐릭터를 기준으로 로비, AI 대화, 게임 시작 화면을 오갑니다.
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {items.map(item => {
                const active = item.key === activeKey;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    style={{
                      textDecoration: 'none',
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: active ? 'rgba(125,211,252,0.18)' : 'rgba(30,41,59,0.74)',
                      border: active
                        ? '1px solid rgba(125,211,252,0.36)'
                        : '1px solid rgba(148,163,184,0.18)',
                      color: active ? '#bae6fd' : '#e2e8f0',
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
