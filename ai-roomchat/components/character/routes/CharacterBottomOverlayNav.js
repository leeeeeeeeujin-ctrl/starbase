'use client';

import Link from 'next/link';

const ITEMS = [
  { key: 'lobby', label: '로비', href: heroId => (heroId ? `/lobby?heroId=${heroId}` : '/lobby') },
  { key: 'character', label: '캐릭터', href: heroId => (heroId ? `/character/${heroId}` : '/roster') },
  { key: 'agent', label: '캐릭터 AI', href: heroId => (heroId ? `/character/${heroId}/agent` : '/roster') },
  { key: 'play', label: '게임 시작', href: heroId => (heroId ? `/character/${heroId}/play` : '/roster') },
];

export default function CharacterBottomOverlayNav({ heroId = '', activeKey = 'character', fixed = true }) {
  return (
    <nav
      aria-label="캐릭터 이동"
      style={{
        position: fixed ? 'fixed' : 'relative',
        left: fixed ? '50%' : 'auto',
        bottom: fixed ? 12 : 'auto',
        transform: fixed ? 'translateX(-50%)' : 'none',
        width: fixed ? 'min(560px, calc(100% - 24px))' : '100%',
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
          padding: 10,
          borderRadius: 24,
          background: 'rgba(15,23,42,0.86)',
          border: '1px solid rgba(96,165,250,0.26)',
          boxShadow: '0 30px 70px -42px rgba(15,23,42,0.92)',
          backdropFilter: 'blur(18px)',
        }}
      >
        {ITEMS.map(item => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href(heroId)}
              style={{
                textDecoration: 'none',
                minHeight: 46,
                borderRadius: 18,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1.2,
                color: active ? '#082f49' : '#dbeafe',
                background: active ? '#7dd3fc' : 'rgba(30,41,59,0.74)',
                border: active
                  ? '1px solid rgba(125,211,252,0.92)'
                  : '1px solid rgba(148,163,184,0.2)',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
