// pages/auth-callback.js  ← 방법 B를 선택한 예시
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { handleOAuthCallback } from '../lib/auth';

export default function AuthCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState('로그인 처리 중…');

  useEffect(() => {
    let mounted = true;

    async function run() {
      const href = typeof window !== 'undefined' ? window.location.href : '';
      const result = await handleOAuthCallback({ href });

      if (!mounted) return;

      if (result.status === 'redirect') {
        setMsg(result.message);
        router.replace(result.path);
        return;
      }

      setMsg(result.message);
      setTimeout(() => {
        if (!mounted) return;
        router.replace(result.retryPath);
      }, 1200);
    }

    if (mounted) run();
    return () => {
      mounted = false;
    };
  }, [router]);

  return <div style={{ padding: 24 }}>{msg}</div>;
}
