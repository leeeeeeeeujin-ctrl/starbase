'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

import CharacterBottomOverlayNav from './CharacterBottomOverlayNav';

export default function CharacterRouteLayout({
  hero,
  activeTab = 'character',
  title,
  subtitle,
  children,
}) {
  const router = useRouter();
  const startRef = useRef(null);
  const heroId = hero?.id ? String(hero.id) : '';
  const backgroundImage = hero?.background_url || hero?.image_url || '';

  const resolveSwipeHref = useCallback(
    direction => {
      if (!heroId) return '';
      if (activeTab === 'play' && direction === 'right') return `/character/${heroId}`;
      if (activeTab === 'agent' && direction === 'right') return `/character/${heroId}`;
      return '';
    },
    [activeTab, heroId]
  );

  const handleTouchStart = useCallback(event => {
    const touch = event.touches?.[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
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
      const href = dx < 0 ? resolveSwipeHref('left') : resolveSwipeHref('right');
      if (href) {
        router.push(href);
      }
    },
    [resolveSwipeHref, router]
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
            ? `linear-gradient(180deg, rgba(2,6,23,0.36) 0%, rgba(2,6,23,0.88) 58%, rgba(2,6,23,0.98) 100%), url(${backgroundImage})`
            : 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: backgroundImage ? 'saturate(1.04)' : 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(720px, 100%)',
          margin: '0 auto',
          padding: '18px 14px 112px',
        }}
      >
        <header
          style={{
            display: 'grid',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 24,
            background: 'rgba(2, 6, 23, 0.72)',
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
            {heroId ? (
              <Link
                href={`/character/${heroId}`}
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
                캐릭터로
              </Link>
            ) : null}
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

      <CharacterBottomOverlayNav heroId={heroId} activeKey={activeTab} />
    </div>
  );
}
