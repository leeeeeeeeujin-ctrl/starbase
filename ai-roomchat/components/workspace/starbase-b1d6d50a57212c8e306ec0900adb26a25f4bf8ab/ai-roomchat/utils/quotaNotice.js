"use client";

// Lightweight global notifier for storage quota exceeded.
// Components can render a listener to show a nice UI. Call showQuotaExceeded() anywhere.

const EVENT = 'app:quotaExceeded';

export function showQuotaExceeded() {
  if (typeof window === 'undefined') return;
  try {
    const detail = {};
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  } catch {
    // no-op
  }
}

export function subscribeQuotaExceeded(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (e) => {
    try { handler(e?.detail || {}); } catch {}
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
