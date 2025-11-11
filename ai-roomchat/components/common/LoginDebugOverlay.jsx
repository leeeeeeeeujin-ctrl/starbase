"use client";

import { useSupabaseSessionToken } from '../workspace/hooks/useSupabaseSessionToken';

function formatUserLabel(user) {
  if (!user) return 'anonymous';
  if (user.email) return user.email;
  if (user.id) return `${user.id.slice(0, 6)}…${user.id.slice(-4)}`;
  return 'anonymous';
}

export default function LoginDebugOverlay({ scope = 'global' }) {
  const { user, token, loading, error } = useSupabaseSessionToken();

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 1000,
        pointerEvents: 'none',
        background: 'rgba(2, 6, 23, 0.9)',
        border: '1px solid rgba(148,163,184,0.3)',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 11,
        color: '#e2e8f0',
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Login Debug</div>
      <div style={{ color: '#94a3b8' }}>scope: {scope}</div>
      <div>{loading ? 'loading session…' : formatUserLabel(user)}</div>
      <div style={{ color: '#94a3b8' }}>
        token: {token ? `${token.slice(0, 6)}…` : 'missing'}
      </div>
      {error ? (
        <div style={{ color: '#fca5a5' }}>err: {error.message || String(error)}</div>
      ) : null}
    </div>
  );
}
