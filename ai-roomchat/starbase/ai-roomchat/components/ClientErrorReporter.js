import { useEffect } from 'react';

import { addClientErrorDebugEvent } from '@/lib/debugCollector';

const MIN_DISPATCH_INTERVAL_MS = 8_000;
const MAX_QUEUE_SIZE = 8;
const DEDUPE_WINDOW_MS = 15_000;

export default function ClientErrorReporter() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const storageKey = 'rank_error_session_id';
    let sessionId = null;

    try {
      sessionId = window.localStorage.getItem(storageKey);
    } catch (error) {
      sessionId = null;
    }

    if (!sessionId) {
      const generator =
        typeof window.crypto !== 'undefined' && typeof window.crypto.randomUUID === 'function'
          ? () => window.crypto.randomUUID()
          : () => Math.random().toString(36).slice(2);
      sessionId = generator();
      try {
        window.localStorage.setItem(storageKey, sessionId);
      } catch (error) {
        // Ignore write failures (e.g. private mode)
      }
    }

    const queue = [];
    const dedupeCache = new Map();
    let pendingTimeout = null;
    let sending = false;
    let lastSentAt = 0;

    const scheduleFlush = (delay = 0) => {
      if (pendingTimeout) {
        return;
      }
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        flush();
      }, delay);
    };

    const flush = () => {
      if (sending || queue.length === 0) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastSentAt;
      if (elapsed < MIN_DISPATCH_INTERVAL_MS) {
        scheduleFlush(MIN_DISPATCH_INTERVAL_MS - elapsed);
        return;
      }

      const payload = queue.shift();
      if (!payload) {
        return;
      }

      sending = true;

      const body = JSON.stringify(payload);
      const finish = () => {
        sending = false;
        lastSentAt = Date.now();
        if (queue.length > 0) {
          scheduleFlush(MIN_DISPATCH_INTERVAL_MS);
        }
      };

      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([body], { type: 'application/json' });
          const sent = navigator.sendBeacon('/api/errors/report', blob);
          if (sent) {
            finish();
            return;
          }
        } catch (error) {
          // Fall back to fetch
        }
      }

      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
        .catch(() => {})
        .finally(finish);
    };

    const enqueue = entry => {
      const fingerprint = `${entry.message}|${entry.stack?.slice(0, 180) || ''}`;
      const now = Date.now();
      const lastSeen = dedupeCache.get(fingerprint);
      if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
        return;
      }
      dedupeCache.set(fingerprint, now);

      if (queue.length >= MAX_QUEUE_SIZE) {
        queue.shift();
      }

      queue.push(entry);
      scheduleFlush();
    };

    const normaliseStack = stack => {
      if (typeof stack === 'string') {
        return stack.slice(0, 4000);
      }
      if (stack && typeof stack.message === 'string') {
        return String(stack.message);
      }
      return null;
    };

    const handleError = event => {
      if (!event) return;
      const message = typeof event.message === 'string' ? event.message : 'Unhandled error';
      const stack = event.error?.stack || normaliseStack(event.error);
      const context = {
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
      };

      const payload = {
        sessionId,
        message,
        stack,
        context: { ...context, type: 'error' },
        path: window.location?.href || null,
        severity: 'error',
      };

      addClientErrorDebugEvent(message, {
        details: context,
        payload,
        meta: { origin: 'window-error' },
      });

      enqueue(payload);
    };

    const handleRejection = event => {
      if (!event) return;
      const reason = event.reason;
      const message =
        typeof reason === 'string' ? reason : reason?.message || 'Unhandled rejection';
      const stack = reason?.stack || normaliseStack(reason);

      const payload = {
        sessionId,
        message: String(message).slice(0, 1024),
        stack,
        context: { type: 'unhandledrejection' },
        path: window.location?.href || null,
        severity: 'error',
      };

      addClientErrorDebugEvent(String(message).slice(0, 1024), {
        details: { stack },
        payload,
        meta: { origin: 'unhandledrejection' },
      });

      enqueue(payload);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      if (pendingTimeout) {
        window.clearTimeout(pendingTimeout);
      }
    };
  }, []);

  return null;
}
