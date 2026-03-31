'use client';

import { useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const TABS = [
  { key: 'overview', label: '캐릭터', href: heroId => `/character/${heroId}` },
  { key: 'agent', label: '캐릭터 AI', href: heroId => `/character/${heroId}/agent` },
  { key: 'play', label: '통계·게임', href: heroId => `/character/${heroId}/play` },
];

export default function CharacterRouteLayout({
  hero,
  activeTab = 'overview',
  title,
  subtitle,
  children,
}) {
  const router = useRouter();
  const startRef = useRef(null);
  const heroId = hero?.id ? String(hero.id) : '';
  const currentIndex = Math.max(
    0,
    TABS.findIndex(tab => tab.key === activeTab)
  );
  const backgroundImage = hero?.background_url || '';

  const navigateByOffset = useCallback(
    offset => {
      const nextIndex = currentIndex + offset;
      if (nextIndex < 0 || nextIndex >= TABS.length) return;
      const nextTab = TABS[nextIndex];
      if (!nextTab || !heroId) return;
      router.push(nextTab.href(heroId));
    },
    [currentIndex, heroId, router]
  );

  const handleTouchStart = useCallback(event => {
    const touch = event.touches?.[0];
    if (!touch) return;
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    event => {
      if (!startRef.current) return;
      const touch = event.changedTouches?.[0];
      if (!touch) {
        startRef.current = null;
        return;
      }
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      startRef.current = null;

      if (Math.abs(dx) < 54 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (dx < 0) {
        navigateByOffset(1);
      } else {
        navigateByOffset(-1);
      }
    },
    [navigateByOffset]
  );

  const tabItems = useMemo(
    () =>
      TABS.map(tab => ({
        ...tab,
        href: tab.href(heroId),
        active: tab.key === activeTab,
      })),
    [activeTab, heroId]
  );

  return (
    <div
      style={{
        minHeight: '100svh',
        background: '#020617',
        color: '#e2e8f0',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: backgroundImage
            ? `linear-gradient(180deg, rgba(2,6,23,0.3) 0%, rgba(2,6,23,0.88) 60%, rgba(2,6,23,0.98) 100%), url(${backgroundImage})`
            : 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: backgroundImage ? 'saturate(1.06)' : 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, width: 'min(920px, 100%)', margin: '0 auto', padding: '16px 14px 110px' }}>
        <header
          style={{
            display: 'grid',
            gap: 12,
            padding: '14px 16px',
            borderRadius: 24,
            background: 'rgba(2, 6, 23, 0.74)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            boxShadow: '0 30px 70px -50px rgba(15, 23, 42, 0.9)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/roster"
              style={{
                textDecoration: 'none',
                color: '#cbd5e1',
                fontSize: 13,
                fontWeight: 700,
                padding: '8px 12px',
                borderRadius: 999,
                background: 'rgba(15,23,42,0.78)',
                border: '1px solid rgba(148,163,184,0.24)',
              }}
            >
              ← 로스터
            </Link>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tabItems.map(tab => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  style={{
                    textDecoration: 'none',
                    padding: '8px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 800,
                    color: tab.active ? '#082f49' : '#cbd5e1',
                    background: tab.active ? '#7dd3fc' : 'rgba(15,23,42,0.72)',
                    border: tab.active
                      ? '1px solid rgba(125,211,252,0.88)'
                      : '1px solid rgba(148,163,184,0.24)',
                  }}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 22, lineHeight: 1.25 }}>{title}</strong>
            <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{subtitle}</span>
          </div>
        </header>

        <main
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            marginTop: 14,
            display: 'grid',
            gap: 14,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
