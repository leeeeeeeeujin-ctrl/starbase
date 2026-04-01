'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import CharacterRouteHud from './CharacterRouteHud';

export default function CharacterRouteLayout({
  hero,
  activeTab = 'character',
  children,
}) {
  const router = useRouter();
  const startRef = useRef(null);
  const [showDesktopNav, setShowDesktopNav] = useState(false);
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
    if (event.target?.closest?.('[data-swipe-lock="true"]')) {
      startRef.current = null;
      return;
    }
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateDesktopNav = () => {
      setShowDesktopNav(window.innerWidth >= 980);
    };
    updateDesktopNav();
    window.addEventListener('resize', updateDesktopNav);
    return () => {
      window.removeEventListener('resize', updateDesktopNav);
    };
  }, []);

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
          padding: '18px 14px 176px',
        }}
      >
        <main
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            display: 'grid',
            gap: 14,
          }}
        >
          {showDesktopNav && heroId ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <Link href={`/lobby?heroId=${heroId}`} style={desktopNavButtonStyle}>
                로비
              </Link>
              <Link href={`/character/${heroId}`} style={desktopNavButtonStyle}>
                캐릭터
              </Link>
              <Link href={`/character/${heroId}/agent`} style={desktopNavButtonStyle}>
                캐릭터 AI
              </Link>
              <Link href={`/character/${heroId}/play`} style={desktopNavButtonStyle}>
                게임 시작
              </Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <CharacterRouteHud hero={hero} />
    </div>
  );
}

const desktopNavButtonStyle = {
  textDecoration: 'none',
  padding: '10px 16px',
  borderRadius: 999,
  background: 'rgba(2, 6, 23, 0.68)',
  color: '#e2e8f0',
  fontSize: 13,
  fontWeight: 800,
  border: '1px solid rgba(148, 163, 184, 0.28)',
  boxShadow: '0 18px 44px -30px rgba(15,23,42,0.72)',
  backdropFilter: 'blur(10px)',
};
