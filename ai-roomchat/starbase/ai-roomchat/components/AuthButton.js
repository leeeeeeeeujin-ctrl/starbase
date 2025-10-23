'use client';

import React, { useCallback, useState } from 'react';

import { startGoogleOAuth } from '../lib/auth';
import { logError } from '../lib/utils/debugTool';

export default function AuthButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    if (pending) return;
    setPending(true);
    try {
      const origin = window.location.origin;
      const result = await startGoogleOAuth({ origin });

      if (result.status === 'redirect') {
        window.location.href = result.url;
        return;
      }

      alert(`로그인 실패: ${result.message}`);
    } catch (error) {
      logError(error, 'AuthButton: signIn error');
      alert('로그인 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  const handleClick = useCallback(() => {
    if (!pending) {
      signIn();
    }
  }, [pending]);

  function handleMouseEnter(event) {
    event.currentTarget.style.transform = 'translateY(-2px)';
    event.currentTarget.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)';
  }

  function handleMouseLeave(event) {
    event.currentTarget.style.transform = 'translateY(0)';
    event.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)';
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        padding: '14px 40px',
        borderRadius: 999,
        backgroundColor: '#040507',
        color: '#ffffff',
        fontSize: '18px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        fontFamily: '"Noto Sans KR", sans-serif',
        opacity: pending ? 0.65 : 1,
        pointerEvents: pending ? 'none' : 'auto',
      }}
    >
      신경망 접속
    </button>
  );
}
