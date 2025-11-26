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
}) {
  const cfg = useMemo(() => normalizeShellConfig(shellConfig), [shellConfig]);
  const layoutPreset = useMemo(() => resolveLayoutPreset(cfg), [cfg]);

  const headerEnabled =
    cfg?.panels?.header?.enabled !== false; // 기본 on, 명시적으로 false일 때만 비활성화

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
