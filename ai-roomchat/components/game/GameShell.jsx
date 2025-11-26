"use client";

import React, { useMemo } from 'react';
import MainGameMobileUI from './MainGameMobileUI.jsx';

function normalizeShellConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return raw;
}

function resolveLayoutPreset(cfg) {
  const preset = cfg?.layoutPreset;
  if (preset === 'stacked' || preset === 'standard') return preset;
  return 'standard';
}

export default function GameShell({
  template,
  runtimeBus,
  runtimeFeatures = [],
  shellConfig = null,
  mode = 'play', // 'play' | 'rank' 등
  viewerHero = null, // 선택: 랭크에서 현재 플레이어 캐릭터 요약
}) {
  const cfg = useMemo(() => normalizeShellConfig(shellConfig), [shellConfig]);
  const layoutPreset = useMemo(() => resolveLayoutPreset(cfg), [cfg]);

  const headerEnabled =
    cfg?.panels?.header?.enabled !== false; // 기본 on, 명시적으로 false일 때만 비활성화

  const viewerEnabled =
    cfg?.panels?.viewer?.enabled !== false && viewerHero && typeof viewerHero === 'object';

  const title =
    (cfg?.header && cfg.header.title) ||
    (template && template.title) ||
    (template && template.name) ||
    '게임';

  const subtitle =
    (cfg?.header && cfg.header.subtitle) ||
    (template && template.description) ||
    '';

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          width: '100%',
          maxWidth: layoutPreset === 'stacked' ? 720 : 1080,
        }}
      >
      {headerEnabled && (
        <header
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.8)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb' }}>{title}</div>
              {subtitle ? (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{subtitle}</div>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>
              {mode === 'rank' ? 'RANK SESSION' : 'PLAY'}
            </div>
          </div>
        </header>
      )}

      {viewerEnabled && (
        <section
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.4)',
            background:
              'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 60%, rgba(30,64,175,0.35) 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {viewerHero.avatar_url ? (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                overflow: 'hidden',
                flexShrink: 0,
                border: '1px solid rgba(148,163,184,0.65)',
              }}
            >
              <img
                src={viewerHero.avatar_url}
                alt={viewerHero.name || '캐릭터'}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {viewerHero.name || '이름 없는 영웅'}
            </div>
            {viewerHero.role ? (
              <div style={{ fontSize: 12, color: '#93c5fd' }}>{viewerHero.role}</div>
            ) : null}
            {viewerHero.tagline ? (
              <div
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {viewerHero.tagline}
              </div>
            ) : null}
          </div>
        </section>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: 16,
          border: '1px solid rgba(30,64,175,0.55)',
          background: 'rgba(15,23,42,0.85)',
          overflow: 'hidden',
        }}
      >
        <MainGameMobileUI
          template={template}
          runtimeBus={runtimeBus}
          runtimeFeatures={runtimeFeatures}
        />
      </div>
      </div>
    </div>
  );
}
